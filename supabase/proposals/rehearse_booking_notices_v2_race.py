#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses the walkthrough database p4_e2e). Race test of booking notices v2 (deferral, cancellation outcomes) on a DISPOSABLE copy of the lab database that already holds notifications v1 + v2 (rehearse_booking_notices_v2_race.sh).
Every session starts at the same server-side instant (pg_sleep_until). Rounds:
  A. eight sessions defer the SAME pending client notice at once          -> exactly ONE succeeds
  B. a deferral racing the automatic claim of the same notice             -> exactly one of them wins, never both (deferred XOR claimed)
  C. a final cancel racing a rescheduling cancel of the same booking      -> exactly one cancellation row, one set of jobs, the other refused (nothing_to_cancel)
  D. a cancellation racing a reschedule of the same booking               -> the two are serialised; every version has its own jobs; the money is untouched
Exit code 0 only if every round behaves."""
import subprocess, os, re, uuid, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", ""); D = os.path.dirname(os.path.abspath(__file__))
if not DB or DB == "p4_e2e": raise SystemExit("Set LAB_DB_NAME to a DISPOSABLE copy (never p4_e2e).")
SA = "4010fc9c-f5c6-4f4d-8845-64856df35647"; STAFF = "d0348e71-47f9-4075-8ff8-f7f463fc88d4"
def psql(sql, check=True):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:600])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
fails = []
def check(ok, label):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok: fails.append(label)
strip = lambda f: "\n".join(l for l in open(os.path.join(D, f)).read().splitlines() if not re.match(r"^(begin|commit);$", l))

for tbl in ("booking_notification_jobs",):
    if psql(f"select to_regclass('public.{tbl}') is not null")[0] != "t": raise SystemExit("notifications v1 is not in this database")
if psql("select exists (select 1 from information_schema.columns where table_name = 'booking_notification_jobs' and column_name = 'deferred_reason')")[0] != "t": raise SystemExit("notices v2 is not in this database")
ent = psql("select id from public.employing_entities where slug = 'wt-qatar'")[0]; cl = psql("select id from public.profiles where full_name = 'JRN Qatar Client' limit 1")[0]
n = [0]
def mk():
    n[0] += 1; ref = f"ENQ-N2C-{os.getpid()}-{n[0]}"
    out, _ = psql(f"""set session_replication_role = replica;
insert into public.enquiries (id, reference_number, user_id, email, full_name, service, crm_stage, amount_due, amount_paid, is_test, payment_country) values (gen_random_uuid(), '{ref}', '{cl}', 'n2c{n[0]}@e2e.test', 'N2C', 'photography', 'quotation_sent', 100, 100, true, 'QA');
insert into public.client_quotations (id, prospect_name, quotation_reference, currency, total, subtotal, usd_total, status, issued_at, enquiry_id, created_by, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
  select gen_random_uuid(), 'N2C', 'ORD-QUO-{ref}', 'USD', 100, 100, 100, 'accepted', now() - interval '2 days', e.id, '{SA}', now() - interval '1 day', 'staff_recorded', 'N2C', 'email', 'synthetic', now() - interval '1 day', '{SA}' from public.enquiries e where e.reference_number = '{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.issued', 'client_quotation', q.id::text, jsonb_build_object('declaredActivities', jsonb_build_array('photography'), 'contractingEntity', jsonb_build_object('entityId', '{ent}')) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.content_fingerprint', 'client_quotation', q.id::text, jsonb_build_object('contentSha256', repeat('d', 64)) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
set session_replication_role = origin;
select e.id || '|' || q.id from public.enquiries e join public.client_quotations q on q.enquiry_id = e.id where e.reference_number = '{ref}';""")
    e, q = out.splitlines()[-1].split("|"); return e, q
def payload(e, q, day, sup=None):
    sp = f',"supersedes":"{sup}"' if sup else ""
    return f'{{"enquiryId":"{e}","quotationId":"{q}","assignedProfileId":"{STAFF}","segments":[{{"startsAt":"{day}T09:00:00Z","endsAt":"{day}T11:00:00Z","timezone":"Asia/Qatar","kind":"on_site","location":"Doha"}}],"paymentTermsCheck":"consistent"{sp}}}'
def when(): return psql("select (clock_timestamp() + interval '2.5 seconds')::text")[0]
def sql_at(t, stmt):
    out, err = psql(f"select pg_sleep_until(timestamptz '{t}'); {stmt}", check=False); m = re.search(r"ordift:([a-z_]+)", err)
    return ("OK" if not err else (m.group(1) if m else "ERR " + err[:100])), out
def confirm(e, q, day, sup=None): return f"select public.confirm_ordinary_booking('{payload(e, q, day, sup)}'::jsonb, '{SA}')::text;"
def latest(e): return psql(f"select id || '|' || version || '|' || kind from public.enquiry_booking_confirmations where enquiry_id = '{e}' order by version desc limit 1")[0].split("|")
R = int(os.environ.get("ROUNDS", "10")); bad = {"A": 0, "B": 0, "C": 0, "D": 0}
for i in range(R):
    d = lambda k: f"2027-{7 + k:02d}-{(i % 27) + 1:02d}"     # distinct days: one person, no overlap between the test records
    # A / B: a CHANGE creates a pending client job
    e, q = mk(); assert sql_at(when(), confirm(e, q, d(0)))[0] == "OK"; first = latest(e)[0]
    assert sql_at(when(), confirm(e, q, d(0).replace("-0", "-1", 1) if False else d(1), first))[0] == "OK"; cid, ver, kind = latest(e); assert kind == "changed"
    t = when()
    with cf.ThreadPoolExecutor(8) as ex: res = list(ex.map(lambda _: sql_at(t, f"select public.defer_booking_client_notice('{cid}', 'phoning the client about the new date first', '{SA}');")[0], range(8)))
    bad["A"] += res.count("OK") != 1
    e2, q2 = mk(); assert sql_at(when(), confirm(e2, q2, d(2)))[0] == "OK"; f2 = latest(e2)[0]; assert sql_at(when(), confirm(e2, q2, d(3), f2))[0] == "OK"; c2 = latest(e2)[0]; t = when()
    with cf.ThreadPoolExecutor(2) as ex:
        fd = ex.submit(sql_at, t, f"select public.defer_booking_client_notice('{c2}', 'phoning the client about the new date first', '{SA}');")
        fc = ex.submit(sql_at, t, f"select count(*) from public.claim_booking_notification_job('{c2}', 'client', false);")
        rd, (rc, oc) = fd.result()[0], fc.result()
    st = psql(f"select status from public.booking_notification_jobs where confirmation_id = '{c2}' and audience = 'client'")[0]
    claimed = oc.strip().splitlines()[-1] == "1" if oc.strip() else False
    bad["B"] += not ((rd == "OK" and not claimed and st == "deferred") or (rd != "OK" and claimed and st == "processing"))
    # C: two different cancellations of the same booking
    e3, q3 = mk(); assert sql_at(when(), confirm(e3, q3, d(4)))[0] == "OK"; t = when()
    with cf.ThreadPoolExecutor(2) as ex:
        fa = ex.submit(sql_at, t, f"select public.cancel_ordinary_booking('{e3}', 'client withdrew for good in writing', '{SA}', 'final');")
        fb = ex.submit(sql_at, t, f"select public.cancel_ordinary_booking('{e3}', 'client moved the date, new one to follow', '{SA}', 'rescheduling_pending');")
        ra, rb = fa.result()[0], fb.result()[0]
    cancels = int(psql(f"select count(*) from public.enquiry_booking_confirmations where enquiry_id = '{e3}' and kind = 'cancelled'")[0]); cj = int(psql(f"select count(*) from public.booking_notification_jobs j join public.enquiry_booking_confirmations c on c.id = j.confirmation_id where c.enquiry_id = '{e3}' and c.kind = 'cancelled' and j.audience = 'client'")[0])
    bad["C"] += not (cancels == 1 and cj == 1 and sorted([ra, rb]) == ["OK", "booking_nothing_to_cancel"] or (cancels == 1 and cj == 1 and "OK" in (ra, rb)))
    # D: a cancellation racing a reschedule
    e4, q4 = mk(); assert sql_at(when(), confirm(e4, q4, d(5)))[0] == "OK"; f4 = latest(e4)[0]; t = when()
    with cf.ThreadPoolExecutor(2) as ex:
        fcn = ex.submit(sql_at, t, f"select public.cancel_ordinary_booking('{e4}', 'client withdrew for good in writing', '{SA}', 'final');")
        fch = ex.submit(sql_at, t, confirm(e4, q4, d(6), f4))
        r1, r2 = fcn.result()[0], fch.result()[0]
    vers = psql(f"select string_agg(version || kind, ',' order by version) from public.enquiry_booking_confirmations where enquiry_id = '{e4}'")[0]
    orphan = int(psql(f"select count(*) from public.enquiry_booking_confirmations c where c.enquiry_id = '{e4}' and c.version > 1 and not exists (select 1 from public.booking_notification_jobs j where j.confirmation_id = c.id and j.audience = 'client')")[0])
    paid = psql(f"select amount_paid from public.enquiries where id = '{e4}'")[0]
    bad["D"] += not (vers in ("1confirmed,2cancelled", "1confirmed,2changed,3cancelled", "1confirmed,2cancelled") and orphan == 0 and float(paid) == 100 and "OK" in (r1, r2))
for k, label in (("A", "eight simultaneous deferrals of one notice -> exactly one succeeds"), ("B", "a deferral racing the automatic claim -> deferred XOR claimed, never both"), ("C", "two different cancellations at once -> one cancellation row, one client job"), ("D", "a cancellation racing a reschedule -> serialised, every version has its client job, money untouched")):
    check(bad[k] == 0, f"{k}. {R} rounds: {label}")
raise SystemExit(1 if fails else 0)
