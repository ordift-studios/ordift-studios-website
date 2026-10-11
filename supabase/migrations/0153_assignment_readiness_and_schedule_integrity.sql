-- B1: schedule integrity + pre-assignment readiness (NO automated notifications).
-- Additive only. No existing row is read-modified, no backfill. Extends Creative Crew Support's existing
-- request / slot / engagement records; no parallel scheduling or notification system.
--
-- 1. crew_support_requests.event_timezone: management's per-assignment override (NULL = use the market default).
-- 2. assignment_schedule_changes (+ _notices): the append-only history of rescheduling and the manual record of
--    who was told, how and when. The scheduled values remain on crew_support_requests (single source of truth);
--    reschedule_assignment() updates request + derived engagement dates + the change row atomically.
-- 3. assignment_readiness_settings: one row; intervals for B2. reminders_enabled is FORCED false by a constraint
--    until a later migration removes it, so nothing can be switched on by mistake in B1.
-- 4. assignment_readiness (one per engagement = enrolment), _responses (append-only versions), _issues
--    (one ACTIVE issue per assignment) and _issue_events (append-only audit trail + shared/internal messages).
-- Every table: RLS on, no direct writes by ordinary sessions, no DELETE for anyone.
begin;

alter table public.crew_support_requests add column event_timezone text;
comment on column public.crew_support_requests.event_timezone is
  'Management override of the assignment''s IANA timezone. NULL = derive from the market (Qatar: Asia/Qatar, Ghana: Africa/Accra).';

-- ------------------------------------------------------------------ 2. schedule history
create table public.assignment_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  request_id uuid not null references public.crew_support_requests (id),
  kind text not null check (kind in ('reschedule', 'timezone_override')),
  previous jsonb not null,
  new jsonb not null,
  reason text not null check (char_length(btrim(reason)) >= 5),
  notify_parties jsonb not null default '[]'::jsonb,
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now()
);
comment on table public.assignment_schedule_changes is
  'Append-only history of changes to an assignment''s SCHEDULE (scheduled date/time/timezone). Actual service dates live on assignment_reports. notify_parties lists who management must tell (manually in B1).';
create index assignment_schedule_changes_request_idx on public.assignment_schedule_changes (request_id, changed_at);

create table public.assignment_schedule_change_notices (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references public.assignment_schedule_changes (id),
  party_kind text not null check (party_kind in ('professional', 'client')),
  party_profile_id uuid references public.profiles (id),
  method text not null check (method in ('phone', 'whatsapp', 'email', 'in_person', 'other')),
  informed_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  constraint assignment_schedule_change_notices_party_shape check (
    (party_kind = 'client' and party_profile_id is null) or (party_kind = 'professional' and party_profile_id is not null)),
  constraint assignment_schedule_change_notices_not_future check (informed_at <= recorded_at + interval '5 minutes')
);
comment on table public.assignment_schedule_change_notices is
  'MANUAL record that a person was told about a schedule change (method + when). Ordift sent no automatic notice; this is management''s own record.';
create unique index assignment_schedule_change_notices_once
  on public.assignment_schedule_change_notices (change_id, party_kind, coalesce(party_profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.reschedule_assignment(
  p_request_id uuid, p_kind text, p_start date, p_end date, p_call text, p_finish text, p_timezone text,
  p_reason text, p_changed_by uuid, p_notify_parties jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.crew_support_requests%rowtype;
  v_prev jsonb;
  v_new jsonb;
  v_id uuid;
begin
  select * into r from public.crew_support_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status in ('declined', 'cancelled', 'completed') then raise exception 'request_closed'; end if;
  v_prev := jsonb_build_object('start_date', r.start_date, 'end_date', r.end_date, 'call_time', r.call_time, 'finish_time', r.finish_time, 'event_timezone', r.event_timezone);
  if p_kind = 'reschedule' then
    if p_end < p_start then raise exception 'invalid_dates'; end if;
    v_new := jsonb_build_object('start_date', p_start, 'end_date', p_end, 'call_time', nullif(p_call, ''), 'finish_time', nullif(p_finish, ''), 'event_timezone', coalesce(nullif(p_timezone, ''), r.event_timezone));
    if v_new = v_prev then raise exception 'no_change'; end if;
    update public.crew_support_requests
       set start_date = p_start, end_date = p_end, call_time = nullif(p_call, ''), finish_time = nullif(p_finish, ''),
           event_timezone = coalesce(nullif(p_timezone, ''), r.event_timezone), updated_at = now()
     where id = p_request_id;
    -- the engagement's dates are a derived copy of the schedule: keep them in step (live engagements only)
    update public.engagements e set starts_at = p_start, ends_at = p_end
     where e.entity_type = 'crew_support_slot' and e.status not in ('completed', 'cancelled')
       and e.entity_id in (select s.id::text from public.crew_support_slots s where s.request_id = p_request_id);
  elsif p_kind = 'timezone_override' then
    v_new := jsonb_set(v_prev, '{event_timezone}', coalesce(to_jsonb(nullif(p_timezone, '')), 'null'::jsonb));
    if v_new = v_prev then raise exception 'no_change'; end if;
    update public.crew_support_requests set event_timezone = nullif(p_timezone, ''), updated_at = now() where id = p_request_id;
  else
    raise exception 'invalid_kind';
  end if;
  insert into public.assignment_schedule_changes (request_id, kind, previous, new, reason, notify_parties, changed_by)
  values (p_request_id, p_kind, v_prev, v_new, p_reason, coalesce(p_notify_parties, '[]'::jsonb), p_changed_by)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reschedule_assignment(uuid, text, date, date, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_assignment(uuid, text, date, date, text, text, text, text, uuid, jsonb) to service_role;

-- ------------------------------------------------------------------ 3. settings (single row)
create table public.assignment_readiness_settings (
  id boolean primary key default true check (id),
  auto_enrol_from timestamptz,
  first_reminder_hours integer not null default 48 check (first_reminder_hours between 3 and 336),
  readiness_check_hours integer not null default 24 check (readiness_check_hours between 2 and 335),
  no_response_flag_hours integer not null default 12 check (no_response_flag_hours between 1 and 168),
  skip_check_if_ready boolean not null default true,
  reminders_enabled boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint assignment_readiness_settings_order check (first_reminder_hours > readiness_check_hours and readiness_check_hours > no_response_flag_hours),
  -- B1 sends nothing. A later migration (B2) replaces this guard when reminders are built and approved.
  constraint assignment_readiness_settings_no_reminders_in_b1 check (reminders_enabled = false),
  -- B1 enrols only by hand. Automatic enrolment (which would hook into the live acceptance workflow) is a later,
  -- separately approved change; until then this cannot be set.
  constraint assignment_readiness_settings_no_auto_enrol_in_b1 check (auto_enrol_from is null)
);
insert into public.assignment_readiness_settings (id) values (true);
comment on table public.assignment_readiness_settings is
  'Readiness intervals and enrolment cut-off. auto_enrol_from NULL = no automatic enrolment. reminders_enabled cannot be true in B1.';

-- ------------------------------------------------------------------ 4. readiness
create table public.assignment_readiness (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  engagement_id uuid not null unique references public.engagements (id),
  slot_id uuid not null unique references public.crew_support_slots (id),
  request_id uuid not null references public.crew_support_requests (id),
  enrolment_source text not null check (enrolment_source in ('auto_on_acceptance', 'manual')),
  enrolled_by uuid references public.profiles (id),
  enrolled_at timestamptz not null default now(),
  responsible_manager_id uuid references public.profiles (id),
  disabled_at timestamptz,
  disabled_by uuid references public.profiles (id),
  disabled_reason text,
  constraint assignment_readiness_disabled_shape check (disabled_at is null or (disabled_by is not null and char_length(btrim(coalesce(disabled_reason, ''))) >= 5))
);
comment on table public.assignment_readiness is
  'A row = this assignment is enrolled in pre-assignment readiness tracking. No row = no form, no flags, (B2) no reminders. unique(engagement_id) prevents duplicates.';

create table public.assignment_readiness_responses (
  id uuid primary key default gen_random_uuid(),
  readiness_id uuid not null references public.assignment_readiness (id),
  version integer not null check (version >= 1),
  status text not null check (status in ('ready', 'need_assistance', 'not_ready')),
  schedule_version integer not null check (schedule_version >= 1),
  checks jsonb not null default '{}'::jsonb,
  concerns jsonb not null default '{}'::jsonb,
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  constraint assignment_readiness_responses_version_unique unique (readiness_id, version),
  constraint assignment_readiness_responses_needs_detail check (
    status = 'ready' or concerns <> '{}'::jsonb or char_length(btrim(coalesce(remarks, ''))) >= 5)
);
comment on table public.assignment_readiness_responses is
  'Append-only versions of the professional''s readiness answer. schedule_version records which schedule it was given for (a reschedule makes it stale).';

create table public.assignment_readiness_issues (
  id uuid primary key default gen_random_uuid(),
  readiness_id uuid not null references public.assignment_readiness (id),
  origin_response_id uuid not null references public.assignment_readiness_responses (id),
  latest_response_id uuid not null references public.assignment_readiness_responses (id),
  kind text not null check (kind in ('need_assistance', 'not_ready')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'awaiting_professional', 'resolved')),
  raised_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id),
  acknowledged_at timestamptz,
  assigned_to uuid references public.profiles (id),
  follow_up_action text check (follow_up_action is null or char_length(follow_up_action) <= 500),
  professional_reported_resolved_at timestamptz,
  professional_confirmed_at timestamptz,
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint assignment_readiness_issues_resolved_shape check (
    status <> 'resolved' or (resolved_by is not null and resolved_at is not null and char_length(btrim(coalesce(resolution_note, ''))) >= 5))
);
-- at most ONE active issue per assignment: repeated answers update it instead of raising duplicate escalations
create unique index assignment_readiness_one_active_issue on public.assignment_readiness_issues (readiness_id) where status <> 'resolved';

create table public.assignment_readiness_issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.assignment_readiness_issues (id),
  event text not null check (event in ('raised', 'professional_update', 'acknowledged', 'action_started', 'confirmation_requested',
    'professional_reported_resolved', 'follow_up_assigned', 'message', 'resolved', 'reopened')),
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  actor_id uuid references public.profiles (id),
  actor_role text not null check (actor_role in ('management', 'professional', 'system')),
  body text check (body is null or char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  -- internal notes can only come from management; the professional never reads them
  constraint assignment_readiness_issue_events_internal_mgmt check (visibility = 'shared' or actor_role = 'management')
);
comment on table public.assignment_readiness_issue_events is
  'Append-only audit trail of an issue AND its messages. visibility shared = visible to the assigned professional; internal = management only.';
create index assignment_readiness_issue_events_issue_idx on public.assignment_readiness_issue_events (issue_id, created_at);

-- ------------------------------------------------------------------ access
create or replace function private.is_readiness_assignee(p_readiness_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignment_readiness ar join public.engagements e on e.id = ar.engagement_id
    where ar.id = p_readiness_id and e.payee_profile_id = (select auth.uid())
  );
$$;
revoke all on function private.is_readiness_assignee(uuid) from public;
grant execute on function private.is_readiness_assignee(uuid) to authenticated;

-- Strict assignee check for a given engagement. SECURITY DEFINER so it does not depend on what the caller can
-- see of the engagements table (staff can see every engagement, which would make a subquery policy leak).
create or replace function private.is_engagement_assignee(p_engagement_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.engagements e where e.id = p_engagement_id and e.payee_profile_id = (select auth.uid()));
$$;
revoke all on function private.is_engagement_assignee(uuid) from public;
grant execute on function private.is_engagement_assignee(uuid) to authenticated;

alter table public.assignment_schedule_changes enable row level security;
alter table public.assignment_schedule_change_notices enable row level security;
alter table public.assignment_readiness_settings enable row level security;
alter table public.assignment_readiness enable row level security;
alter table public.assignment_readiness_responses enable row level security;
alter table public.assignment_readiness_issues enable row level security;
alter table public.assignment_readiness_issue_events enable row level security;

create policy "schedule changes: admin read" on public.assignment_schedule_changes for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "schedule change notices: admin read" on public.assignment_schedule_change_notices for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "readiness settings: admin read" on public.assignment_readiness_settings for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "readiness: assignee or admin read" on public.assignment_readiness for select to authenticated
  using ((select private.is_admin_or_super_admin()) or (select private.is_engagement_assignee(engagement_id)));
create policy "readiness responses: assignee or admin read" on public.assignment_readiness_responses for select to authenticated
  using ((select private.is_admin_or_super_admin()) or (select private.is_readiness_assignee(readiness_id)));
-- issues and their events (incl. internal notes) are management-only at the database level; the professional's
-- view is a server-side projection of the SHARED events and the status.
create policy "readiness issues: admin read" on public.assignment_readiness_issues for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "readiness issue events: admin read" on public.assignment_readiness_issue_events for select to authenticated using ((select private.is_admin_or_super_admin()));

revoke all on public.assignment_schedule_changes, public.assignment_schedule_change_notices, public.assignment_readiness_settings,
  public.assignment_readiness, public.assignment_readiness_responses, public.assignment_readiness_issues, public.assignment_readiness_issue_events
  from anon, authenticated, service_role;
grant select on public.assignment_schedule_changes, public.assignment_schedule_change_notices, public.assignment_readiness_settings,
  public.assignment_readiness, public.assignment_readiness_responses, public.assignment_readiness_issues, public.assignment_readiness_issue_events to authenticated;
-- append-only for everyone, including server code
grant select, insert on public.assignment_schedule_changes, public.assignment_schedule_change_notices, public.assignment_readiness_responses, public.assignment_readiness_issue_events to service_role;
grant select, insert, update on public.assignment_readiness, public.assignment_readiness_issues to service_role;
grant select, update on public.assignment_readiness_settings to service_role;

commit;
