#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production, never the walkthrough database). On a DISPOSABLE database that has NO booking tables (the Production shape today), applies the Crew Support reverse-overlap guard inside one
# transaction that is ROLLED BACK and proves (1) it is INERT: Crew Support confirmations, reschedules and assignments behave exactly as before, even on overlapping dates; and (2) its rollback removes everything it added.
# Refuses to run against p4_e2e (the walkthrough database).
DB=${1:?usage: $0 <disposable database name>}; C=${2:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
[ "$DB" = "p4_e2e" ] && { echo "Refusing: that is the walkthrough database. Use a disposable copy."; exit 2; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
echo "select case when to_regclass('public.enquiry_booking_confirmations') is null then 'ok: no booking tables here (Production shape)' else 'ABORT: booking tables exist' end" | q
{ echo "begin;"; grep -v -E '^(begin|commit);$' "$D/PROPOSAL_crew_support_booking_overlap_guard.sql"; cat <<'SQL'
set local session_replication_role = replica;
insert into public.enquiries (id, reference_number, email, full_name, service, crm_stage) values ('00000000-0000-4000-8000-00000000ee01', 'ENQ-INERT-1', 'i1@e2e.test', 'Inert 1', 'photography', 'new_lead');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000aa01', 'inert@e2e.test') on conflict do nothing;
insert into public.profiles (id, full_name, access_status) values ('00000000-0000-4000-8000-00000000aa01', 'Inert Person', 'active') on conflict do nothing;
insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at, status, call_time, finish_time, event_timezone)
  values ('00000000-0000-4000-8000-00000000ff01', '00000000-0000-4000-8000-00000000ee01', 'CSR-INERT-1', 'photographer', 'X', 'x@e2e.test', '1', 'photography', 'P', date '2027-04-12', date '2027-04-12', 'Doha', now(), 'quoted', '10:00', '11:00', 'Asia/Qatar');
insert into public.crew_support_requirements (id, request_id, role_label, quantity) values ('00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000ff01', 'Photographer', 1);
insert into public.crew_support_slots (requirement_id, request_id, slot_number, assignee_profile_id, status) values ('00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000ff01', 1, '00000000-0000-4000-8000-00000000aa01', 'assigned');
set local session_replication_role = origin;
do $$ begin
  update public.crew_support_requests set status = 'confirmed' where id = '00000000-0000-4000-8000-00000000ff01';
  if (select status from public.crew_support_requests where id = '00000000-0000-4000-8000-00000000ff01') <> 'confirmed' then raise exception 'INERT REHEARSAL FAILED: confirmation did not go through'; end if;
  update public.crew_support_requests set call_time = null, finish_time = null, start_date = date '2027-04-20', end_date = date '2027-04-21' where id = '00000000-0000-4000-8000-00000000ff01';
  update public.crew_support_slots set status = 'assigned' where request_id = '00000000-0000-4000-8000-00000000ff01';
end $$;
select 'INERT: with no booking tables, confirmation, rescheduling and slot changes behave exactly as before' as result;
SQL
grep -v -E '^(begin|commit);$' "$D/ROLLBACK_crew_support_booking_overlap_guard.sql"; cat <<'SQL'
do $$ begin
  if exists (select 1 from pg_trigger where tgname in ('crew_requests_booking_overlap_guard', 'crew_slots_booking_overlap_guard') and not tgisinternal) then raise exception 'ROLLBACK REHEARSAL FAILED: a trigger is still there'; end if;
  if to_regprocedure('private.crew_booking_overlap_check(uuid)') is not null or to_regprocedure('private.crew_request_booking_guard()') is not null or to_regprocedure('private.crew_slot_booking_guard()') is not null then raise exception 'ROLLBACK REHEARSAL FAILED: a function is still there'; end if;
end $$;
select 'CREW GUARD INERT + ROLLBACK REHEARSAL PASSED' as result;
rollback;
SQL
} | q
