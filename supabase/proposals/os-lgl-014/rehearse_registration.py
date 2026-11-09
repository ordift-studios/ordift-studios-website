#!/usr/bin/env python3
"""LOCAL REHEARSAL ONLY (never Production). Rehearses the OS-LGL-014 version registration migration, its guarded rollback and its refusals on the throwaway lab database,
inside ONE transaction that is ROLLED BACK, so the lab data (including the walkthrough rows) is left exactly as it was.

  python3 rehearse_registration.py <dir with the three generated SQL files> [<dir with the same plan generated for other cases>]

Generate the SQL first with scripts/legal/planMasterRegistration.ts. This script generates the extra "refusal" plans itself through the same script.
"""
import hashlib, json, os, subprocess, sys, tempfile
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(D, "..", "..", ".."))
OUT = sys.argv[1]; CODE, VER = "OS-LGL-014", "1.1"
C, DB = os.environ.get("LAB_DB_CONTAINER", "ordift-mig-check2"), os.environ.get("LAB_DB_NAME", "p4_e2e")
rd = lambda name: open(os.path.join(OUT, name), encoding="utf8").read()
strip = lambda s: "\n".join(l for l in s.splitlines() if l.strip() not in ("begin;", "commit;"))
up, down, ver = strip(rd(f"PROPOSAL_{CODE}_v{VER}_registration.sql")), strip(rd(f"ROLLBACK_{CODE}_v{VER}_registration.sql")), rd(f"VERIFY_{CODE}_v{VER}_registration.sql")
import re
paths = re.findall(r"name in \('([^']+)', '([^']+)'\)", up)[0]
def gen(version, code=CODE, extra=()):
    """a registration plan for another version/code over the same files (used only to exercise the migration's own refusals)"""
    d = tempfile.mkdtemp()
    K = os.environ.get("MASTER_DIR", "/Users/myli/ordift-walkthrough-kit/storage/OS-LGL-014")
    cmd = ["npx", "tsx", os.path.join(ROOT, "scripts/legal/planMasterRegistration.ts"), "--code", code, "--version", version, "--docx", f"{K}/v1.1-clean.docx", "--pdf", f"{K}/v1.1-clean.pdf",
           "--docx-path", paths[0].replace("OS-LGL-014", code), "--pdf-path", paths[1].replace("OS-LGL-014", code), "--out", d]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode: sys.exit("could not generate the extra plan: " + r.stdout + r.stderr)
    return strip(open(os.path.join(d, f"PROPOSAL_{code}_v{version}_registration.sql"), encoding="utf8").read())
up_low, up_next = gen("0.9"), gen("1.2")
up_nomaster = up.replace("OS-LGL-014", "OS-LGL-099")   # same statement pointed at a master that does not exist (the planner itself refuses a file that does not name the code)
fp_sql = re.search(r"select 'existing_rows_fingerprint'.*?;\n", ver, re.S).group(0).rstrip().rstrip(";")

def q(s): return "$q$" + s + "$q$"
sql = f"""
\\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
create or replace function pg_temp.must(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'REHEARSAL FAILED: %', msg; end if; end $$;
create or replace function pg_temp.err(s text) returns text language plpgsql as $$ begin execute s; return ''; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.fp() returns text language sql as $f$ select value from ({fp_sql}) t $f$;
create temp table walk_before as select version, status, content_reference is not null reg, approved_by, master_docx_sha256 from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}';
-- 0. production-shaped starting point INSIDE this transaction: the walkthrough's synthetic v1.1 row and its audit are set aside (restored by the final rollback)
set local session_replication_role = replica;
delete from public.activity_log where entity_id in (select v.id::text from public.legal_document_versions v where v.version = '{VER}' and v.master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}'));
delete from public.legal_document_versions where version = '{VER}' and master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}');
set local session_replication_role = origin;
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 2, 'start: exactly the two existing 1.0 rows');
create temp table t as select pg_temp.fp() as fp_before, (select current_version_id::text from public.legal_document_masters where canonical_code = '{CODE}') as cur_before;
grant all on t to public;

-- 1. REFUSES when the controlled import has not stored the files
select pg_temp.must(pg_temp.err({q(up)}) like '%both master files must already be stored%', 'refuses when the master files are not in the bucket');
select pg_temp.must((select count(*) from public.legal_document_versions) = (select count(*) from public.legal_document_versions), 'noop');
-- the controlled import (stored files) as the separate authorised step would leave them
insert into storage.buckets (id, name, public) values ('legal-masters', 'legal-masters', false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('legal-masters', '{paths[0]}'), ('legal-masters', '{paths[1]}');
-- 2. REFUSES a version that is not higher, a missing master
select pg_temp.must(pg_temp.err({q(up_low)}) like '%not higher than every existing version%', 'refuses a version that is not higher');
select pg_temp.must(pg_temp.err({q(up_nomaster)}) like '%does not exist%', 'refuses a missing master');
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 2, 'refusals changed nothing');

-- 3. APPLY
{up}
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 3, 'exactly one row added');
select pg_temp.must((select status = 'draft' and approved_by is null and approved_at is null and content_reference is null and document_hash is null and effective_date is null and activated_at is null and supersedes_id is null and legacy_code is null from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}' and v.version = '{VER}'), 'the new row is a bare draft: no approver, stamp, content reference, date or supersession');
select pg_temp.must(pg_temp.fp() = (select fp_before from t), 'the two existing rows are byte-for-byte unchanged (fingerprint)');
select pg_temp.must((select current_version_id::text from public.legal_document_masters where canonical_code = '{CODE}') = (select cur_before from t), 'the current-version pointer is unchanged');
select pg_temp.must((select count(*) from public.activity_log where action = 'legal.master_version.created_by_migration' and metadata->>'changedExistingRows' = 'false' and metadata->>'approved' = 'false') = 1, 'one creation audit entry');
select pg_temp.must((select master_docx_storage_path from public.legal_document_versions where version = '{VER}' and master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}')) = '{paths[0]}', 'paths recorded');
-- 4. REFUSES to run twice, and refuses to reuse a recorded hash or path
select pg_temp.must(pg_temp.err({q(up)}) like '%already has a version 1.1%', 'refuses a duplicate version');
select pg_temp.must(pg_temp.err({q(up_next)}) like '%already recorded on another version%', 'refuses to reuse a recorded hash or path');
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 3, 'second runs changed nothing');

-- 5. ROLLBACK REFUSES while the row has moved on (status, label, audit, current pointer) and leaves it untouched
update public.legal_document_versions set status = 'legal_review' where version = '{VER}' and master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}');
select pg_temp.must(pg_temp.err({q(down)}) like '%not a draft%', 'rollback refuses a version past draft');
update public.legal_document_versions set status = 'draft', approved_by = 'someone' where version = '{VER}' and master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}');
select pg_temp.must(pg_temp.err({q(down)}) like '%carries an approval%', 'rollback refuses a version with an approver label');
update public.legal_document_versions set approved_by = null where version = '{VER}' and master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}');
insert into public.activity_log (action, entity_type, entity_id, metadata) select 'legal.master_version.status_changed', 'legal_document_version', v.id::text, '{{}}' from public.legal_document_versions v where v.version = '{VER}' and v.master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}');
select pg_temp.must(pg_temp.err({q(down)}) like '%later audit event%', 'rollback refuses when later audit events exist');
delete from public.activity_log where action = 'legal.master_version.status_changed' and entity_id = (select v.id::text from public.legal_document_versions v where v.version = '{VER}' and v.master_id = (select id from public.legal_document_masters where canonical_code = '{CODE}'));
update public.legal_document_masters set current_version_id = (select v.id from public.legal_document_versions v where v.version = '{VER}' and v.master_id = public.legal_document_masters.id) where canonical_code = '{CODE}';
select pg_temp.must(pg_temp.err({q(down)}) like '%current version%', 'rollback refuses when it is a master''s current version');
update public.legal_document_masters set current_version_id = (select cur_before::uuid from t) where canonical_code = '{CODE}';
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 3, 'refused rollbacks removed nothing');

-- 6. ROLLBACK succeeds on the pristine draft: only that row goes, the creation audit stays, a rolled-back entry is appended, the existing rows are unchanged
{down}
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 2, 'rollback removed exactly the new row');
select pg_temp.must(pg_temp.fp() = (select fp_before from t), 'after rollback the existing rows are unchanged (fingerprint)');
select pg_temp.must((select current_version_id::text from public.legal_document_masters where canonical_code = '{CODE}') = (select cur_before from t), 'pointer unchanged after rollback');
select pg_temp.must((select count(*) from public.activity_log where action = 'legal.master_version.created_by_migration') = 1 and (select count(*) from public.activity_log where action = 'legal.master_version.creation_rolled_back') = 1, 'audit kept: creation entry stays and a rolled-back entry is appended');
-- 7. and the cycle can be repeated (the rolled-back hashes and paths are free again)
{up}
select pg_temp.must((select count(*) from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = '{CODE}') = 3, 're-apply after rollback works');
select 'REHEARSAL PASSED: registration apply, refusals, guarded rollback and re-apply' as result;
rollback;
"""
fd, p = tempfile.mkstemp(suffix=".sql"); os.write(fd, sql.encode()); os.close(fd)
def psql(sqltext): return subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", DB, "-X", "-q", "-At"], input=sqltext.encode(), capture_output=True)
snap = "select count(*)::text || ' versions; v1.1: ' || coalesce(string_agg(v.status || '/' || (v.content_reference is not null)::text, ','), 'none') from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = 'OS-LGL-014' and v.version = '1.1'"
before = psql(snap).stdout.decode().strip()
r = psql(open(p).read()); os.unlink(p)
after = psql(snap).stdout.decode().strip()
print(r.stdout.decode().strip() or "(no result)"); err = r.stderr.decode().strip()
if err: print(err[:900])
print(f"lab walkthrough data before: [{before}]  after: [{after}]  ->", "UNCHANGED" if before == after else "CHANGED!")
sys.exit(0 if b"REHEARSAL PASSED" in r.stdout and before == after else 1)
