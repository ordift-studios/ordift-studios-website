#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses p4_e2e). Simultaneous payment scenarios for the journey lab, run on a DISPOSABLE copy of the lab database that ALREADY has the payment controls applied
(the shell wrapper journey_races.sh makes the copy and drops it afterwards). Every session starts at the same server-side instant.
  R1 six simultaneous bank-transfer STARTS for one client, record and type                -> exactly one open instruction
  R2 two simultaneous VERIFICATIONS of USD 700 each on a USD 1,000 record                  -> one approved, one refused, total 700
  R3 a card completion (800) racing a bank verification (700) on a USD 1,000 record        -> the card is never refused; no silent overpayment (refused bank credit OR an open review case)
  R4 the SAME payment verified twice at once                                              -> one approval
  R5 two simultaneous PROOF SUBMISSIONS for one payment (the route's conditional update)   -> exactly one wins
  R6 a bank verification racing a refund-less second instalment that exactly fits          -> both approved, total exactly the amount due
Exit code 0 only if every scenario behaves."""
import subprocess, sys, os, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", "")
if not DB or DB == "p4_e2e": raise SystemExit("Set LAB_DB_NAME to a DISPOSABLE copy (never p4_e2e).")
SA = "4010fc9c-f5c6-4f4d-8845-64856df35647"; CL = "ff475186-3b33-4ea0-90fe-5280d2b1b7d7"
def psql(sql, check=True):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:500])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
fails = []
def check(ok, label):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok: fails.append(label)
if psql("select count(*) from information_schema.tables where table_name = 'payment_review_cases'")[0] != "1" or psql("select count(*) from pg_indexes where indexname = 'payments_one_open_bank_transfer_instruction'")[0] != "1":
    raise SystemExit("The copy does not have the payment controls applied (run apply_payment_integrity_to_lab.sh and apply_bank_transfer_guard_to_lab.sh on the lab first).")
acct = psql("select id from public.bank_accounts where country = 'QA' limit 1")[0]; n = [0]
def enq(due):
    n[0] += 1; ref = f"ENQ-RACE-{os.getpid()}-{n[0]}"
    psql(f"set session_replication_role = replica; insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (gen_random_uuid(), '{ref}', 'r@e2e.test', 'R', 'photography', 'quotation_sent', {due}, 0, true);")
    return psql(f"select id from public.enquiries where reference_number = '{ref}'")[0]
def pay(eid, usd, method="bank_transfer", status="awaiting_verification"):
    sub = f"'{CL}'" if method == "bank_transfer" else "null"; acc = f"'{acct}'" if method == "bank_transfer" else "null"; prov = "bank_transfer" if method == "bank_transfer" else "paystack"
    return psql(f"""set session_replication_role = replica; insert into public.payments (record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id)
      values ('PAY-RACE-' || substr(gen_random_uuid()::text, 1, 10), 'enquiry', '{eid}', '{CL}', {sub}, {usd}, 'QAR', 3.64, 'ordift', now(), round({usd} * 3.64, 2), 'partial', '{method}', '{status}', '{prov}', {acc}) returning id;""")[0].splitlines()[0]
def when(d=2.5): return psql(f"select (clock_timestamp() + interval '{d} seconds')::text")[0]
def vsql(pid, ref, t): return f"select pg_sleep_until(timestamptz '{t}'); select public.verify_bank_transfer_payment('{pid}', 'approved', '{SA}', (select converted_amount from public.payments where id = '{pid}'), 'QAR', 'RACE-{ref}-{os.getpid()}', current_date, true, null, null, false);"
def run(sqls):
    def one(s):
        o, e = psql(s, check=False); return "ok" if "completed" in o else ("REFUSED overpay" if "would_overpay" in e else "REFUSED not_awaiting" if "not_awaiting" in e else "other:" + e[:80])
    with cf.ThreadPoolExecutor(len(sqls)) as ex: return list(ex.map(one, sqls))
def paid(eid): return float(psql(f"select coalesce(sum(reference_amount_usd), 0) from public.payments where entity_id = '{eid}' and status = 'completed' and payment_type <> 'refund'")[0])
print(f"database: {DB} (disposable copy, controls applied)")
# R1
e = enq(1000); t = when()
start = f"select pg_sleep_until(timestamptz '{t}'); do $$ declare o uuid; begin select id into o from public.payments where entity_id = '{e}' and user_id = '{CL}' and payment_method = 'bank_transfer' and payment_type = 'partial' and status = 'pending' limit 1; if o is null then perform pg_sleep(0.15); begin insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider) values ('PAY-RACE-S-' || substr(gen_random_uuid()::text, 1, 8), 'enquiry', '{e}', '{CL}', 100, 'QAR', 3.64, 'ordift', now(), 364, 'partial', 'bank_transfer', 'pending', 'bank_transfer'); exception when unique_violation then null; end; end if; end $$;"
with cf.ThreadPoolExecutor(6) as ex: list(ex.map(lambda _: psql(start, check=False), range(6)))
rows = int(psql(f"select count(*) from public.payments where entity_id = '{e}' and status = 'pending' and payment_method = 'bank_transfer'")[0])
check(rows == 1, f"R1 six simultaneous bank-transfer starts -> {rows} open instruction")
# R2
ok2 = 0
for i in range(6):
    e = enq(1000); a, b = pay(e, 700), pay(e, 700); t = when(); res = run([vsql(a, f"2a{i}", t), vsql(b, f"2b{i}", t)])
    ok2 += (sorted(res) == ["REFUSED overpay", "ok"] and paid(e) == 700)
check(ok2 == 6, f"R2 two simultaneous 700 verifications on 1,000 -> one approved, one refused, total 700 ({ok2} of 6 rounds)")
# R3
ok3 = 0
for i in range(6):
    e = enq(1000); bank = pay(e, 700); card = pay(e, 800, "gateway", "pending"); t = when()
    cu = f"select pg_sleep_until(timestamptz '{t}'); update public.payments set status = 'completed', amount_collected = converted_amount where id = '{card}';"
    with cf.ThreadPoolExecutor(2) as ex: f1 = ex.submit(run, [vsql(bank, f"3{i}", t)]); f2 = ex.submit(lambda: psql(cu, check=False)); r1 = f1.result()[0]; er = f2.result()[1]
    cases = int(psql(f"select count(*) from public.payment_review_cases where payment_id = '{card}' and reason = 'over_collection' and status = 'open'")[0])
    ok3 += (er == "" and (paid(e) <= 1000.005 or cases == 1))
check(ok3 == 6, f"R3 card completion racing a bank verification -> card never refused, no silent overpayment ({ok3} of 6 rounds)")
# R4
e = enq(1000); a = pay(e, 300); t = when(); res = run([vsql(a, "4a", t), vsql(a, "4b", t)]); rows = int(psql(f"select count(*) from public.bank_transfer_verifications where payment_id = '{a}'")[0])
check(sorted(res) == ["REFUSED not_awaiting", "ok"] and rows == 1, f"R4 the same payment verified twice at once -> {res}, verification rows {rows}")
# R5
e = enq(1000); a = pay(e, 100); t = when()
claim = f"select pg_sleep_until(timestamptz '{t}'); with u as (update public.payments set status = 'awaiting_verification', proof_of_payment_asset_path = 'p/' || gen_random_uuid() where id = '{a}' and status in ('pending', 'rejected', 'additional_info_required') returning id) select count(*) from u;"
psql(f"update public.payments set status = 'pending' where id = '{a}'")
with cf.ThreadPoolExecutor(2) as ex: res = list(ex.map(lambda _: psql(claim, check=False)[0], range(2)))
check(sorted(res) == ["0", "1"], f"R5 two simultaneous proof submissions -> rows claimed {res} (exactly one wins)")
# R6
e = enq(1000); a, b = pay(e, 600), pay(e, 400); t = when(); res = run([vsql(a, "6a", t), vsql(b, "6b", t)])
check(res == ["ok", "ok"] and paid(e) == 1000, f"R6 two instalments that exactly fit, together -> {res}, total {paid(e)}")
print("JOURNEY RACES " + ("PASSED" if not fails else "FAILED: " + "; ".join(fails))); sys.exit(1 if fails else 0)
