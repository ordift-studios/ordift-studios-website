#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Migrations 0186 + 0187 + PROPOSAL_asset_ownership_and_acquisition_link.sql + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK.
#   apply    : 0186, the proposal, the checks      rollback : ... then the ROLLBACK script, then verifies every new object is gone, the audit-event list is back to its 0186 form and the 0186 tables remain
#   both     : 0186 + 0187, then the ORIGINAL 0186 finance checks (the PayLater/instalment workflow must be unaffected)
#   verifier : self-test: the "everything is gone" check MUST fail while the proposal is still applied
# Usage: rehearse_payment_arrangements.sh [apply|rollback|both|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
R0="$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; R1="$D/ROLLBACK_acquisition_payment_arrangements.sql"; B0="$D/../migrations/0186_equipment_acquisitions_and_financing.sql"; B1="$D/../migrations/0187_acquisition_payment_arrangements.sql"; P="${PROPOSAL_FILE:-$D/../migrations/0188_asset_ownership_and_acquisition_link.sql}"; R="$D/ROLLBACK_asset_ownership_and_acquisition_link.sql"; B="$D/REHEARSE_asset_link_body.sql"
clean=$(cat <<'SQL'
set session_replication_role = replica; delete from public.entity_asset_ownership; update public.entity_equipment_acquisitions set company_asset_id = null; delete from public.entity_finance_events where event_type in ('asset_ownership_recorded', 'asset_ownership_voided', 'asset_linked'); set session_replication_role = origin;
SQL
)
gone=$(cat <<'SQL'
do $$ begin if to_regclass('public.entity_asset_ownership') is not null or to_regproc('public.record_asset_ownership(uuid, uuid, text, text, boolean, text, text, uuid, uuid)') is not null or to_regproc('public.void_asset_ownership(uuid, text, uuid)') is not null or to_regproc('public.link_acquisition_to_asset(uuid, uuid, uuid)') is not null or to_regproc('private.ownership_guard()') is not null or to_regproc('private.acquisition_asset_link_guard()') is not null or to_regclass('public.acquisitions_one_per_asset') is not null
  or to_regclass('public.entity_acquisition_payments') is null or (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ilike '%asset_linked%' then raise exception 'ROLLBACK LEFT OBJECTS BEHIND OR REMOVED TOO MUCH'; end if; end $$;
SQL
)
pre() { if [ "$(printf "select to_regclass('public.entity_equipment_acquisitions') is not null;" | q)" = t ]; then strip "$R1"; strip "$R0"; fi; }
case "$M" in
  apply)    { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$P"; cat "$B"; echo "$clean"; strip "$R"; echo "$gone"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; pre; strip "$B0"; strip "$B1"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|both|verifier"; exit 2 ;;
esac
