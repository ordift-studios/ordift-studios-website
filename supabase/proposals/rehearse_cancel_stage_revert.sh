#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs REHEARSE_cancel_stage_revert_section.sql against the lab database in ONE transaction that is ROLLED BACK.
# The booking functions (from PROPOSAL_booking_confirmation.sql) and the NEW cancel function (from PROPOSAL_booking_cancel_reverts_stage.sql) are re-created INSIDE the transaction,
# so the proposal as written is what is tested. The lab's data and functions are untouched afterwards (fingerprint printed before/after).
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
funcs=$(python3 - "$D/PROPOSAL_booking_confirmation.sql" "$D/PROPOSAL_booking_cancel_reverts_stage.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf8").read(); c = open(sys.argv[2], encoding="utf8").read()
out = []
for name in ("private.parse_clock", "private.crew_request_overlaps", "private.booking_conflicts", "public.preview_booking_conflicts", "public.confirm_ordinary_booking"):
    m = re.search(r"create or replace function " + re.escape(name) + r"\(.*?\n(?:end \$\$;|\$\$;)", s, re.S)
    if not m: sys.exit("function not found: " + name)
    out.append(m.group(0))
m = re.search(r"create or replace function public\.cancel_ordinary_booking\(.*?\n(?:end \$\$;|\$\$;)", c, re.S)
if not m: sys.exit("new cancel function not found")
out.append(m.group(0))
print("\n".join(out))
PY
)
snap="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations) || '/' || (select count(*) from public.payments) || '/' || md5(pg_get_functiondef('public.cancel_ordinary_booking(uuid,text,uuid)'::regprocedure) || pg_get_functiondef('public.confirm_ordinary_booking(jsonb,uuid)'::regprocedure))"
before=$(echo "$snap" | q)
{ echo "begin;"; echo "$funcs"; sed -n '1,52p' "$D/REHEARSE_booking_body.sql"; cat "$D/REHEARSE_cancel_stage_revert_section.sql"; echo "rollback;"; } | q
after=$(echo "$snap" | q)
echo "lab (enquiries/activity/confirmations/payments/function fingerprint) before: $before"; echo "                                                                   after:  $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED-INVESTIGATE)"
