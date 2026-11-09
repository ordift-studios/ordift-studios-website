#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs REHEARSE_booking_notifications_section.sql against the lab database in ONE transaction that is ROLLED BACK. The booking functions, the new cancel function and the
# notification proposal are (re)created INSIDE the transaction from the proposal files, so the proposals as written are what is tested. Works whether or not the lab already holds the proposal. Lab data untouched (fingerprint printed).
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
funcs=$(python3 - "$D/PROPOSAL_booking_confirmation.sql" "$D/PROPOSAL_booking_cancel_reverts_stage.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf8").read(); c = open(sys.argv[2], encoding="utf8").read(); out = []
for name in ("private.parse_clock", "private.crew_request_overlaps", "private.booking_conflicts", "public.preview_booking_conflicts", "public.confirm_ordinary_booking"):
    m = re.search(r"create or replace function " + re.escape(name) + r"\(.*?\n(?:end \$\$;|\$\$;)", s, re.S)
    if not m: sys.exit("function not found: " + name)
    out.append(m.group(0))
m = re.search(r"create or replace function public\.cancel_ordinary_booking\(.*?\n(?:end \$\$;|\$\$;)", c, re.S); out.append(m.group(0)); print("\n".join(out))
PY
)
snap="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations) || '/' || coalesce((select count(*)::text from public.booking_notification_jobs), 'no-table')"
snap2="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations)"
has=$(echo "select to_regclass('public.booking_notification_jobs') is not null" | q)
S=$([ "$has" = t ] && echo "$snap" || echo "$snap2"); before=$(echo "$S" | q)
{ echo "begin;"; echo "$funcs"; sed -n '1,52p' "$D/REHEARSE_booking_body.sql"
  if [ "$has" = t ]; then echo "drop table public.booking_notification_jobs cascade; drop function if exists public.claim_booking_notification_job(uuid,text,boolean,interval); drop function if exists public.finish_booking_notification_job(uuid,text,text,text,jsonb,int,text,text); drop function if exists private.booking_confirmation_creates_notification_jobs() cascade; drop function if exists private.booking_notification_jobs_guard() cascade;"; fi
  grep -v -E '^(begin|commit);$' "$D/PROPOSAL_booking_notifications.sql"; cat "$D/REHEARSE_booking_notifications_section.sql"; echo "rollback;"; } | q
after=$(echo "$S" | q)
echo "lab (enquiries/activity/confirmations[/jobs]) before: $before"; echo "                                          after:  $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED-INVESTIGATE)"
