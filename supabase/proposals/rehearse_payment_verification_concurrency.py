#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses the walkthrough database p4_e2e). Real concurrency test of bank-transfer verification on a DISPOSABLE copy of the lab database. Sessions start at the same
server-side instant (pg_sleep_until). Rounds, each repeated:
  A. ORIGINAL function, two payments of USD 700 on a USD 1,000 receivable, verified together      -> both approved, 1,400 credited (reproduces the confirmed race)
  B. WITH the proposal, the same race, 15 times                                                   -> exactly one approved, the other refused (would_overpay_receivable); total never above 1,000
  C. three payments of 400 on 1,000, together                                                      -> exactly two approved (800); the third refused
  D. 600 and 400 together (an exact fit)                                                           -> both approved, total exactly 1,000: the lock does not over-block
  E. the SAME payment verified twice together                                                      -> one approval, one 'not_awaiting_verification'; one verification row
  F. a verification racing a direct table update of another bank payment on the same record        -> total never above 1,000 (the table backstop)
  G. a CARD payment completing while a bank payment is verified (card 800, bank 700 on 1,000)      -> the card is never refused; either the bank credit is refused or an over_collection case is open; never a silent overpayment
  H. a refused verification leaves the payment awaiting verification with no verification row, and a later retry (after a refund frees the balance) succeeds
  I. different records verified together                                                           -> not serialised against each other (both approved)
Afterwards the synthetic rows are removed and the proposal is rolled back with its own rollback script (original function restored: fingerprint compared). Exit code 0 only if every round behaves."""
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
acct = psql("select id from public.bank_accounts where country = 'QA' limit 1")[0]
n_enq = [0]
def new_enquiry(due):
    n_enq[0] += 1; ref = f"ENQ-PVC-{os.getpid()}-{n_enq[0]}"
    psql(f"set session_replication_role = replica; insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, amount_due, amount_paid, is_test) values (gen_random_uuid(), '{ref}', 'p@e2e.test', 'P', 'photography', 'quotation_sent', {due}, 0, true);")
    return psql(f"select id from public.enquiries where reference_number = '{ref}'")[0]
def new_payment(eid, usd, method="bank_transfer", status="awaiting_verification"):
    sub = f"'{CL}'" if method == "bank_transfer" else "null"; acc = f"'{acct}'" if method == "bank_transfer" else "null"; prov = "bank_transfer" if method == "bank_transfer" else "paystack"
    return psql(f"""set session_replication_role = replica; insert into public.payments (record_id, entity_type, entity_id, user_id, submitted_by, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider, receiving_bank_account_id)
      values ('PAY-PVC-' || substr(gen_random_uuid()::text, 1, 10), 'enquiry', '{eid}', '{CL}', {sub}, {usd}, 'QAR', 3.64, 'ordift', now(), round({usd} * 3.64, 2), 'partial', '{method}', '{status}', '{prov}', {acc}) returning id;""")[0].splitlines()[0]
def when(delay=2.5): return psql(f"select (clock_timestamp() + interval '{delay} seconds')::text")[0]
def verify_sql(pid, ref, t, amount=None):
    amt = f"{amount}" if amount is not None else f"(select converted_amount from public.payments where id = '{pid}')"
    return f"select pg_sleep_until(timestamptz '{t}'); select public.verify_bank_transfer_payment('{pid}', 'approved', '{SA}', {amt}, 'QAR', 'PVC-{ref}-{os.getpid()}', current_date, true, null, null, false);"
def run(sqls):
    def one(s):
        o, e = psql(s, check=False); return "ok" if "completed" in o else ("REFUSED " + ("overpay" if "would_overpay" in e else "not_awaiting" if "not_awaiting" in e else "other:" + e[:100]))
    with cf.ThreadPoolExecutor(len(sqls)) as ex: return list(ex.map(one, sqls))
def paid(eid): return float(psql(f"select coalesce(sum(case when payment_type = 'refund' then -reference_amount_usd else reference_amount_usd end), 0) from public.payments where entity_id = '{eid}' and status = 'completed'")[0])
def cleanup():
    psql("delete from public.payment_review_cases where payment_id in (select id from public.payments where record_id like 'PAY-PVC-%'); delete from public.bank_transfer_verifications where payment_id in (select id from public.payments where record_id like 'PAY-PVC-%'); delete from public.payments where record_id like 'PAY-PVC-%'; delete from public.enquiries where reference_number like 'ENQ-PVC-%'", check=False)
print(f"database: {DB} (disposable copy)")
orig_fp = psql("select md5(pg_get_functiondef('public.verify_bank_transfer_payment(uuid,text,uuid,numeric,text,text,date,boolean,text,text,boolean)'::regprocedure))")[0]
if psql("select count(*) from information_schema.tables where table_name = 'payment_review_cases'")[0] != "0": raise SystemExit("The copy already has the proposal applied; use a fresh copy.")
# A. the race, original function
over = 0
for i in range(5):
    e = new_enquiry(1000); a, b = new_payment(e, 700), new_payment(e, 700); t = when(); run([verify_sql(a, f"A{i}a", t), verify_sql(b, f"A{i}b", t)])
    if paid(e) > 1000.005: over += 1
check(over >= 4, f"A ORIGINAL function: {over} of 5 rounds credited more than the amount due (the confirmed race reproduces)"); cleanup()
psql(sql_file("PROPOSAL_payment_integrity_controls.sql"))
# B
okc = 0; bad = []
for i in range(15):
    e = new_enquiry(1000); a, b = new_payment(e, 700), new_payment(e, 700); t = when(); res = run([verify_sql(a, f"B{i}a", t), verify_sql(b, f"B{i}b", t)])
    if sorted(res) == ["REFUSED overpay", "ok"] and paid(e) == 700: okc += 1
    else: bad.append((i, res, paid(e)))
check(okc == 15, f"B WITH the proposal: 15 of 15 rounds -> one approved, one refused, total 700 {bad[:2] if bad else ''}"); cleanup()
# C
e = new_enquiry(1000); ps = [new_payment(e, 400) for _ in range(3)]; t = when(); res = run([verify_sql(p, f"C{k}", t) for k, p in enumerate(ps)])
check(res.count("ok") == 2 and res.count("REFUSED overpay") == 1 and paid(e) == 800, f"C three of 400 on 1,000 together -> {res}, total {paid(e)}"); cleanup()
# D
e = new_enquiry(1000); a, b = new_payment(e, 600), new_payment(e, 400); t = when(); res = run([verify_sql(a, "Da", t), verify_sql(b, "Db", t)])
check(res == ["ok", "ok"] and paid(e) == 1000, f"D exact fit 600 + 400 together -> {res}, total {paid(e)}"); cleanup()
# E
e = new_enquiry(1000); a = new_payment(e, 300); t = when(); res = run([verify_sql(a, "Ea", t), verify_sql(a, "Eb", t)])
rows = int(psql(f"select count(*) from public.bank_transfer_verifications where payment_id = '{a}'")[0])
check(sorted(res) == ["REFUSED not_awaiting", "ok"] and rows == 1, f"E the same payment twice together -> {res}, verification rows {rows}"); cleanup()
# F
okc = 0
for i in range(8):
    e = new_enquiry(1000); a, b = new_payment(e, 700), new_payment(e, 700); t = when()
    upd = f"select pg_sleep_until(timestamptz '{t}'); update public.payments set status = 'completed' where id = '{b}';"
    def u(s): o, er = psql(s, check=False); return "ok" if not er else "REFUSED"
    with cf.ThreadPoolExecutor(2) as ex: f1 = ex.submit(run, [verify_sql(a, f"F{i}", t)]); f2 = ex.submit(u, upd); f1.result(); f2.result()
    if paid(e) <= 1000.005: okc += 1
check(okc == 8, f"F verification racing a direct table update: total never above 1,000 ({okc} of 8 rounds)"); cleanup()
# G
okc = 0; detail = []
for i in range(8):
    e = new_enquiry(1000); bank = new_payment(e, 700); card = new_payment(e, 800, "gateway", "pending"); t = when()
    cu = f"select pg_sleep_until(timestamptz '{t}'); update public.payments set status = 'completed', amount_collected = converted_amount where id = '{card}';"
    def c(s): o, er = psql(s, check=False); return "ok" if not er else "REFUSED " + er[:60]
    with cf.ThreadPoolExecutor(2) as ex: f1 = ex.submit(run, [verify_sql(bank, f"G{i}", t)]); f2 = ex.submit(c, cu); r1 = f1.result()[0]; r2 = f2.result()
    cases = int(psql(f"select count(*) from public.payment_review_cases where payment_id = '{card}' and reason = 'over_collection' and status = 'open'")[0]); total = paid(e)
    good = r2 == "ok" and (total <= 1000.005 or cases == 1)
    detail.append((r1, r2, total, cases)); okc += good
check(okc == 8, f"G card completing while a bank payment is verified: the card is never refused and no silent overpayment ({okc} of 8; e.g. {detail[0]})"); cleanup()
# H
e = new_enquiry(1000); a, b = new_payment(e, 700), new_payment(e, 700); run([verify_sql(a, "Ha", when(0.5))]); r = run([verify_sql(b, "Hb", when(0.5))])[0]
st = psql(f"select status from public.payments where id = '{b}'")[0]; vr = int(psql(f"select count(*) from public.bank_transfer_verifications where payment_id = '{b}'")[0])
psql(f"insert into public.payments (record_id, entity_type, entity_id, payment_type, status, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_method, provider) values ('PAY-PVC-RF', 'enquiry', '{e}', 'refund', 'completed', 400, 'QAR', 3.64, 'ordift', now(), 1456, 'bank_transfer', 'bank_transfer')")
r2 = run([verify_sql(b, "Hc", when(0.5))])[0]
check(r == "REFUSED overpay" and st == "awaiting_verification" and vr == 0 and r2 == "ok" and paid(e) == 1000, f"H refused -> still awaiting, no verification row; after a 400 refund the retry succeeds ({r}, {st}, rows {vr}, retry {r2}, total {paid(e)})"); cleanup()
# I
e1, e2 = new_enquiry(1000), new_enquiry(1000); a, b = new_payment(e1, 700), new_payment(e2, 700); t = when(); res = run([verify_sql(a, "Ia", t), verify_sql(b, "Ib", t)])
check(res == ["ok", "ok"], f"I different records are not serialised against each other -> {res}"); cleanup()
dups = psql("select count(*) from (select e.id from public.enquiries e join public.payments p on p.entity_id = e.id::text and p.status = 'completed' where p.record_id like 'PAY-PVC-%' group by e.id, e.amount_due having sum(p.reference_amount_usd) > e.amount_due + 0.005) x")[0]
check(dups == "0", "integrity: no synthetic record is credited above its amount due")
psql(sql_file("ROLLBACK_payment_integrity_controls.sql"))
back = psql("select md5(pg_get_functiondef('public.verify_bank_transfer_payment(uuid,text,uuid,numeric,text,text,date,boolean,text,text,boolean)'::regprocedure))")[0]
gone = psql("select count(*) from information_schema.tables where table_name = 'payment_review_cases'")[0] == "0"
check(back == orig_fp and gone, "the proposal's own rollback restored the original function exactly and removed the new table")
cleanup()
print("PAYMENT VERIFICATION CONCURRENCY REHEARSAL " + ("PASSED" if not fails else "FAILED: " + "; ".join(fails))); sys.exit(1 if fails else 0)
