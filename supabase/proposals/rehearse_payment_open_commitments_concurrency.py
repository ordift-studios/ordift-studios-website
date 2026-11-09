#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses p4_e2e). Real concurrency test of the open-commitments guard on a DISPOSABLE copy of the lab database; the proposal is applied for real and rolled back at the end.
  A. four simultaneous starts of DIFFERENT types and methods, 400 each on a 1,000 record   -> exactly two are created (800); the others are refused; the held total never exceeds what is owed
  B. two simultaneous starts that exactly fit (500 + 500)                                  -> both created
  C. a start racing the raise of another open instruction's amount                          -> the held total never exceeds what is owed
  D. a start racing a verification that completes another instruction                       -> never more than owed is completed plus held
  E. a pending start older than the hold, and a fresh one, racing                           -> the fresh one fits (the stale one holds nothing)
Exit code 0 only if every round behaves."""
import subprocess, sys, os, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", ""); D = os.path.dirname(os.path.abspath(__file__))
if not DB or DB == "p4_e2e": raise SystemExit("Set LAB_DB_NAME to a DISPOSABLE copy (never p4_e2e).")
SA = "4010fc9c-f5c6-4f4d-8845-64856df35647"; CL = "ff475186-3b33-4ea0-90fe-5280d2b1b7d7"
def psql(sql, check=True):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:500])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
def sql_file(n): return open(os.path.join(D, n), encoding="utf8").read()
fails = []
def check(ok, label):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok: fails.append(label)
if psql("select count(*) from pg_trigger where tgname = 'payments_open_commitment_guard'")[0] != "0": raise SystemExit("The copy already has the proposal applied; use a fresh copy.")
psql(sql_file("PROPOSAL_payment_open_commitments_guard.sql")); acct = psql("select id from public.bank_accounts where country = 'QA' limit 1")[0]; n = [0]
def enq(due):
    n[0] += 1; ref = f"ENQ-POC-{os.getpid()}-{n[0]}"
    psql(f"set session_replication_role = replica; insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (gen_random_uuid(), '{ref}', 'p@e2e.test', 'P', 'photography', 'quotation_sent', {due}, 0, true);")
    return psql(f"select id from public.enquiries where reference_number = '{ref}'")[0]
def ins(e, usd, ptype, method="bank_transfer", status="pending", age="0 seconds"):
    sub = f"'{CL}'" if method == "bank_transfer" else "null"; acc = f"'{acct}'" if method == "bank_transfer" else "null"; prov = "bank_transfer" if method == "bank_transfer" else "paystack"
    return f"insert into public.payments (record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id, created_at) values ('PAY-POC-' || substr(gen_random_uuid()::text, 1, 10), 'enquiry', '{e}', '{CL}', {sub}, {usd}, 'QAR', 3.64, 'ordift', now(), round({usd} * 3.64, 2), '{ptype}', '{method}', '{status}', '{prov}', {acc}, now() - interval '{age}') returning id;"
def when(d=2.5): return psql(f"select (clock_timestamp() + interval '{d} seconds')::text")[0]
def run(sqls):
    def one(s):
        o, er = psql(s, check=False); return "ok" if not er else ("REFUSED" if "would_exceed_outstanding" in er else "other:" + er[:90])
    with cf.ThreadPoolExecutor(len(sqls)) as ex: return list(ex.map(one, sqls))
def held(e): return float(psql(f"select coalesce(sum(reference_amount_usd), 0) from public.payments where entity_id = '{e}' and payment_type <> 'refund' and status in ('pending', 'awaiting_verification', 'additional_info_required', 'completed')")[0])
def cleanup(): psql("delete from public.payments where record_id like 'PAY-POC-%'; delete from public.enquiries where reference_number like 'ENQ-POC-%'", check=False)
print(f"database: {DB} (disposable copy, proposal applied for real)")
ok = 0; ex_res = None
for i in range(8):
    e = enq(1000); t = when(); mk = lambda usd, typ, meth: f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, usd, typ, meth)
    res = run([mk(400, "deposit", "bank_transfer"), mk(400, "partial", "gateway"), mk(400, "balance", "bank_transfer"), mk(400, "full", "gateway")]); ex_res = res
    ok += res.count("ok") == 2 and res.count("REFUSED") == 2 and held(e) == 800
check(ok == 8, f"A four simultaneous 400 starts of different types and methods on 1,000: exactly two created, held 800 ({ok} of 8; e.g. {ex_res})"); cleanup()
ok = 0
for i in range(6):
    e = enq(1000); t = when(); res = run([f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, 500, "deposit"), f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, 500, "balance", "gateway")]); ok += res == ["ok", "ok"] and held(e) == 1000
check(ok == 6, f"B two simultaneous starts that exactly fit (500 + 500): both created ({ok} of 6)"); cleanup()
ok = 0
for i in range(8):
    e = enq(1000); a = psql(ins(e, 300, "deposit"))[0].splitlines()[0]; t = when()
    res = run([f"select pg_sleep_until(timestamptz '{t}'); update public.payments set reference_amount_usd = 700 where id = '{a}';", f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, 500, "balance", "gateway")]); ok += held(e) <= 1000.005
check(ok == 8, f"C a start racing the raise of another open instruction: held total never above what is owed ({ok} of 8)"); cleanup()
ok = 0
for i in range(8):
    e = enq(1000); a = psql(ins(e, 600, "deposit", "bank_transfer", "awaiting_verification"))[0].splitlines()[0]; t = when()
    ver = f"select pg_sleep_until(timestamptz '{t}'); select public.verify_bank_transfer_payment('{a}', 'approved', '{SA}', (select converted_amount from public.payments where id = '{a}'), 'QAR', 'POC-{os.getpid()}-{i}', current_date, true, null, null, false);"
    res = run([ver, f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, 400, "balance", "gateway")]); ok += held(e) <= 1000.005
check(ok == 8, f"D a start racing the verification of another instruction: completed plus held never above what is owed ({ok} of 8)"); cleanup()
ok = 0
for i in range(6):
    e = enq(1000); psql(ins(e, 900, "deposit", "bank_transfer", "pending", "30 hours")); t = when(); res = run([f"select pg_sleep_until(timestamptz '{t}'); " + ins(e, 900, "balance", "gateway")]); ok += res == ["ok"]
check(ok == 6, f"E a stale pending instruction (30h) holds nothing: a fresh 900 start fits ({ok} of 6)"); cleanup()
psql(sql_file("ROLLBACK_payment_open_commitments_guard.sql")); gone = psql("select count(*) from pg_trigger where tgname = 'payments_open_commitment_guard'")[0] == "0"
check(gone, "the proposal's own rollback removed the trigger and functions")
print("PAYMENT OPEN COMMITMENTS CONCURRENCY REHEARSAL " + ("PASSED" if not fails else "FAILED: " + "; ".join(fails))); sys.exit(1 if fails else 0)
