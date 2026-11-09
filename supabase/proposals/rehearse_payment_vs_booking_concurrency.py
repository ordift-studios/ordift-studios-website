#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses the walkthrough database p4_e2e). Payment completion vs booking confirmation, racing on a DISPOSABLE copy of the lab database
(make it with rehearse_payment_vs_booking.sh, which also drops it). Sessions start at the same server-side instant (pg_sleep_until).
Each round has a fully-payable receivable (accepted quotation, payment condition 'full') and a bank payment waiting for verification. Session 1 verifies the payment and then records the paid amount on the
enquiry exactly as the application does (verify_bank_transfer_payment, then the amount-paid sync); session 2 confirms the booking at the SAME instant. Whatever the interleaving:
  * the confirmation either succeeds with the full amount verified, or is refused as booking_payment_pending (fail closed); it is NEVER confirmed on an unpaid record
  * the payment is always credited exactly once (money never depends on the booking)
  * the stage is 'booked' if and only if a confirmation succeeded; a payment never writes a stage or a stage audit row
  * after both finish, a refused confirmation succeeds on retry
Exit code 0 only if every round behaves."""
import subprocess, os, re, time, random, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", "")
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
ent = psql("select id from public.employing_entities where slug = 'wt-qatar'")[0]; acct = psql("select id from public.bank_accounts where country = 'QA' limit 1")[0]
cl = psql("select id from public.profiles where full_name = 'JRN Qatar Client' limit 1")[0]
def mk(n, due=300):
    ref = f"ENQ-PVB-{os.getpid()}-{n}"
    out, _ = psql(f"""set session_replication_role = replica;
insert into public.enquiries (id, reference_number, user_id, email, full_name, service, crm_stage, amount_due, amount_paid, is_test, payment_country) values (gen_random_uuid(), '{ref}', '{cl}', 'pvb{n}@e2e.test', 'PVB {n}', 'photography', 'quotation_sent', {due}, 0, true, 'QA');
insert into public.client_quotations (id, prospect_name, quotation_reference, currency, total, subtotal, usd_total, status, issued_at, enquiry_id, created_by, payment_condition, payment_booking_terms, accepted_at, accepted_via, accepted_by_name, acceptance_channel, acceptance_evidence, acceptance_received_at, acceptance_recorded_by)
  select gen_random_uuid(), 'PVB {n}', 'ORD-QUO-{ref}', 'USD', {due}, {due}, {due}, 'accepted', now() - interval '2 days', e.id, '{SA}', 'full', 'Full payment is required before the booking is confirmed.', now() - interval '1 day', 'staff_recorded', 'PVB', 'email', 'synthetic', now() - interval '1 day', '{SA}' from public.enquiries e where e.reference_number = '{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.issued', 'client_quotation', q.id::text, jsonb_build_object('declaredActivities', jsonb_build_array('photography'), 'contractingEntity', jsonb_build_object('entityId', '{ent}')) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) select '{SA}', 'client_quotation.content_fingerprint', 'client_quotation', q.id::text, jsonb_build_object('contentSha256', repeat('b', 64)) from public.client_quotations q where q.quotation_reference = 'ORD-QUO-{ref}';
insert into public.payments (id, record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, amount_collected, settlement_currency, payment_type, payment_method, status, provider, submitted_at, receiving_bank_account_id)
  select gen_random_uuid(), 'PAY-PVB-' || substr(gen_random_uuid()::text, 1, 10), 'enquiry', e.id::text, '{cl}', '{cl}', {due}, 'QAR', 3.64, 'ordift', now(), round({due} * 3.64, 2), round({due} * 3.64, 2), 'QAR', 'full', 'bank_transfer', 'awaiting_verification', 'bank_transfer', now(), '{acct}' from public.enquiries e where e.reference_number = '{ref}';
set session_replication_role = origin;
select e.id || '|' || q.id || '|' || p.id from public.enquiries e join public.client_quotations q on q.enquiry_id = e.id join public.payments p on p.entity_id = e.id::text where e.reference_number = '{ref}';""")
    e, q, p = out.splitlines()[-1].split("|"); return e, q, p
def pay_session(p, e, due, go):
    out, err = psql(f"""select pg_sleep_until(timestamptz '{go}');
select public.verify_bank_transfer_payment('{p}', 'approved', '{SA}', (select converted_amount from public.payments where id = '{p}'), 'QAR', 'PVB-' || substr('{p}', 1, 8), current_date, true, null, null, false);
update public.enquiries set amount_paid = (select coalesce(sum(reference_amount_usd), 0) from public.payments where entity_type = 'enquiry' and entity_id = '{e}' and status = 'completed'), payment_status = 'Paid' where id = '{e}';""", check=False)
    return "OK" if not err else "ERR " + err[:120]
def book(e, q, go, day, off=0.0):
    pl = f'{{"enquiryId":"{e}","quotationId":"{q}","assignedProfileId":"{STAFF}","segments":[{{"startsAt":"{day}T09:00:00Z","endsAt":"{day}T11:00:00Z","timezone":"Asia/Qatar","kind":"on_site","location":"Doha"}}],"paymentTermsCheck":"consistent"}}'
    out, err = psql(f"select pg_sleep_until(timestamptz '{go}' + interval '{off} seconds'); select public.confirm_ordinary_booking('{pl}'::jsonb, '{SA}')::text;", check=False)
    m = re.search(r"ordift:([a-z_]+)", err); return "OK" if re.search(r"[0-9a-f-]{36}$", out) else (m.group(1) if m else "ERR " + err[:120])
if psql("select to_regprocedure('public.confirm_ordinary_booking(jsonb,uuid)') is not null")[0] != "t": raise SystemExit("the booking functions are not in this database")
ROUNDS = int(os.environ.get("ROUNDS", "12")); outcomes = {"OK": 0, "booking_payment_pending": 0}
for i in range(ROUNDS):
    e, q, p = mk(i); day = f"2027-03-{(i % 27) + 1:02d}"
    go = psql("select (clock_timestamp() + interval '2.5 seconds')::text")[0]
    with cf.ThreadPoolExecutor(2) as ex: fp = ex.submit(pay_session, p, e, 300, go); fb = ex.submit(book, e, q, go, day, round(random.uniform(0.0, 0.35), 3)); rp, rb = fp.result(), fb.result()
    st, paid, pay_status, nconf, nstage = psql(f"""select (select crm_stage::text from public.enquiries where id = '{e}') || '|' || (select amount_paid from public.enquiries where id = '{e}') || '|' || (select status from public.payments where id = '{p}') || '|' ||
      (select count(*) from public.enquiry_booking_confirmations where enquiry_id = '{e}') || '|' || (select count(*) from public.activity_log where action = 'enquiry.stage_change' and entity_id = '{e}');""")[0].split("|")
    ok_book = rb == "OK"
    good = rp == "OK" and pay_status == "completed" and float(paid) == 300 and (rb in ("OK", "booking_payment_pending")) and ((st == "booked") == ok_book) and int(nconf) == (1 if ok_book else 0) and int(nstage) == 0
    outcomes[rb if rb in outcomes else "other"] = outcomes.get(rb, 0) + 1
    if not good: check(False, f"round {i}: payment={rp}/{pay_status} paid={paid} booking={rb} stage={st} confirmations={nconf} stage_audit={nstage}")
    if not ok_book:
        retry = book(e, q, psql("select (clock_timestamp())::text")[0], day)
        if retry != "OK": check(False, f"round {i}: retry after payment completed was refused: {retry}")
check(not fails, f"{ROUNDS} rounds: payment credited exactly once every time; booking only ever on a verified full payment; stage booked iff confirmed; no payment-driven stage audit; refused confirmations succeed on retry  (outcomes: {outcomes})")
raise SystemExit(1 if fails else 0)
