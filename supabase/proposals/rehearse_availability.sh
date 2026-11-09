#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs the booking rehearsal's shared setup and REHEARSE_availability_section.sql inside ONE transaction that is ROLLED BACK, on the lab database.
# If the booking proposal is not applied in the lab it is applied INSIDE the same transaction (and rolled back with it). The lab's walkthrough data is untouched.
C=${1:-ordift-mig-check2}; DB=${2:-p4_e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
have=$(echo "select to_regprocedure('public.preview_booking_conflicts(uuid,jsonb,uuid)') is not null" | q)
before=$(echo "select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log)" | q)
{ echo "begin;"; [ "$have" = "t" ] || grep -v -E '^(begin|commit);$' "$D/PROPOSAL_booking_confirmation.sql"; sed -n '1,52p' "$D/REHEARSE_booking_body.sql"; cat "$D/REHEARSE_availability_section.sql"; echo "rollback;"; } | q
after=$(echo "select (select count(*) from public.enquiries) || '/' || (select count(*) from public.activity_log)" | q)
echo "lab rows (enquiries/activity) before: $before after: $after -> $([ "$before" = "$after" ] && echo UNCHANGED || echo CHANGED)"
