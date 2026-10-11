-- ROLLBACK for migration 0153 (schedule integrity + readiness). NOT a migration.
-- Run in one transaction only if 0153 must be backed out, then: supabase migration repair --status reverted 0153
-- GUARDS: refuses to run if any readiness, response, issue, schedule-change or notice data exists, or if the
-- timezone override has been used. A code-only problem needs no SQL: promote the previous Vercel deployment.
begin;
do $$
begin
  if exists (select 1 from public.assignment_readiness) then raise exception 'Refusing: assignment_readiness has rows'; end if;
  if exists (select 1 from public.assignment_readiness_responses) then raise exception 'Refusing: readiness responses exist'; end if;
  if exists (select 1 from public.assignment_readiness_issues) then raise exception 'Refusing: readiness issues exist'; end if;
  if exists (select 1 from public.assignment_schedule_changes) then raise exception 'Refusing: schedule changes exist'; end if;
  if exists (select 1 from public.crew_support_requests where event_timezone is not null) then raise exception 'Refusing: timezone overrides in use'; end if;
end $$;
drop function if exists public.reschedule_assignment(uuid, text, date, date, text, text, text, text, uuid, jsonb);
drop table if exists public.assignment_readiness_issue_events;
drop table if exists public.assignment_readiness_issues;
drop table if exists public.assignment_readiness_responses;
drop table if exists public.assignment_readiness;
drop table if exists public.assignment_readiness_settings;
drop table if exists public.assignment_schedule_change_notices;
drop table if exists public.assignment_schedule_changes;
drop function if exists private.is_readiness_assignee(uuid);
drop function if exists private.is_engagement_assignee(uuid);
alter table public.crew_support_requests drop column if exists event_timezone;
commit;
