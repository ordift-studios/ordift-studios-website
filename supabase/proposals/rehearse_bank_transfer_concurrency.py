#!/usr/bin/env python3
"""LOCAL ONLY (never Production, refuses the walkthrough database p4_e2e). Real concurrency test of the one-open-bank-transfer-instruction rule on a DISPOSABLE copy of the lab database.
Each session runs the route's own logic (look for an open instruction; if none, insert one; on a unique violation look again and reuse the winner), with a pause between the look and the insert that stands
for the application's round trip. All sessions start at the same server-side instant (pg_sleep_until). Rounds:
  A. WITHOUT the index, 6 simultaneous starts for the same client, record and type      -> more than one open instruction (this reproduces the gap)
  B. WITH the index, the same 6 starts                                                   -> exactly ONE open instruction and every request resolves to it
  C. 4 simultaneous starts of DIFFERENT payment types                                    -> 4 instructions (separate obligations are not blocked)
  D. 2 simultaneous starts for DIFFERENT clients                                         -> 2 instructions
  E. an earlier instruction awaits verification; 4 simultaneous new starts               -> exactly ONE new open instruction (a legitimate instalment is not blocked, a duplicate is)
  F. failure/retry: a start that rolls back leaves the next one free to succeed; one that commits makes the next reuse it
  G. proof submitted (pending -> awaiting_verification) racing a new start              -> never two open, no deadlock
Afterwards the synthetic rows are removed and the proposal is rolled back with its own rollback script. Exit code 0 only if every round behaves."""
import subprocess, sys, time, uuid, os, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", "")
D = os.path.dirname(os.path.abspath(__file__))
if not DB or DB == "p4_e2e": raise SystemExit("Set LAB_DB_NAME to a DISPOSABLE copy (never p4_e2e).")
USER_A = "ff475186-3b33-4ea0-90fe-5280d2b1b7d7"; USER_B = "4010fc9c-f5c6-4f4d-8845-64856df35647"
def psql(sql, check=True, db=None):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", db or DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:500])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
def sql_file(name): return open(os.path.join(D, name), encoding="utf8").read()
fails = []
def check(ok, label):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok: fails.append(label)

# the route's logic, as one session. returns the id it ended with, or 'ERR:...'
def start_sql(ent, user, ptype, when, pause=0.15, tag="x"):
    return f"""select pg_sleep_until(timestamptz '{when}');
do $$ declare o uuid; begin
  select id into o from public.payments where entity_type = 'enquiry' and entity_id = '{ent}' and user_id = '{user}' and payment_method = 'bank_transfer' and payment_type = '{ptype}' and status = 'pending' limit 1;
  if o is null then
    perform pg_sleep({pause});
    begin
      insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider)
        values ('PAY-CONC-{tag}-' || substr(gen_random_uuid()::text, 1, 8), 'enquiry', '{ent}', '{user}', 100, 'QAR', 3.64, 'ordift', now(), 364, '{ptype}', 'bank_transfer', 'pending', 'bank_transfer') returning id into o;
      perform set_config('ordift.outcome', 'inserted', false);
    exception when unique_violation then
      select id into o from public.payments where entity_type = 'enquiry' and entity_id = '{ent}' and user_id = '{user}' and payment_method = 'bank_transfer' and payment_type = '{ptype}' and status = 'pending' limit 1;
      perform set_config('ordift.outcome', 'reused-after-conflict', false);
    end;
  else perform set_config('ordift.outcome', 'reused', false); end if;
  raise notice 'RESULT % %', current_setting('ordift.outcome', true), o;
end $$;"""
def run_sessions(sqls):
    def one(s):
        out, err = psql(s, check=False)
        line = [l for l in err.splitlines() if "RESULT" in l]
        return line[0].split("RESULT ", 1)[1] if line else "ERR: " + err[:200]
    with cf.ThreadPoolExecutor(len(sqls)) as ex: return list(ex.map(one, sqls))
def when(delay=2.5): return psql("select (clock_timestamp() + interval '%s seconds')::text" % delay)[0]
def open_count(ent, user=None, ptype=None):
    f = f"entity_id = '{ent}' and payment_method = 'bank_transfer' and status = 'pending'" + (f" and user_id = '{user}'" if user else "") + (f" and payment_type = '{ptype}'" if ptype else "")
    return int(psql(f"select count(*) from public.payments where {f}")[0])
def cleanup(): psql("delete from public.payments where record_id like 'PAY-CONC-%'")

print(f"database: {DB} (disposable copy)"); cleanup()
psql(sql_file("ROLLBACK_bank_transfer_one_open_instruction.sql"))
# A. baseline without the index
t = when(); e = "conc-A"; res = run_sessions([start_sql(e, USER_A, "partial", t, tag="A") for _ in range(6)])
n = open_count(e); check(n > 1, f"A baseline WITHOUT the index: {n} open instructions for one client, record and type (the gap is real)"); cleanup()
# apply the proposal for real
psql(sql_file("PROPOSAL_bank_transfer_one_open_instruction.sql"))
# B
t = when(); e = "conc-B"; res = run_sessions([start_sql(e, USER_A, "partial", t, tag="B") for _ in range(6)])
ids = {r.split()[-1] for r in res}; check(open_count(e) == 1 and len(ids) == 1 and not any(r.startswith("ERR") for r in res), f"B WITH the index: one open instruction, all 6 requests resolved to it: {sorted(set(r.split()[0] for r in res))}"); cleanup()
# C
t = when(); e = "conc-C"; res = run_sessions([start_sql(e, USER_A, p, t, tag="C") for p in ("deposit", "partial", "balance", "full")])
check(open_count(e) == 4 and not any(r.startswith("ERR") for r in res), "C different payment types in parallel: 4 instructions, none blocked"); cleanup()
# D
t = when(); e = "conc-D"; res = run_sessions([start_sql(e, u, "partial", t, tag="D") for u in (USER_A, USER_B)])
check(open_count(e) == 2 and not any(r.startswith("ERR") for r in res), "D different clients in parallel: 2 instructions"); cleanup()
# E instalment while an earlier one awaits verification
e = "conc-E"; psql(start_sql(e, USER_A, "partial", when(0.5), tag="E1")); time.sleep(1)
psql(f"update public.payments set status = 'awaiting_verification' where entity_id = '{e}'")
t = when(); res = run_sessions([start_sql(e, USER_A, "partial", t, tag="E2") for _ in range(4)])
total = int(psql(f"select count(*) from public.payments where entity_id = '{e}'")[0])
check(open_count(e) == 1 and total == 2 and not any(r.startswith("ERR") for r in res), f"E instalment: earlier one awaiting verification, 4 parallel new starts -> exactly 1 new open (rows total {total})"); cleanup()
# F failure/retry
e = "conc-F"
p1 = subprocess.Popen(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
p1.stdin.write(f"begin; insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider) values ('PAY-CONC-F1', 'enquiry', '{e}', '{USER_A}', 100, 'QAR', 3.64, 'ordift', now(), 364, 'partial', 'bank_transfer', 'pending', 'bank_transfer'); select pg_sleep(1.5); rollback;\n".encode()); p1.stdin.close()
time.sleep(0.5); t0 = time.time()
r2 = run_sessions([start_sql(e, USER_A, "partial", when(0.1), pause=0, tag="F2")]); waited = time.time() - t0; p1.wait()
check(open_count(e) == 1 and r2[0].startswith("inserted") and waited > 0.8, f"F1 a start that rolls back frees the next one (the second waited {waited:.1f}s for the first, then inserted)"); cleanup()
p1 = subprocess.Popen(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
p1.stdin.write(f"begin; insert into public.payments (record_id, entity_type, entity_id, user_id, reference_amount_usd, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, converted_amount, payment_type, payment_method, status, provider) values ('PAY-CONC-F3', 'enquiry', '{e}', '{USER_A}', 100, 'QAR', 3.64, 'ordift', now(), 364, 'partial', 'bank_transfer', 'pending', 'bank_transfer'); select pg_sleep(1.5); commit;\n".encode()); p1.stdin.close()
time.sleep(0.5); r2 = run_sessions([start_sql(e, USER_A, "partial", when(0.1), pause=0, tag="F4")]); p1.wait()
check(open_count(e) == 1 and r2[0].startswith("reused-after-conflict"), f"F2 a start that commits makes the next one reuse it ({r2[0].split()[0]})"); cleanup()
# G proof submission racing a new start
e = "conc-G"; psql(start_sql(e, USER_A, "partial", when(0.5), tag="G1")); time.sleep(1)
t = when(); upd = f"select pg_sleep_until(timestamptz '{t}'); update public.payments set status = 'awaiting_verification' where entity_id = '{e}' and status = 'pending'; select 'upd-done';"
res = run_sessions([start_sql(e, USER_A, "partial", t, tag="G2"), start_sql(e, USER_A, "partial", t, tag="G3")]); psql(upd, check=False)
check(open_count(e) <= 1 and not any(r.startswith("ERR") for r in res), f"G proof submission racing new starts: at most one open instruction ({open_count(e)}), no deadlock or error"); cleanup()
# integrity + rollback
dups = int(psql("select count(*) from (select 1 from public.payments where payment_method='bank_transfer' and status='pending' and user_id is not null group by entity_type, entity_id, user_id, payment_type having count(*) > 1) d")[0])
check(dups == 0, "integrity: no duplicate open instruction exists after all rounds")
psql(sql_file("ROLLBACK_bank_transfer_one_open_instruction.sql"))
gone = psql("select count(*) from pg_indexes where indexname = 'payments_one_open_bank_transfer_instruction'")[0] == "0"
check(gone, "the proposal's own rollback removed the index")
print("BANK TRANSFER CONCURRENCY REHEARSAL " + ("PASSED" if not fails else "FAILED: " + "; ".join(fails))); sys.exit(1 if fails else 0)
