#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Migrations 0186 + 0187 + 0188 + PROPOSAL_founder_ownership_and_unlink.sql + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK.
#   apply    : 0186, the proposal, the checks      rollback : ... then the ROLLBACK script, then verifies every new object is gone, the audit-event list is back to its 0186 form and the 0186 tables remain
#   both     : 0186 + 0187, then the ORIGINAL 0186 finance checks (the PayLater/instalment workflow must be unaffected)
#   verifier : self-test: the "everything is gone" check MUST fail while the proposal is still applied
# Usage: rehearse_payment_arrangements.sh [apply|rollback|both|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
R0="$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; R1="$D/ROLLBACK_acquisition_payment_arrangements.sql"; B0="$D/../migrations/0186_equipment_acquisitions_and_financing.sql"; B1="$D/../migrations/0187_acquisition_payment_arrangements.sql"; B2="$D/../migrations/0188_asset_ownership_and_acquisition_link.sql"; R2="$D/ROLLBACK_asset_ownership_and_acquisition_link.sql"; P="${PROPOSAL_FILE:-$D/../migrations/0189_founder_ownership_and_unlink.sql}"; R="$D/ROLLBACK_founder_ownership_and_unlink.sql"; B="$D/REHEARSE_founder_ownership_body.sql"
clean=$(cat <<'SQL'
set session_replication_role = replica; delete from public.entity_finance_events where event_type = 'asset_unlinked' or detail ->> 'ownerKind' = 'founder_personal'; delete from public.entity_asset_ownership where owner_kind <> 'legal_entity'; set session_replication_role = origin;
SQL
)
gone=$(cat <<'SQL'
do $$ begin
  if to_regprocedure('public.record_founder_asset_ownership(uuid, uuid, text, text, text, text, boolean, text, uuid, uuid)') is not null then raise exception 'ROLLBACK LEFT: record_founder_asset_ownership'; end if;
  if to_regprocedure('public.unlink_acquisition_from_asset(uuid, text, uuid)') is not null then raise exception 'ROLLBACK LEFT: unlink function'; end if;
  if to_regprocedure('private.ownership_kind_guard()') is not null or to_regprocedure('private.acquisition_personal_link_guard()') is not null then raise exception 'ROLLBACK LEFT: guard functions'; end if;
  if exists (select 1 from information_schema.columns where table_name = 'entity_asset_ownership' and column_name in ('owner_kind', 'owner_profile_id', 'company_funded', 'excluded_from_company_fixed_assets', 'primary_user_as_stated', 'financing_obligor_as_stated')) then raise exception 'ROLLBACK LEFT: columns'; end if;
  if to_regclass('public.entity_asset_ownership') is null or to_regprocedure('public.link_acquisition_to_asset(uuid, uuid, uuid)') is null then raise exception 'ROLLBACK REMOVED TOO MUCH: 0188 objects'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ilike '%asset_unlinked%' then raise exception 'ROLLBACK LEFT: event type list'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'acquisition_asset_link_guard') then raise exception 'ROLLBACK REMOVED TOO MUCH: 0188 link guard trigger'; end if;
end $$;
SQL
)
snap=$(cat <<'SQL'
create temp table t_snap as select (select md5(string_agg(conname || pg_get_constraintdef(oid), '|' order by conname)) from pg_constraint where conrelid = 'public.entity_asset_ownership'::regclass) c, (select md5(string_agg(indexdef, '|' order by indexname)) from pg_indexes where schemaname = 'public' and tablename in ('entity_asset_ownership', 'entity_equipment_acquisitions')) i,
 (select md5(string_agg(policyname || cmd || qual::text, '|' order by policyname)) from pg_policies where tablename = 'entity_asset_ownership') p, (select md5(string_agg(grantee || privilege_type, '|' order by grantee, privilege_type)) from information_schema.role_table_grants where table_name = 'entity_asset_ownership') g,
 (select md5(string_agg(a || b || c, '|' order by a)) from (select proname a, has_function_privilege('service_role', oid, 'execute')::text b, (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))::text c from pg_proc where pronamespace = 'public'::regnamespace and proname in ('record_asset_ownership', 'void_asset_ownership', 'link_acquisition_to_asset')) z) f;
grant all on t_snap to public;
SQL
)
has() { [ "$(printf "select to_regclass('$1') is not null;" | q)" = t ]; }
pre() { has public.entity_asset_ownership && strip "$R2"; has public.entity_acquisition_payments && strip "$R1"; has public.entity_equipment_acquisitions && strip "$R0"; true; }
case "$M" in
  apply)    { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$B2"; echo "$snap"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$B2"; echo "$snap"; strip "$P"; cat "$B"; echo "$clean"; strip "$R"; echo "$gone"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$B2"; echo "$snap"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|both|verifier"; exit 2 ;;
esac
