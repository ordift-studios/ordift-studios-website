#!/bin/bash
# LOCAL REHEARSAL ONLY. Runs the REAL proposed SQL plus its rehearsal body inside one transaction against a local disposable copy of the schema, then ROLLS BACK.
# Usage: rehearse.sh [enquiry|portfolio|all] [container]   (default: all, ordift-mig-check2). Never point this at Production.
W=${1:-all}; C=${2:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
run() { # body file, migration files...
  local body=$1; shift
  { echo "begin;"; for f in "$@"; do grep -v -E '^(begin|commit);$' "$D/$f"; done; cat "$D/$body"; echo "rollback;"; } \
   | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -X -q -v ON_ERROR_STOP=1 -At
}
[ "$W" = enquiry ] || [ "$W" = all ] && { echo "== 0168 enquiry pricing"; run REHEARSE_0168_body.sql PROPOSED_0168_enquiry_pricing_followups.sql; }
[ "$W" = portfolio ] || [ "$W" = all ] && { echo "== 0169-0171 portfolio library"; run REHEARSE_0169_0171_portfolio_body.sql PROPOSED_0169_portfolio_library_foundation.sql PROPOSED_0170_portfolio_marketing_permissions.sql PROPOSED_0171_portfolio_internal_approval_and_use.sql; }
exit 0
