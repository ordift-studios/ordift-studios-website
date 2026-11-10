#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). The OPTIONAL duplicate-expense guard on top of the finance proposal, on the scratch database p4_e2e, inside ONE transaction that is ROLLED BACK.
#   apply    : finance proposal, optional guard, then the checks
#   rollback : ... then ROLLBACK_optional_duplicate_expense_guard.sql, then verifies the trigger and function are gone AND that the finance tables are still there
# Usage: rehearse_optional_expense_guard.sh [apply|rollback] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
gone=$(cat <<'SQL'
do $$ begin if exists (select 1 from pg_trigger where tgname = 'entity_expenses_not_an_acquisition') or to_regproc('private.expense_not_an_acquisition') is not null or to_regclass('public.entity_equipment_acquisitions') is null then raise exception 'OPTIONAL ROLLBACK WRONG STATE'; end if; end $$;
SQL
)
case "$M" in
  apply)    { echo "begin;"; strip "$D/PROPOSAL_equipment_acquisitions_and_financing.sql"; strip "$D/PROPOSAL_optional_duplicate_expense_guard.sql"; cat "$D/REHEARSE_optional_expense_guard_body.sql"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; strip "$D/PROPOSAL_equipment_acquisitions_and_financing.sql"; strip "$D/PROPOSAL_optional_duplicate_expense_guard.sql"; cat "$D/REHEARSE_optional_expense_guard_body.sql"; strip "$D/ROLLBACK_optional_duplicate_expense_guard.sql"; echo "$gone"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; strip "$D/PROPOSAL_equipment_acquisitions_and_financing.sql"; strip "$D/PROPOSAL_optional_duplicate_expense_guard.sql"; echo "$gone"; echo "rollback;"; } | q ;;   # self-test: MUST fail while the guard is still applied
  *) echo "usage: $0 apply|rollback|verifier"; exit 2 ;;
esac
