#!/bin/bash
# LOCAL REHEARSAL ONLY. Applies the indexed-search proposal and then its rollback inside one transaction that is ROLLED BACK, and checks that everything the proposal added is gone and the contacts table is as before.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_staff_client_lookup_indexed_search.sql"; grep -v -E '^(begin|commit);$' "$D/ROLLBACK_staff_client_lookup_indexed_search.sql"; cat <<'SQL'
do $$ begin
  if to_regprocedure('public.staff_client_lookup(text,text,int)') is not null or to_regprocedure('private.fold_text(text)') is not null or to_regprocedure('private.phone_keys(text[])') is not null then raise exception 'ROLLBACK REHEARSAL FAILED: a function is still there'; end if;
  if exists (select 1 from pg_indexes where indexname in ('contacts_search_text_trgm_idx','contacts_phone_keys_idx','contact_emails_active_personal_lower_idx','organisations_normalized_name_trgm_idx')) then raise exception 'ROLLBACK REHEARSAL FAILED: an index is still there'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'search_text') then raise exception 'ROLLBACK REHEARSAL FAILED: the column is still there'; end if;
end $$;
select 'STAFF LOOKUP INDEX ROLLBACK REHEARSAL PASSED' as result;
rollback;
SQL
} | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At
