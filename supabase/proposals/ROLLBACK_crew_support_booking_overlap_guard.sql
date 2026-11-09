-- ROLLBACK for PROPOSAL_crew_support_booking_overlap_guard.sql. Drops only the two triggers and three functions it added. No data is touched.
begin;
drop trigger if exists crew_requests_booking_overlap_guard on public.crew_support_requests;
drop trigger if exists crew_slots_booking_overlap_guard on public.crew_support_slots;
drop function if exists private.crew_request_booking_guard();
drop function if exists private.crew_slot_booking_guard();
drop function if exists private.crew_booking_overlap_check(uuid);
commit;
