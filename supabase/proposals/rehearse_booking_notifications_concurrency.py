#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses the walkthrough database p4_e2e). Race test of the booking notification outbox on a DISPOSABLE copy of the lab database (rehearse_booking_notifications.sh runs it).
The proposal is applied FOR REAL (committed) on the copy so separate sessions can race; every session starts at the same server-side instant (pg_sleep_until). Rounds, each repeated:
  A. ten sessions claim the SAME pending job                       -> exactly ONE wins (a message cannot be sent twice)
  B. ten sessions claim as a staff RETRY of the same FAILED job    -> exactly ONE wins
  C. a retry racing the original claim of a stale processing job   -> exactly ONE wins
  D. two sessions confirm the SAME enquiry at once                 -> one confirmation, therefore exactly one pair of jobs
  E. a confirmation racing a payment verification on the same enquiry -> the jobs belong to the confirmation only; verification creates none
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
psql("drop table if exists public.booking_notification_jobs cascade;") if psql("select to_regclass('public.booking_notification_jobs') is not null")[0] == "t" else None
psql("begin;\n" + strip("PROPOSAL_booking_notifications.sql") + "\ncommit;")
ent = psql("select id from public.employing_entities where slug = 'wt-qatar'")[0]; cl = psql("select id from public.profiles where full_name = 'JRN Qatar Client' limit 1")[0]
acct = psql("select id from public.bank_accounts where country = 'QA' limit 1")[0]
n = [0]
def mk(pay=False):
    n[0] += 1; ref = f"ENQ-NJC-{os.getpid()}-{n[0]}"
    out, _ = psql(f"""set session_replication_role = replica;
insert into public.enquiries (id, reference_number, user_id, email, full_name, service, crm_stage, amount_due, amount_paid, is_test, payment_country) values (gen_random_uuid(), '{ref}', '{cl}', 'njc{n[0]}@e2e.test', 'NJC', 'photography', 'quotation_sent', 100, 0, true, 'QA');
insert into public.client_quotations (id, prospect_name, quotation_reference, currency, total, subtotal, usd_total, status, issued_at, enquiry_id, created_by, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
  select gen_random_uuid(), 'NJC', 'ORD-QUO-{ref}', 'USD', 100, 100, 100, 'accepted', now() - interval '2 days', e.id, '{SA}', now() - interval '1 day', 'staff_recorded', 'NJC', 'email', 'synthetic', now() - interval '1 day', '{SA}' from public.enquiries e where e.reference_number = '{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.issued', 'client_quotation', q.id::text, jsonb_build_object('declaredActivities', jsonb_build_array('photography'), 'contractingEntity', jsonb_build_object('entityId', '{ent}')) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.content_fingerprint', 'client_quotation', q.id::text, jsonb_build_object('contentSha256', repeat('c', 64)) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
{"insert into public.payments (id, record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, amount_collected, settlement_currency, payment_type, payment_method, status, provider, submitted_at, receiving_bank_account_id) select gen_random_uuid(), 'PAY-NJC-' || substr(gen_random_uuid()::text, 1, 10), 'enquiry', e.id::text, '" + cl + "', '" + cl + "', 100, 'QAR', 3.64, 'ordift', now(), 364, 364, 'QAR', 'full', 'bank_transfer', 'awaiting_verification', 'bank_transfer', now(), '" + acct + "' from public.enquiries e where e.reference_number = '" + ref + "';" if pay else ""}
set session_replication_role = origin;
select e.id || '|' || q.id from public.enquiries e join public.client_quotations q on q.enquiry_id = e.id where e.reference_number = '{ref}';""")
    e, q = out.splitlines()[-1].split("|"); return e, q
def payload(e, q, day):
    return f'{{"enquiryId":"{e}","quotationId":"{q}","assignedProfileId":"{STAFF}","segments":[{{"startsAt":"{day}T09:00:00Z","endsAt":"{day}T11:00:00Z","timezone":"Asia/Qatar","kind":"on_site","location":"Doha"}}],"paymentTermsCheck":"consistent"}}'
def when(): return psql("select (clock_timestamp() + interval '2.5 seconds')::text")[0]
def claim(conf, aud, retry, t):
    out, err = psql(f"select pg_sleep_until(timestamptz '{t}'); select count(*) from public.claim_booking_notification_job('{conf}', '{aud}', {str(retry).lower()});", check=False)
    return int(out.splitlines()[-1]) if out and not err else -1
def confirm(e, q, day, t):
    out, err = psql(f"select pg_sleep_until(timestamptz '{t}'); select public.confirm_ordinary_booking('{payload(e, q, day)}'::jsonb, '{SA}')::text;", check=False)
    return "OK" if re.search(r"[0-9a-f-]{36}$", out) else (re.search(r"ordift:([a-z_]+)", err).group(1) if re.search(r"ordift:([a-z_]+)", err) else "ERR " + err[:100])
R = int(os.environ.get("ROUNDS", "10")); badA = badB = badC = badD = badE = 0
for i in range(R):
    e, q = mk(); day = f"2027-04-{(i % 27) + 1:02d}"; day2 = f"2027-05-{(i % 27) + 1:02d}"; day3 = f"2027-06-{(i % 27) + 1:02d}"       # one person, three different days: no overlap between the test records
    assert confirm(e, q, day, when()) == "OK"
    conf = psql(f"select id from public.enquiry_booking_confirmations where enquiry_id = '{e}'")[0]
    t = when()
    with cf.ThreadPoolExecutor(10) as ex: wins = sum(x for x in ex.map(lambda _: claim(conf, "client", False, t), range(10)))
    badA += wins != 1
    psql(f"select public.finish_booking_notification_job((select id from public.booking_notification_jobs where confirmation_id = '{conf}' and audience = 'client'), 'failed', 'x', null, '[]'::jsonb, 1, 's', 'b');")
    t = when()
    with cf.ThreadPoolExecutor(10) as ex: wins = sum(x for x in ex.map(lambda _: claim(conf, "client", True, t), range(10)))
    badB += wins != 1
    psql(f"update public.booking_notification_jobs set last_attempted_at = now() - interval '10 minutes' where confirmation_id = '{conf}' and audience = 'client'")
    t = when()
    with cf.ThreadPoolExecutor(2) as ex: wins = sum(x for x in ex.map(lambda r: claim(conf, "client", r, t), [False, True]))
    badC += wins != 1
    e2, q2 = mk(); t = when()
    with cf.ThreadPoolExecutor(2) as ex: res = list(ex.map(lambda _: confirm(e2, q2, day2, t), range(2)))
    jobs = int(psql(f"select count(*) from public.booking_notification_jobs where enquiry_id = '{e2}'")[0])
    badD += not (res.count("OK") == 1 and jobs == 2)
    e3, q3 = mk(pay=True); t = when(); pid = psql(f"select id from public.payments where entity_id = '{e3}'")[0]
    def verify():
        return psql(f"select pg_sleep_until(timestamptz '{t}'); select public.verify_bank_transfer_payment('{pid}', 'approved', '{SA}', 364, 'QAR', 'NJC-' || substr('{pid}', 1, 8), current_date, true, null, null, false);", check=False)[1]
    with cf.ThreadPoolExecutor(2) as ex: fv = ex.submit(verify); fc = ex.submit(confirm, e3, q3, day3, t); verr, cres = fv.result(), fc.result()
    j3 = int(psql(f"select count(*) from public.booking_notification_jobs where enquiry_id = '{e3}'")[0])
    badE += not (j3 == (2 if cres == "OK" else 0) and not verr)
check(badA == 0, f"A. {R} rounds: ten simultaneous claims of one pending job -> exactly one winner")
check(badB == 0, f"B. {R} rounds: ten simultaneous staff retries of one failed job -> exactly one winner")
check(badC == 0, f"C. {R} rounds: original claim vs retry of a stale job -> exactly one winner")
check(badD == 0, f"D. {R} rounds: the same enquiry confirmed twice at once -> one confirmation, one pair of jobs")
check(badE == 0, f"E. {R} rounds: confirmation racing a payment verification -> jobs exist only with the confirmation, verification never creates one")
raise SystemExit(1 if fails else 0)
