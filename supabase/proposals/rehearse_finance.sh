#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs PROPOSAL_equipment_acquisitions_and_financing.sql + its rehearsal body on the local scratch database p4_e2e (build it first with e2e_scratch.sh) inside ONE transaction that is ROLLED BACK.
#   apply    : the proposal, then the checks
#   rollback : the proposal, the checks, then the ROLLBACK script, then verifies every object is gone
# Usage: rehearse_finance.sh [apply|rollback] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
P="$D/PROPOSAL_equipment_acquisitions_and_financing.sql"; R="$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; B="$D/REHEARSE_finance_body.sql"
# the rehearsal body leaves rows behind on purpose (the real tables refuse deletion); for the ROLLBACK rehearsal they are cleared with triggers off, because the real rollback script refuses to run over data
clean='set session_replication_role = replica; delete from public.entity_finance_events; delete from public.entity_financing_instalments; delete from public.entity_financing_obligations; delete from public.entity_equipment_acquisitions; set session_replication_role = origin;'
gone='do $$ begin if to_regclass('public.entity_equipment_acquisitions') is not null or to_regproc('public.record_equipment_acquisition') is not null or exists (select 1 from pg_trigger where tgname = 'entity_expenses_not_an_acquisition') then raise exception 'ROLLBACK LEFT OBJECTS BEHIND'; end if; end $$;'
case "$M" in
  apply)    { echo "begin;"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; strip "$P"; cat "$B"; echo "$clean"; strip "$R"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback"; exit 2 ;;
esac
