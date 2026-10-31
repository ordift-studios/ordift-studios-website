#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs PROPOSED_0177 + its rehearsal body in ONE transaction against the local scratch database p4_e2e (build it first with
# rebuild_scratch.sh / e2e_scratch.sh), then ROLLS BACK. Mode "rollback" additionally applies ROLLBACK_0177 inside the same transaction and verifies the schema is back to 0173.
# Usage: rehearse_0177.sh [apply|rollback] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
if [ "$M" = apply ]; then
  { echo "begin;"; strip "$D/PROPOSED_0177_entity_signatory_supersession.sql"; cat "$D/REHEARSE_0177_body.sql"; echo "rollback;"; } | q
else
  { echo "begin;"
    echo "create temp table before_state as select md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)) as guard_md5, (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='entity_signatories') as cols, (select count(*) from public.entity_signatories) as rows;"
    strip "$D/PROPOSED_0177_entity_signatory_supersession.sql"; cat "$D/REHEARSE_0177_body.sql"; strip "$D/ROLLBACK_0177_entity_signatory_supersession.sql"
    cat <<'SQL'
do $$ declare b record; begin
  select * into b from before_state;
  if md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)) = b.guard_md5 then null; else raise notice 'note: guard text differs from the pre-0177 text only if 0177 body left it changed'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='entity_signatories' and column_name in ('supersedes_id','supersession_reason')) then raise exception 'ROLLBACK FAIL: columns remain'; end if;
  if to_regprocedure('public.supersede_entity_signatory(uuid,text,text,date,uuid,text)') is not null then raise exception 'ROLLBACK FAIL: function remains'; end if;
  if exists (select 1 from pg_indexes where tablename='entity_signatories' and indexname in ('entity_signatories_one_successor','entity_signatories_one_current_person')) then raise exception 'ROLLBACK FAIL: index remains'; end if;
  -- the 0173 guard is back: a direct end-date is refused again
  begin update public.entity_signatories set effective_to = current_date where effective_to is null and full_name like 'Synthetic Unlinked Corrected'; raise exception 'ROLLBACK FAIL: end-date allowed after rollback'; exception when sqlstate '42501' then null; end;
  raise notice 'ROLLBACK REHEARSAL: schema restored to 0173; superseded rows kept as data';
end $$;
SQL
    echo "rollback;"; } | q
fi
