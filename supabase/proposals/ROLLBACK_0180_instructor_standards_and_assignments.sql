-- ROLLBACK for migration 0180. Only safe while the four tables are EMPTY; if any row exists (adopted standards, acknowledgements, schedules, rights) export it first: it is legal evidence.
begin;
do $$ begin
  if (select count(*) from public.instructor_standards_versions) + (select count(*) from public.instructor_standards_acknowledgements) + (select count(*) from public.instructor_session_schedules) + (select count(*) from public.instructor_rights_matrix) > 0 then
    raise exception 'instructor standards/assignment tables contain rows: do not roll back without exporting and approving';
  end if;
end $$;
drop table if exists public.instructor_rights_matrix;
drop table if exists public.instructor_session_schedules;
drop table if exists public.instructor_standards_acknowledgements;
drop table if exists public.instructor_standards_versions;
drop function if exists private.instructor_rights_matrix_guard();
drop function if exists private.instructor_session_schedules_guard();
drop function if exists private.instructor_standards_ack_guard();
drop function if exists private.instructor_standards_versions_guard();
commit;
