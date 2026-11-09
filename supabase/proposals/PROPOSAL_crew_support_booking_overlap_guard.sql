-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): the REVERSE conflict check. A Crew Support request cannot be CONFIRMED, rescheduled while confirmed, or have a person assigned while confirmed, if that
-- person already has a confirmed ordinary booking that overlaps it. It takes the SAME per-person advisory lock as public.confirm_ordinary_booking, so a booking and a Crew Support confirmation for the same person
-- are serialised in the database: exactly one wins, whichever order they arrive in. Rollback: ROLLBACK_crew_support_booking_overlap_guard.sql.
-- (The request trigger runs AFTER the update so the check reads the NEW dates and times; a refusal aborts the whole statement.)
-- Depends on PROPOSAL_booking_confirmation.sql (private.crew_request_overlaps and the booking tables). It is INERT where the booking tables do not exist (Production today): nothing is read and nothing is refused, so
-- current Crew Support behaviour is unchanged until the booking feature is released. It changes no row and no existing function; it adds one function and three triggers. A refusal is resolved by authorised
-- reassignment or rescheduling; there is no justification field.
begin;

create or replace function private.crew_booking_overlap_check(p_request uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s record; b record;
begin
  if to_regclass('public.enquiry_booking_confirmations') is null or to_regclass('public.enquiry_booking_segments') is null or to_regprocedure('private.crew_request_overlaps(uuid,timestamptz,timestamptz,text)') is null then return; end if;
  for s in select distinct assignee_profile_id from public.crew_support_slots where request_id = p_request and assignee_profile_id is not null and status in ('assigned', 'proposed') order by 1 loop
    perform pg_advisory_xact_lock(hashtext('booking-person:' || s.assignee_profile_id::text));                -- the same lock confirm_ordinary_booking takes
    for b in
      select e.reference_number, g.starts_at, g.ends_at, g.timezone
        from public.enquiry_booking_confirmations c join public.enquiry_booking_segments g on g.confirmation_id = c.id join public.enquiries e on e.id = c.enquiry_id
       where c.assigned_profile_id = s.assignee_profile_id and c.kind <> 'cancelled' and c.version = (select max(x.version) from public.enquiry_booking_confirmations x where x.enquiry_id = c.enquiry_id)
    loop
      if private.crew_request_overlaps(p_request, b.starts_at, b.ends_at, b.timezone) then
        raise exception 'ordift:crew_confirm_overlaps_booking: %', b.reference_number using errcode = '23514';
      end if;
    end loop;
  end loop;
end $$;
revoke all on function private.crew_booking_overlap_check(uuid) from public, anon, authenticated;

create or replace function private.crew_request_booking_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = 'confirmed' and (old.status is distinct from 'confirmed' or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
     or new.call_time is distinct from old.call_time or new.finish_time is distinct from old.finish_time or new.event_timezone is distinct from old.event_timezone) then
    perform private.crew_booking_overlap_check(new.id);
  end if;
  return new;
end $$;
revoke all on function private.crew_request_booking_guard() from public, anon, authenticated;
create trigger crew_requests_booking_overlap_guard after update on public.crew_support_requests for each row execute function private.crew_request_booking_guard();

create or replace function private.crew_slot_booking_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_profile_id is not null and new.status in ('assigned', 'proposed') and (tg_op = 'INSERT' or old.assignee_profile_id is distinct from new.assignee_profile_id or old.status is distinct from new.status)
     and exists (select 1 from public.crew_support_requests r where r.id = new.request_id and r.status = 'confirmed') then
    perform private.crew_booking_overlap_check(new.request_id);
  end if;
  return new;
end $$;
revoke all on function private.crew_slot_booking_guard() from public, anon, authenticated;
create trigger crew_slots_booking_overlap_guard after insert or update on public.crew_support_slots for each row execute function private.crew_slot_booking_guard();

commit;
