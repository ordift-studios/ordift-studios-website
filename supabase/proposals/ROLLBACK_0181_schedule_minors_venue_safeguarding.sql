-- Rolls back PROPOSED 0181. Drops only what 0181 added; schedules and every 0180 object are untouched. (Columns' values, if any were recorded, are lost: export first if rows exist.)
begin;
drop trigger if exists instructor_session_schedules_minors_guard on public.instructor_session_schedules;
drop function if exists private.instructor_session_schedules_minors_guard();
alter table public.instructor_session_schedules
  drop constraint if exists instructor_session_schedules_venue_safeguarding_len,
  drop constraint if exists instructor_session_schedules_venue_emergency_len,
  drop column if exists involves_minors,
  drop column if exists venue_safeguarding_arrangements,
  drop column if exists venue_emergency_arrangements;
commit;
