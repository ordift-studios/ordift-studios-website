#!/usr/bin/env python3
"""LOCAL ONLY (never Production). Real concurrency test of public.confirm_ordinary_booking() on the Production-shaped scratch database (p4_e2e; build it with rehearse_production_shape.sh first).
The proposal is applied FOR REAL (committed) so that several separate database sessions can race; every session starts at the same server-side instant (pg_sleep_until). Rounds:
  A. two DIFFERENT enquiries, SAME assigned person, OVERLAPPING time           -> exactly one confirmation succeeds, the other is refused as a firm conflict
  B. three enquiries, same person, overlapping                                -> exactly one succeeds
  C. two enquiries, same person, NON-overlapping                              -> both succeed (the lock does not over-block)
  D. the SAME enquiry submitted twice at once                                 -> exactly one succeeds, the other 'already_confirmed'
  E. two different people, same time                                          -> both succeed
Afterwards the committed rows are cleared (triggers off) and the proposal is rolled back with its own rollback script. Exit code 0 only if every round behaves."""
import subprocess, sys, time, uuid, re, concurrent.futures as cf, os
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", "p4_e2e"); D = os.path.dirname(os.path.abspath(__file__))
def psql(sql, check=True):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:400])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
strip = lambda f: "\n".join(l for l in open(os.path.join(D, f)).read().splitlines() if not re.match(r"^(begin|commit);$", l))
SA, P1, P2 = "00000000-0000-4000-8000-0000000000a0", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3"
ENT = "44444444-4444-4444-8444-444444444401"; RUN = uuid.uuid4().hex[:6]   # unique references per run, so a re-run never collides with earlier committed fixtures
if psql("select to_regclass('public.booking_rule_settings') is not null")[0] == "t":     # a previous run died half-way: remove what it left (rows with triggers off, then the proposal's own rollback)
    print("removing leftovers of an earlier run ...")
    psql("set session_replication_role = replica; delete from public.enquiry_booking_segments; delete from public.enquiry_booking_confirmations; delete from public.booking_rule_settings; set session_replication_role = origin;")
    psql("begin;\n" + strip("ROLLBACK_booking_confirmation.sql") + "\ncommit;")
print("applying the proposal (committed) and the fixtures ...")
psql("begin;\n" + strip("PROPOSAL_booking_confirmation.sql") + "\ncommit;")
psql(f"""set session_replication_role = replica;
insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'cc'||n||'@e2e.test' from generate_series(160,163) n on conflict do nothing;
insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'Conc '||n, 'active' from generate_series(160,163) n on conflict do nothing;
insert into public.user_roles (user_id, role_id) select '{SA}', r.id from public.roles r where r.slug = 'super_admin' on conflict do nothing;
insert into public.booking_rule_settings (version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators, note, created_by)
  select 1, 'provisional', '{{"QAR": 3000, "GHS": 10000, "USD": 800}}'::jsonb, array['videography'], array['exclusivity','multi_day_assignment'], 'concurrency test', '{SA}' where not exists (select 1 from public.booking_rule_settings);
insert into public.employing_entities (id, name, slug, legal_name, registration_type, verification_status, verified_at, verified_by, default_currency, employer_capable, jurisdiction_id)
  select '{ENT}', 'CC Qatar', 'cc-qatar', 'CC QATAR W.L.L.', 'W.L.L.', 'verified', now(), '{SA}', 'QAR', false, j.id from public.employment_jurisdictions j where j.slug = 'qatar' on conflict do nothing;
insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, valid_from, expires_on, issuing_authority, facts, verified_by, verified_at, recorded_by)
  select '{ENT}', v.kind, 'active', v.i, date '2026-10-15', date '2026-10-15', date '2027-10-15', 'MOCI', v.f::jsonb, '{SA}', now(), '{SA}' from (values ('commercial_registration','CR-CC','{{"activities":[{{"code":"742010"}}]}}'),('commercial_permit','PERMIT-CC','{{}}')) v(kind,i,f)
  where not exists (select 1 from public.entity_registrations where employing_entity_id = '{ENT}');
insert into public.entity_signatories (employing_entity_id, full_name, position, authority, legal_capacity, effective_from, recorded_by) select '{ENT}', 'Owner', 'Owner', 'As stated', 'owner', date '2026-01-01', '{SA}' where not exists (select 1 from public.entity_signatories where employing_entity_id = '{ENT}');
set session_replication_role = origin;""")
def mk(n):
    e, q = str(uuid.uuid4()), str(uuid.uuid4())
    psql(f"""set session_replication_role = replica;
insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid) values ('{e}', 'ENQ-CC-{RUN}-{n}', 'c{n}@e2e.test', 'Client {n}', 'photography', 'quotation_sent', 100, 0);
insert into public.client_quotations (id, prospect_name, quotation_reference, currency, total, subtotal, status, issued_at, enquiry_id, created_by, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
  values ('{q}', 'Client {n}', 'ORD-QUO-CC-{RUN}-{n}', 'QAR', 100, 100, 'accepted', now() - interval '2 days', '{e}', '{SA}', now() - interval '1 day', 'staff_recorded', 'Client {n}', 'email', 'synthetic', now() - interval '1 day', '{SA}');
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values ('{SA}', 'client_quotation.issued', 'client_quotation', '{q}', '{{"declaredActivities":["photography"],"contractingEntity":{{"entityId":"{ENT}"}}}}'::jsonb), ('{SA}', 'client_quotation.content_fingerprint', 'client_quotation', '{q}', '{{"contentSha256":"{'a'*64}"}}'::jsonb);
set session_replication_role = origin;""")
    return e, q
def payload(e, q, person, start_h, day="2027-02-01", hours=2):
    seg = f'{{"startsAt":"{day}T{start_h:02d}:00:00Z","endsAt":"{day}T{start_h+hours:02d}:00:00Z","timezone":"Asia/Qatar","kind":"on_site","location":"Doha"}}'
    return f'{{"enquiryId":"{e}","quotationId":"{q}","assignedProfileId":"{person}","segments":[{seg}],"paymentTermsCheck":"consistent"}}'
def attempt(p, go):
    out, err = psql(f"select pg_sleep_until(to_timestamp({go}));\nselect public.confirm_ordinary_booking('{p}'::jsonb, '{SA}')::text;", check=False)
    return "OK" if re.search(r"^[0-9a-f-]{36}$", out.splitlines()[-1] if out else "") else (re.search(r"ordift:[a-z_]+", err).group(0) if re.search(r"ordift:[a-z_]+", err) else "ERR " + err[:80])
def race(payloads):
    go = time.time() + 2.5
    with cf.ThreadPoolExecutor(len(payloads)) as ex: return list(ex.map(lambda p: attempt(p, go), payloads))
bad = []; n = 0
def check(label, res, want_ok, want_other=None):
    ok = res.count("OK") == want_ok and (want_other is None or all(r == want_other for r in res if r != "OK"))
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {res}"); (None if ok else bad.append(label))
for i in range(8):                      # A
    n += 2; (e1, q1), (e2, q2) = mk(n - 1), mk(n); day = f"2027-02-{10+i:02d}"; check(f"A{i} two enquiries, same person, overlapping", race([payload(e1, q1, P1, 6, day), payload(e2, q2, P1, 7, day)]), 1, "ordift:booking_overlap_not_overridable")
for i in range(4):                      # B
    ps = []
    for k, (h, d) in enumerate([(12, 4), (13, 2), (14, 3)]): n += 1; e, q = mk(n); ps.append(payload(e, q, P1, h, f"2027-03-{1+i:02d}", d))   # 12-16, 13-15, 14-17: every pair overlaps
    check(f"B{i} three enquiries, same person, mutually overlapping", race(ps), 1)
for i in range(4):                      # C
    n += 2; (e1, q1), (e2, q2) = mk(n - 1), mk(n); day = f"2027-04-{1+i:02d}"
    check(f"C{i} same person, NON-overlapping", race([payload(e1, q1, P1, 6).replace("2027-02-01", day), payload(e2, q2, P1, 10).replace("2027-02-01", day)]), 2)
for i in range(5):                      # D
    n += 1; e, q = mk(n); p = payload(e, q, P2, 6).replace("2027-02-01", f"2027-05-{1+i:02d}")
    check(f"D{i} the same enquiry submitted twice", race([p, p]), 1, "ordift:booking_already_confirmed")
for i in range(4):                      # E
    n += 2; (e1, q1), (e2, q2) = mk(n - 1), mk(n); day = f"2027-06-{1+i:02d}"
    check(f"E{i} two different people, same time", race([payload(e1, q1, P1, 9).replace("2027-02-01", day), payload(e2, q2, P2, 9).replace("2027-02-01", day)]), 2)
# data integrity: no person is ever double-booked among CURRENT confirmed bookings
dup, _ = psql("""select count(*) from public.enquiry_booking_confirmations a join public.enquiry_booking_segments sa on sa.confirmation_id = a.id
  join public.enquiry_booking_confirmations b on b.assigned_profile_id = a.assigned_profile_id and b.id <> a.id and b.enquiry_id <> a.enquiry_id
  join public.enquiry_booking_segments sb on sb.confirmation_id = b.id and tstzrange(sa.starts_at, sa.ends_at) && tstzrange(sb.starts_at, sb.ends_at)
 where a.kind <> 'cancelled' and b.kind <> 'cancelled' and a.version = (select max(version) from public.enquiry_booking_confirmations x where x.enquiry_id = a.enquiry_id) and b.version = (select max(version) from public.enquiry_booking_confirmations x where x.enquiry_id = b.enquiry_id)""")
print(f"{'PASS' if dup == '0' else 'FAIL'}  integrity: overlapping current confirmations for one person = {dup}"); (None if dup == "0" else bad.append("integrity"))
total, _ = psql("select count(*) from public.enquiry_booking_confirmations"); print("confirmation rows written during the test:", total)
print("cleaning up (rows cleared with triggers off, then the proposal's own rollback) ...")
psql("set session_replication_role = replica; delete from public.enquiry_booking_segments; delete from public.enquiry_booking_confirmations; delete from public.booking_rule_settings; set session_replication_role = origin;")
psql("begin;\n" + strip("ROLLBACK_booking_confirmation.sql") + "\ncommit;")
gone, _ = psql("select to_regclass('public.enquiry_booking_confirmations') is null and to_regproc('public.confirm_ordinary_booking') is null")
print("rollback removed everything:", gone)
print("CONCURRENCY REHEARSAL " + ("PASSED" if not bad and gone == "t" else "FAILED: " + ", ".join(bad))); sys.exit(0 if not bad and gone == "t" else 1)
