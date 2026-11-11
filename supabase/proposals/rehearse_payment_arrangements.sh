#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Migration 0186 + PROPOSAL_acquisition_payment_arrangements.sql + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK.
#   apply    : 0186, the proposal, the checks      rollback : ... then the ROLLBACK script, then verifies every new object is gone, the audit-event list is back to its 0186 form and the 0186 tables remain
#   both     : 0186 + 0187, then the ORIGINAL 0186 finance checks (the PayLater/instalment workflow must be unaffected)
#   verifier : self-test: the "everything is gone" check MUST fail while the proposal is still applied
# Usage: rehearse_payment_arrangements.sh [apply|rollback|both|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
R0="$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; R1="$D/ROLLBACK_acquisition_payment_arrangements.sql"; B0="$D/../migrations/0186_equipment_acquisitions_and_financing.sql"; P="${PROPOSAL_FILE:-$D/../migrations/0187_acquisition_payment_arrangements.sql}"; R="$D/ROLLBACK_acquisition_payment_arrangements.sql"; B="$D/REHEARSE_payment_arrangements_body.sql"
clean=$(cat <<'SQL'
set session_replication_role = replica; delete from public.entity_acquisition_payments; delete from public.entity_acquisition_terms; delete from public.entity_finance_events where event_type in ('terms_set', 'payment_recorded', 'payment_voided'); set session_replication_role = origin;
SQL
)
gone=$(cat <<'SQL'
do $$ begin if to_regclass('public.entity_acquisition_payments') is not null or to_regclass('public.entity_acquisition_terms') is not null or to_regprocedure('public.record_acquisition_payment(uuid, text, numeric, date, text, text, text, uuid, text, uuid)') is not null or to_regprocedure('public.set_acquisition_terms(uuid, text, date, text, text, uuid)') is not null or to_regprocedure('public.void_acquisition_payment(uuid, text, uuid)') is not null or to_regprocedure('public.record_acquisition_bundle(jsonb, uuid)') is not null or to_regprocedure('private.payments_guard()') is not null or to_regprocedure('private.terms_guard()') is not null
  or to_regclass('public.entity_equipment_acquisitions') is null or (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ilike '%payment_recorded%' then raise exception 'ROLLBACK LEFT OBJECTS BEHIND OR REMOVED TOO MUCH'; end if; end $$;
SQL
)
has() { [ "$(printf "select to_regclass('$1') is not null;" | q)" = t ]; }
pre() { has public.entity_acquisition_payments && strip "$R1"; has public.entity_equipment_acquisitions && strip "$R0"; true; }
case "$M" in
  apply)    { echo "begin;"; pre; strip "$B0"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; strip "$B0"; strip "$P"; cat "$B"; echo "$clean"; strip "$R"; echo "$gone"; echo "rollback;"; } | q ;;
  both)     { echo "begin;"; pre; strip "$B0"; strip "$P"; cat "$D/REHEARSE_finance_body.sql"; echo "rollback;"; } | q ;;     # the 0186 instalment/PayLater checks, unchanged, with 0187 applied on top
  verifier) { echo "begin;"; pre; strip "$B0"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|both|verifier"; exit 2 ;;
esac
