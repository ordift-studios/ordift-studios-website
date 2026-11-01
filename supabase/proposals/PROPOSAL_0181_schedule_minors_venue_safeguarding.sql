-- PROPOSED 0181 (NOT APPLIED, NOT in supabase/migrations): Session Schedules record whether a programme involves participants under 18 and, if so, the venue's safeguarding and
-- emergency escalation arrangements before approval (management approval of the Standards escalation policy, 2 Nov 2026). Additive only: three nullable columns, one extra approval check
-- (a SEPARATE trigger; the existing 0180 guard is not redefined), no data change. Move to supabase/migrations/ only with the Founder's written approval of this exact file.
begin;

alter table public.instructor_session_schedules
  add column involves_minors boolean,
  add column venue_safeguarding_arrangements text,
  add column venue_emergency_arrangements text,
  add constraint instructor_session_schedules_venue_safeguarding_len check (venue_safeguarding_arrangements is null or char_length(btrim(venue_safeguarding_arrangements)) between 10 and 2000),
  add constraint instructor_session_schedules_venue_emergency_len check (venue_emergency_arrangements is null or char_length(btrim(venue_emergency_arrangements)) between 10 and 2000);

comment on column public.instructor_session_schedules.involves_minors is 'NULL = not yet decided (approval refused). TRUE = participants under 18 may attend: the venue arrangements below are then required before approval.';
comment on column public.instructor_session_schedules.venue_safeguarding_arrangements is 'The venue or institution''s designated safeguarding authority and procedure, or, where it has none, the external reporting route Ordift identified for this assignment. Nothing is assumed.';
comment on column public.instructor_session_schedules.venue_emergency_arrangements is 'The venue''s verified emergency procedure and the applicable local emergency numbers.';

create or replace function private.instructor_session_schedules_minors_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'proposed' and new.status = 'approved' then
    if new.involves_minors is null then
      raise exception 'approval refused: record whether the programme involves participants under 18' using errcode = '42501';
    end if;
    if new.involves_minors and (char_length(btrim(coalesce(new.venue_safeguarding_arrangements, ''))) < 10 or char_length(btrim(coalesce(new.venue_emergency_arrangements, ''))) < 10) then
      raise exception 'approval refused: for a programme involving participants under 18, record the venue''s safeguarding and emergency escalation arrangements (or the external reporting route where the venue has none)' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.instructor_session_schedules_minors_guard() from public, anon, authenticated;
create trigger instructor_session_schedules_minors_guard before update on public.instructor_session_schedules for each row execute function private.instructor_session_schedules_minors_guard();

commit;
