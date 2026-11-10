#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Final-cancellation financial decisions on the lab database in ONE transaction that is ROLLED BACK. The booking functions, the cancel-stage proposal, notifications v1, v2 and the financial proposal are (re)created INSIDE the transaction
# from the proposal files, whatever the lab already holds, so the proposals as written are what is tested. Lab data untouched (fingerprint printed).
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
snap="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations) || '/' || coalesce((select count(*)::text from public.booking_notification_jobs), 'no-jobs') || '/' || (select count(*) from pg_proc where proname like '%booking_notification%' or proname like '%cancel_ordinary%')"
snap2="select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log) || '/' || (select count(*) from public.enquiry_booking_confirmations)"
has=$(echo "select to_regclass('public.booking_notification_jobs') is not null" | q); S=$([ "$has" = t ] && echo "$snap" || echo "$snap2"); before=$(echo "$S" | q)
{ echo "begin;"; echo "drop function if exists public.record_cancellation_financial_execution(uuid, text, uuid); drop function if exists public.decide_cancellation_financial_action(uuid, text, text, uuid); drop function if exists public.request_cancellation_financial_action(uuid, text, numeric, text, text, uuid); drop table if exists public.cancellation_financial_decisions; drop function if exists private.cancellation_financial_headroom(uuid, text, uuid); drop function if exists private.booking_actor_level(uuid); drop function if exists public.cancel_ordinary_booking(uuid, text, uuid, text); drop function if exists public.defer_booking_client_notice(uuid, text, uuid);"; echo "$funcs"; sed -n '1,52p' "$D/REHEARSE_booking_body.sql"
  echo "drop table if exists public.booking_notification_jobs cascade; drop function if exists public.claim_booking_notification_job(uuid,text,boolean,interval); drop function if exists public.finish_booking_notification_job(uuid,text,text,text,jsonb,int,text,text); drop function if exists private.booking_confirmation_creates_notification_jobs() cascade; drop function if exists private.booking_notification_jobs_guard() cascade; alter table public.enquiry_booking_confirmations drop constraint if exists booking_cancellation_outcome_valid; alter table public.enquiry_booking_confirmations drop column if exists cancellation_outcome;"
  grep -v -E '^(begin|commit);$' "$D/PROPOSAL_booking_notifications.sql"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_booking_notices_v2.sql"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_cancellation_financial_decisions.sql"; cat "$D/REHEARSE_cancellation_financial_section.sql"; echo "rollback;"; } | q
after=$(echo "$S" | q)
echo "lab before: $before"; echo "lab after:  $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED-INVESTIGATE)"
