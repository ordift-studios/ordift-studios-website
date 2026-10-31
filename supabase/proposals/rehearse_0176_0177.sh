#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Rehearses the ORDER of the two pending migrations on the local scratch database p4_e2e (build it first with rebuild_scratch.sh / e2e_scratch.sh).
# Everything runs inside ONE transaction that is ROLLED BACK. Modes:
#   seqA  : 0176 then 0177 (recommended), then rollback 0177, then rollback 0176 - guard restored step by step, historical rows kept
#   seqB  : 0177 first, then 0176 AMENDED with PROPOSED_0176_amendment_for_0177.diff, then rollback 0176 (amended), then rollback 0177
#   neg   : 0177 first, then the ORIGINAL 0176 - shows the supersession path failing closed (why the amendment/ordering is needed)
M=${1:-seqA}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp "$D/PROPOSED_0176_ghana_admin_enhancements.sql" "$T/a0176.sql"; (cd "$T" && patch -s a0176.sql < "$D/PROPOSED_0176_amendment_for_0177.diff" >/dev/null 2>&1) || true
M0176="$D/PROPOSED_0176_ghana_admin_enhancements.sql"; M0177="$D/../migrations/0177_entity_signatory_supersession.sql"; R0176="$D/ROLLBACK_0176_ghana_admin_enhancements.sql"; R0177="$D/ROLLBACK_0177_entity_signatory_supersession.sql"
gmd5() { echo "insert into pg_temp.g values ('$1', md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)));"; }
expect_guard() { echo "do \$\$ begin if (select v from pg_temp.g where k='$1') is distinct from md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)) then raise exception 'GUARD MISMATCH: expected the $1 guard'; end if; raise notice 'guard is the $1 guard'; end \$\$;"; }
counts() { echo "insert into pg_temp.c select '$1', (select count(*) from public.agreements), (select count(*) from public.agreement_snapshots), (select count(*) from public.signature_requests), (select count(*) from public.entity_signatories where full_name not like 'Synthetic%');"; }
same_counts() { echo "do \$\$ begin if (select count(distinct (a,s,r,e)) from pg_temp.c) <> 1 then raise exception 'HISTORICAL RECORD COUNTS CHANGED'; end if; raise notice 'historical records unchanged (agreements, snapshots, signature requests, real signatories)'; end \$\$;"; }
# Build the full scripts per mode (kept simple and explicit)
build_seqA() {
  echo "begin; create temp table g (k text, v text); create temp table c (k text, a bigint, s bigint, r bigint, e bigint);"
  gmd5 0173; counts start
  strip "$M0176"; gmd5 0176; counts after0176
  cat "$D/REHEARSE_0176_0177_extra.sql"
  strip "$M0177"; counts after0177
  cat "$D/REHEARSE_0177_body.sql"; cat "$D/REHEARSE_0176_0177_extra.sql"
  echo "create temp table kept as select count(*)::int as n from public.entity_signatories where full_name like 'Synthetic%';"
  strip "$R0177"; expect_guard 0176
  echo "do \$\$ begin if exists (select 1 from information_schema.columns where table_name='entity_signatories' and column_name in ('supersedes_id','supersession_reason')) or to_regprocedure('public.supersede_entity_signatory(uuid,text,text,date,uuid,text)') is not null then raise exception 'ROLLBACK 0177 incomplete'; end if; if (select count(*) from public.entity_signatories where full_name like 'Synthetic%') <> (select n from pg_temp.kept) then raise exception 'SUPERSEDED ROWS NOT PRESERVED'; end if; raise notice 'rollback 0177 done; guard restored to the 0176 guard; synthetic history preserved'; end \$\$;"
  strip "$R0176"; expect_guard 0173; counts end
  echo "do \$\$ begin if exists (select 1 from information_schema.columns where table_name='entity_signatories' and column_name='signing_designation') or to_regclass('public.entity_compliance_reviews') is not null then raise exception 'ROLLBACK 0176 incomplete'; end if; if (select count(*) from public.entity_signatories where full_name like 'Synthetic%') <> (select n from pg_temp.kept) then raise exception 'SUPERSEDED ROWS NOT PRESERVED'; end if; raise notice 'rollback 0176 done; guard back to the 0173 guard; synthetic history preserved'; end \$\$;"
  same_counts; echo "rollback;"
}
build_seqB() {
  echo "begin; create temp table g (k text, v text); create temp table c (k text, a bigint, s bigint, r bigint, e bigint);"
  gmd5 0173; counts start
  strip "$M0177"; gmd5 0177; counts after0177
  cat "$D/REHEARSE_0177_body.sql"
  strip "$T/a0176.sql"; counts after0176amended
  cat "$D/REHEARSE_0176_0177_extra.sql"
  echo "create temp table kept as select count(*)::int as n from public.entity_signatories where full_name like 'Synthetic%';"
  strip "$R0176"; expect_guard 0177
  echo "do \$\$ begin if exists (select 1 from information_schema.columns where table_name='entity_signatories' and column_name='signing_designation') or to_regclass('public.entity_compliance_reviews') is not null then raise exception 'ROLLBACK 0176 incomplete'; end if; raise notice 'rollback of amended 0176 done; guard is the 0177 guard (supersession kept)'; end \$\$;"
  cat "$D/REHEARSE_0176_0177_extra.sql"
  strip "$R0177"; expect_guard 0173; counts end
  echo "do \$\$ begin if (select count(*) from public.entity_signatories where full_name like 'Synthetic%') <> (select n from pg_temp.kept) then raise exception 'SUPERSEDED ROWS NOT PRESERVED'; end if; raise notice 'rollback 0177 done; guard back to the 0173 guard; synthetic history preserved'; end \$\$;"
  same_counts; echo "rollback;"
}
build_neg() {
  echo "begin; create temp table g (k text, v text); create temp table c (k text, a bigint, s bigint, r bigint, e bigint);"
  strip "$M0177"; strip "$M0176"
  cat "$D/REHEARSE_0176_0177_extra.sql"
  echo "rollback;"
}
case "$M" in seqA) build_seqA | q ;; seqB) build_seqB | q ;; neg) build_neg | q ;; *) echo "usage: $0 seqA|seqB|neg"; exit 2 ;; esac
