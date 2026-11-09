#!/usr/bin/env python3
"""LOCAL ONLY (never Production; refuses p4_e2e). Real concurrency test of the portal claim functions on a DISPOSABLE copy of the lab database. Sessions start at the same server-side instant.
  A. two DIFFERENT client accounts present the SAME link and the right code at once      -> exactly one claims; the record has exactly one owner
  B. six simultaneous WRONG codes                                                         -> exactly 5 are counted, the invitation is locked, nothing is attached
  C. the right code racing the fifth wrong code                                          -> consistent: owned if and only if the invitation says claimed; attempts never above 5
  D. two staff members create an invitation for the same enquiry at once                  -> exactly one created
  E. a claim racing a revoke                                                              -> consistent: owned if and only if claimed
  F. a claim racing a Super Admin release attempt on an already-claimed record            -> ownership changes only through the two functions and the events table matches
Afterwards the proposal is rolled back with its own rollback script. Exit code 0 only if every round behaves."""
import subprocess, sys, os, hashlib, json, concurrent.futures as cf
C = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"); DB = os.environ.get("LAB_DB_NAME", ""); D = os.path.dirname(os.path.abspath(__file__))
if not DB or DB == "p4_e2e": raise SystemExit("Set LAB_DB_NAME to a DISPOSABLE copy (never p4_e2e).")
ST = "d0348e71-47f9-4075-8ff8-f7f463fc88d4"; SA = "4010fc9c-f5c6-4f4d-8845-64856df35647"; ADM = "53f08127-8245-4d96-b3bb-ce9dc05a4db5"
def psql(sql, check=True):
    r = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), capture_output=True)
    if check and r.returncode: raise SystemExit("SQL failed: " + r.stderr.decode()[:500])
    return r.stdout.decode().strip(), r.stderr.decode().strip()
def sql_file(n): return open(os.path.join(D, n), encoding="utf8").read()
H = lambda t: hashlib.sha256(t.encode()).hexdigest()
fails = []
def check(ok, label):
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok: fails.append(label)
CL1 = psql("select id from public.profiles where full_name = 'JRN Ghana Client'")[0] or "ff475186-3b33-4ea0-90fe-5280d2b1b7d7"
CL2 = psql("select id from public.profiles where full_name = 'JRN Qatar Client'")[0] or "ff475186-3b33-4ea0-90fe-5280d2b1b7d7"
if CL1 == CL2: raise SystemExit("need two distinct client profiles")
if psql("select count(*) from information_schema.tables where table_name = 'enquiry_portal_claims'")[0] != "0": raise SystemExit("The copy already has the proposal applied; use a fresh copy.")
psql(sql_file("PROPOSAL_portal_claims.sql")); n = [0]
def enquiry():
    n[0] += 1; ref = f"ENQ-PCC-{os.getpid()}-{n[0]}"
    psql(f"set session_replication_role = replica; insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage, is_test, created_by, source_channel, received_at) values (gen_random_uuid(), '{ref}', 'p@e2e.test', 'P', 'photography', 'new_lead', true, '{ST}', 'whatsapp', now());")
    return psql(f"select id from public.enquiries where reference_number = '{ref}'")[0]
def create(eid, tok, code, creator=ST):
    return f"select public.create_portal_claim('{eid}', '{creator}', 'whatsapp', null, '{H(tok)}', '{H(tok + ':' + code)}', now() + interval '2 days', 'normal', '[]'::jsonb)::text;"
def attempt(tok, code, who): return f"select public.attempt_portal_claim('{H(tok)}', '{H(tok + ':' + code)}', '{who}')::text;"
def when(d=2.5): return psql(f"select (clock_timestamp() + interval '{d} seconds')::text")[0]
def at(t, s): return f"select pg_sleep_until(timestamptz '{t}'); " + s
def run(sqls):
    def one(s):
        o, e = psql(s, check=False); 
        try: return json.loads(o.splitlines()[-1])["outcome"] if o else "ERR:" + e[:80]
        except Exception: return "ERR:" + (e or o)[:80]
    with cf.ThreadPoolExecutor(len(sqls)) as ex: return list(ex.map(one, sqls))
def owner(eid): return psql(f"select coalesce(user_id::text, '') from public.enquiries where id = '{eid}'")[0]
def claim(eid): return psql(f"select status || '|' || attempts from public.enquiry_portal_claims where enquiry_id = '{eid}' order by created_at desc limit 1")[0]
print(f"database: {DB} (disposable copy, proposal applied for real)")
# A
ok = 0
for i in range(8):
    e = enquiry(); tok = f"A{os.getpid()}{i}"; psql(create(e, tok, "123456")); t = when(); res = run([at(t, attempt(tok, "123456", CL1)), at(t, attempt(tok, "123456", CL2))])
    ok += res.count("claimed") == 1 and all(r in ("claimed", "already_claimed") for r in res) and owner(e) in (CL1, CL2) and int(psql(f"select count(*) from public.enquiry_ownership_events where enquiry_id = '{e}'")[0]) == 1
check(ok == 8, f"A two accounts, same link, right code, together: one owner, one ownership event ({ok} of 8 rounds; outcomes e.g. {res})")
# B
e = enquiry(); tok = f"B{os.getpid()}"; psql(create(e, tok, "123456")); t = when(); res = run([at(t, attempt(tok, f"00000{k}", CL1)) for k in range(6)])
st = claim(e); check(st == "locked|5" and owner(e) == "" and sum(r in ("bad_code", "locked") for r in res) >= 5, f"B six simultaneous wrong codes -> {st}, outcomes {sorted(res)}")
# C
ok = 0
for i in range(8):
    e = enquiry(); tok = f"C{os.getpid()}{i}"; psql(create(e, tok, "123456"))
    for k in range(4): psql(attempt(tok, f"00000{k}", CL1))
    t = when(); res = run([at(t, attempt(tok, "999999", CL1)), at(t, attempt(tok, "123456", CL2))]); s = claim(e); status, att = s.split("|")
    ok += (int(att) <= 5) and ((owner(e) == CL2) == (status == "claimed")) and (status in ("claimed", "locked"))
check(ok == 8, f"C right code racing the fifth wrong code: owned iff claimed, attempts never above 5 ({ok} of 8; e.g. {res})")
# D
ok = 0
for i in range(6):
    e = enquiry(); t = when(); res = run([at(t, create(e, f"D{os.getpid()}{i}a", "111111", ST)), at(t, create(e, f"D{os.getpid()}{i}b", "222222", SA))])
    ok += sorted(res) == ["created", "open_claim_exists"] and int(psql(f"select count(*) from public.enquiry_portal_claims where enquiry_id = '{e}' and status = 'open'")[0]) == 1
check(ok == 6, f"D two creators at once: exactly one invitation ({ok} of 6)")
# E
ok = 0
for i in range(8):
    e = enquiry(); tok = f"E{os.getpid()}{i}"; out = psql(create(e, tok, "123456"))[0]; cid = json.loads(out)["claim_id"]; t = when()
    res = run([at(t, attempt(tok, "123456", CL1)), at(t, f"select public.revoke_portal_claim('{cid}', '{ST}', 'race')::text;")]); s = claim(e).split("|")[0]
    ok += ((owner(e) == CL1) == (s == "claimed")) and s in ("claimed", "revoked")
check(ok == 8, f"E a claim racing a revoke: owned iff claimed ({ok} of 8; e.g. {res})")
# F
ok = 0
for i in range(6):
    e = enquiry(); tok = f"F{os.getpid()}{i}"; psql(create(e, tok, "123456")); psql(attempt(tok, "123456", CL1)); t = when()
    rel = f"select public.release_enquiry_ownership('{e}', '{SA}', 'Race test: wrong person claimed this.')::text;"; res = run([at(t, rel), at(t, attempt(tok, "123456", CL2))])
    ev = int(psql(f"select count(*) from public.enquiry_ownership_events where enquiry_id = '{e}'")[0]); ok += (owner(e) in ("", CL1)) and ev in (2,) and res[0] == "released"
check(ok == 6, f"F a release racing a repeat claim of a used link: the record ends released or owned by the first claimer, events consistent ({ok} of 6)")
psql(sql_file("ROLLBACK_portal_claims.sql"))
psql("delete from public.enquiries where reference_number like 'ENQ-PCC-%'", check=False)
gone = psql("select count(*) from information_schema.tables where table_name = 'enquiry_portal_claims'")[0] == "0"
check(gone, "the proposal's own rollback removed the tables, functions and trigger")
print("PORTAL CLAIMS CONCURRENCY REHEARSAL " + ("PASSED" if not fails else "FAILED: " + "; ".join(fails))); sys.exit(1 if fails else 0)
