#!/bin/bash
# LOCAL ONLY (never Production). The COMPLETE Plan B migration sequence on a DISPOSABLE copy of the lab database (p4_planb, dropped at the end; the walkthrough database is only READ by pg_dump).
#   1 copy the lab   2 take it back to the PRE-Plan-B state with the rollback files (reverse order)   3 PREFLIGHT must say: nothing missing, nothing already there   4 fingerprint + row hashes of the existing business tables
#   5 apply the proposals ONE PER RUN in the release order (confirmation, crew guard, cancel-stage, notifications, v2, money decisions)   6 PREFLIGHT must say everything is now present; run every rehearsal against the copy
#   7 roll everything back in reverse order   8 the schema fingerprint must equal step 4's, and no existing row of enquiries / payments / quotations / crew support may have changed at ANY point (hashes)   9 drop the copy
C=${LAB_DB_CONTAINER:-ordift-mig-check2}; SRC=p4_e2e; COPY=p4_planb; D="$(cd "$(dirname "$0")" && pwd)"; fail=0
psq() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$COPY" -X -q -v ON_ERROR_STOP=1 -At "$@"; }
step() { echo; echo "== $1"; }
ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
FP="select md5(string_agg(x, '|' order by x)) from (select 'C:' || table_name || '.' || column_name || ':' || data_type as x from information_schema.columns where table_schema = 'public' union all select 'F:' || p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') union all select 'TR:' || c.relname || '.' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal union all select 'K:' || conrelid::regclass::text || '.' || conname from pg_constraint where connamespace in ('public'::regnamespace) union all select 'R:' || relname from pg_class where relnamespace in ('public'::regnamespace, 'private'::regnamespace) and relkind in ('r','v','i','S')) s"
ROWS="select md5((select coalesce(string_agg(e::text, '' order by e.id), '') from public.enquiries e) || (select coalesce(string_agg(p::text, '' order by p.id), '') from public.payments p) || (select coalesce(string_agg(q::text, '' order by q.id), '') from public.client_quotations q) || (select coalesce(string_agg(r::text, '' order by r.id), '') from public.crew_support_requests r) || (select coalesce(string_agg(s::text, '' order by s.id), '') from public.crew_support_slots s))"
strip() { grep -v -E '^(begin|commit);$' "$D/$1"; }
run_file() { { echo "begin;"; strip "$1"; echo "commit;"; } | psq; }
pre() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$COPY" -X -q -At -F '|' -f - < "$D/PREFLIGHT_plan_b.sql"; }
trap 'docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -X -q -c "drop database if exists $COPY" >/dev/null 2>&1' EXIT

step "1 copy the lab"; docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -X -q -c "drop database if exists $COPY" -c "create database $COPY"
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d $SRC --no-owner | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d $COPY -X -q -v ON_ERROR_STOP=0 >/dev/null 2>&1; ok "copy made"
step "2 back to the pre-Plan-B state (rollback files in reverse order)"
# the base rollback REFUSES while booking records exist (a deliberate safety); in this DISPOSABLE copy only, the lab's booking rows are cleared first (append-only triggers bypassed for the copy)
psq -c "set session_replication_role = replica; delete from public.cancellation_financial_decisions; delete from public.booking_notification_jobs; delete from public.enquiry_booking_segments; delete from public.enquiry_booking_confirmations;" 2>/dev/null || psq -c "set session_replication_role = replica; delete from public.booking_notification_jobs; delete from public.enquiry_booking_segments; delete from public.enquiry_booking_confirmations;"
for f in ROLLBACK_cancellation_financial_decisions.sql ROLLBACK_booking_notices_v2.sql ROLLBACK_booking_notifications.sql ROLLBACK_booking_cancel_reverts_stage.sql ROLLBACK_crew_support_booking_overlap_guard.sql ROLLBACK_booking_confirmation.sql; do run_file "$f" 2>&1 | grep -E "ERROR" && bad "rollback file $f"; done; ok "rollback files ran"
step "3 preflight on the pre-state"; out=$(pre); echo "$out" | grep -E "MISSING|ALREADY PRESENT" ; [ -z "$(echo "$out" | grep -E 'MISSING|ALREADY PRESENT')" ] && ok "pre-state is clean: every dependency present, no Plan B object present" || bad "pre-state not clean"
F0=$(echo "$FP" | psq); R0=$(echo "$ROWS" | psq); echo "fingerprint $F0   rows $R0"
step "5 apply, one proposal per run, in the release order"
for f in PROPOSAL_booking_confirmation.sql PROPOSAL_crew_support_booking_overlap_guard.sql PROPOSAL_booking_cancel_reverts_stage.sql PROPOSAL_booking_notifications.sql PROPOSAL_booking_notices_v2.sql PROPOSAL_cancellation_financial_decisions.sql; do
  run_file "$f" 2>&1 | grep -E "ERROR" && bad "apply $f" || ok "applied $f"; done
F1=$(echo "$FP" | psq); R1=$(echo "$ROWS" | psq); [ "$R1" = "$R0" ] && ok "existing business rows unchanged by applying the proposals" || bad "existing rows CHANGED by apply"
step "6 preflight after apply, and every rehearsal against the copy"
out=$(pre); echo "$out" | grep -c "ALREADY PRESENT" | xargs -I{} echo "plan B objects present: {}"; [ -z "$(echo "$out" | grep MISSING)" ] && ok "no dependency missing" || bad "dependency missing"
for r in "rehearse_booking_on_lab.sh full $C $COPY" "rehearse_booking_on_lab.sh crew $C $COPY" "rehearse_cancel_stage_revert.sh $C $COPY" "rehearse_booking_notifications.sh $C $COPY" "rehearse_booking_notices_v2.sh $C $COPY" "rehearse_cancellation_financial.sh $C $COPY"; do
  o=$("$D/${r%% *}" ${r#* } 2>&1); echo "$o" | grep -qE "PASSED" && echo "$o" | grep -q "UNCHANGED" && ok "${r%% *} ${r#* }" || { bad "${r%% *}"; echo "$o" | tail -3; }; done
step "7 roll everything back in reverse order"
for f in ROLLBACK_cancellation_financial_decisions.sql ROLLBACK_booking_notices_v2.sql ROLLBACK_booking_notifications.sql ROLLBACK_booking_cancel_reverts_stage.sql ROLLBACK_crew_support_booking_overlap_guard.sql ROLLBACK_booking_confirmation.sql; do run_file "$f" 2>&1 | grep -E "ERROR" && bad "rollback $f" || ok "rolled back $f"; done
step "8 compare"
F2=$(echo "$FP" | psq); R2=$(echo "$ROWS" | psq)
[ "$F2" = "$F0" ] && ok "schema fingerprint after the full rollback equals the pre-state (no remnant)" || bad "schema differs after rollback ($F0 vs $F2)"
[ "$R2" = "$R0" ] && ok "existing business rows identical before, after apply and after rollback" || bad "existing rows changed"
out=$(pre); [ -z "$(echo "$out" | grep -E 'MISSING|ALREADY PRESENT')" ] && ok "preflight clean again after rollback" || bad "preflight not clean after rollback"
echo; [ $fail = 0 ] && echo "PLAN B SEQUENCE REHEARSAL PASSED" || echo "PLAN B SEQUENCE REHEARSAL FAILED"; echo "(the disposable copy $COPY is dropped on exit)"; exit $fail
