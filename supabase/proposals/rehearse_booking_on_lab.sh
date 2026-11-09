#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs the booking rehearsal body (full) or the availability section against the lab database WHEN THE BOOKING PROPOSAL IS ALREADY APPLIED THERE (the walkthrough lab),
# inside ONE transaction that is ROLLED BACK. The proposal's two rule functions (private.booking_conflicts, public.confirm_ordinary_booking) are re-created INSIDE the transaction from the proposal file,
# so the rehearsal always tests the proposal as written, not whatever the lab happens to hold. The lab's data and functions are untouched afterwards.
#   ./rehearse_booking_on_lab.sh full | availability
M=${1:-full}; C=${2:-ordift-mig-check2}; DB=${3:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
funcs=$(python3 - "$D/PROPOSAL_booking_confirmation.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf8").read()
out = []
for name in ("private.booking_conflicts", "public.preview_booking_conflicts", "public.confirm_ordinary_booking"):
    m = re.search(r"create or replace function " + re.escape(name) + r"\(.*?\n(?:end \$\$;|\$\$;)", s, re.S)
    if not m: sys.exit("function not found in the proposal: " + name)
    out.append(m.group(0))
print("\n".join(out))
PY
)
snap="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations) || '/' || md5(pg_get_functiondef('public.confirm_ordinary_booking(jsonb,uuid)'::regprocedure))"
before=$(echo "$snap" | q)
case "$M" in
  full) { echo "begin;"; echo "$funcs"; cat "$D/REHEARSE_booking_body.sql"; echo "rollback;"; } | q ;;
  availability) { echo "begin;"; echo "$funcs"; sed -n '1,52p' "$D/REHEARSE_booking_body.sql"; cat "$D/REHEARSE_availability_section.sql"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 full|availability"; exit 2 ;;
esac
after=$(echo "$snap" | q)
echo "lab (enquiries/activity/confirmations/function fingerprint) before: $before"; echo "                                                         after:  $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
