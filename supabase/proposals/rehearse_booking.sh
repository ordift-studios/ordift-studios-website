#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). PROPOSAL_booking_confirmation.sql + its rehearsal body on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK.
# Build the Production-shaped database first:  supabase/proposals/rehearse_production_shape.sh
#   apply    : the proposal, then the checks
#   rollback : the proposal, the checks, then ROLLBACK_booking_confirmation.sql, then verifies every object is gone
#   refuses  : the proposal, one confirmation, then the rollback: it MUST refuse (data exists) and leave the tables
#   verifier : self-test, the "everything is gone" check MUST fail while the proposal is still applied
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
P="$D/PROPOSAL_booking_confirmation.sql"; R="$D/ROLLBACK_booking_confirmation.sql"; B="$D/REHEARSE_booking_body.sql"
clean=$(cat <<'SQL'
set session_replication_role = replica; delete from public.enquiry_booking_segments; delete from public.enquiry_booking_confirmations; delete from public.booking_rule_settings; set session_replication_role = origin;
SQL
)
gone=$(cat <<'SQL'
do $$ begin if to_regclass('public.enquiry_booking_confirmations') is not null or to_regclass('public.enquiry_booking_segments') is not null or to_regclass('public.booking_rule_settings') is not null or to_regproc('public.confirm_ordinary_booking') is not null or to_regproc('public.cancel_ordinary_booking') is not null or to_regproc('public.preview_booking_conflicts') is not null or to_regproc('private.booking_conflicts') is not null then raise exception 'ROLLBACK LEFT OBJECTS BEHIND'; end if; end $$;
SQL
)
case "$M" in
  apply)    { echo "begin;"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; strip "$P"; cat "$B"; echo "$clean"; strip "$R"; echo "$gone"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  refuses)  { echo "begin;"; strip "$P"; sed -n '1,/^-- 1\. the plain case/p' "$B" | sed '$d'; echo "select pg_temp.conf(pg_temp.pl(pg_temp.mk(1, '44444444-4444-4444-8444-444444444401', 'QAR', 2500, 'photography', 1000, 0)));";
              echo "savepoint s;"; echo '\set ON_ERROR_STOP off'; strip "$R"; echo "rollback to savepoint s;"; echo '\set ON_ERROR_STOP on';
              echo "select case when to_regclass('public.enquiry_booking_confirmations') is not null and (select count(*) from public.enquiry_booking_confirmations) = 1 then 'BOOKING ROLLBACK REFUSES WITH DATA: PASSED' else 'FAILED: data or table lost' end;"; echo "rollback;"; } | q 2>&1 | grep -E "PASSED|FAILED" ;;
  *) echo "usage: $0 apply|rollback|refuses|verifier"; exit 2 ;;
esac
