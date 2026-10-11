-- B2: automated pre-assignment readiness reminders and management escalation — SCHEMA ONLY.
--
-- This migration builds the machinery and keeps it switched OFF. Applying it sends nothing: reminders_mode defaults to
-- 'off', no assignment is enrolled by it, and nothing in it touches an existing assignment, request, payment, payable
-- or file. Turning reminders on is a separate, explicitly approved step taken in the admin settings, never by SQL here.
--
--  1. assignment_readiness_settings: reminders_mode (off | dry_run | test | live), switch-on timestamp (set by a trigger,
--     so "no catch-up flood" cannot be forgotten by application code), late caps, stale-scheduler alarm. The B1 guard that
--     forbade enabling reminders is replaced by a guard that keeps reminders_enabled consistent with the mode.
--  2. assignment_readiness.area_label: the city/area shown in reminder emails (management-entered, never extracted).
--  3. assignment_notifications: one row per INTENDED notification; a unique key makes duplicates impossible and a
--     claim-before-send pattern makes retries and concurrent runs safe.
--  4. assignment_notification_deliveries: append-only provider stages (accepted, delivered, delayed, bounced, ...), kept
--     separate so "accepted by the provider" is never mistaken for "delivered".
--  5. assignment_notification_suppressions: a bounced/complained address stops further reminders until management clears it.
--  6. scheduler_runs + scheduler_lock: heartbeat and single-flight lock for the hourly/daily/manual triggers.

-- ------------------------------------------------------------------ 1. settings
alter table public.assignment_readiness_settings drop constraint assignment_readiness_settings_no_reminders_in_b1;

alter table public.assignment_readiness_settings
  add column reminders_mode text not null default 'off' check (reminders_mode in ('off', 'dry_run', 'test', 'live')),
  add column reminders_mode_changed_at timestamptz,
  add column reminders_mode_changed_by uuid references public.profiles (id),
  add column reminders_switched_on_at timestamptz,
  add column late_cap_first_hours integer not null default 6 check (late_cap_first_hours between 1 and 48),
  add column late_cap_check_hours integer not null default 3 check (late_cap_check_hours between 1 and 48),
  add column late_cap_escalation_hours integer not null default 3 check (late_cap_escalation_hours between 1 and 48),
  add column scheduler_stale_alarm_hours integer not null default 3 check (scheduler_stale_alarm_hours between 1 and 48);

alter table public.assignment_readiness_settings
  add constraint assignment_readiness_settings_enabled_matches_mode check (reminders_enabled = (reminders_mode in ('test', 'live')));

-- Whenever the mode changes, record when and move the switch-on time forward if reminders are being switched on
-- (off/dry_run -> test/live, or test <-> live). A reminder whose due time is before the switch-on time is never sent.
create or replace function private.readiness_settings_mode_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reminders_mode is distinct from old.reminders_mode then
    new.reminders_mode_changed_at := now();
    new.reminders_enabled := new.reminders_mode in ('test', 'live');
    if new.reminders_mode in ('test', 'live') then
      new.reminders_switched_on_at := now();
    end if;
  end if;
  return new;
end $$;
revoke all on function private.readiness_settings_mode_guard() from public;
create trigger assignment_readiness_settings_mode_guard before update on public.assignment_readiness_settings
  for each row execute function private.readiness_settings_mode_guard();

comment on column public.assignment_readiness_settings.reminders_mode is
  'off = nothing computed or sent; dry_run = computed and displayed only; test = full flow, nothing leaves the system; live = real emails (enrolled assignments only).';
comment on column public.assignment_readiness_settings.reminders_switched_on_at is
  'Set by trigger when reminders are switched on. Reminders due before this are never sent (no catch-up flood).';

-- ------------------------------------------------------------------ 2. area label
alter table public.assignment_readiness
  add column area_label text check (area_label is null or char_length(btrim(area_label)) between 2 and 80);
comment on column public.assignment_readiness.area_label is
  'Management-entered city/area shown in reminder emails (e.g. "Doha — West Bay"). NULL = no reminder can be sent. Never derived from the venue.';

-- ------------------------------------------------------------------ 3. notifications (one row per intended notification)
create table public.assignment_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  readiness_id uuid not null references public.assignment_readiness (id),
  engagement_id uuid not null references public.engagements (id),
  schedule_version integer not null check (schedule_version >= 1),
  kind text not null check (kind in ('reminder_first', 'reminder_check', 'escalation_no_response', 'escalation_concern')),
  -- NULL only on a 'skipped' decision row (the audit record that a reminder window was evaluated and not sent)
  recipient_profile_id uuid references public.profiles (id),
  recipient_role text not null check (recipient_role in ('professional', 'management')),
  -- escalation_concern is keyed per issue (once per condition); every other kind uses ''
  condition_key text not null default '',
  delivery_mode text not null check (delivery_mode in ('test', 'live')),
  status text not null check (status in ('claimed', 'sent', 'logged', 'failed', 'suppressed_test', 'skipped')),
  skip_reason text,
  due_at timestamptz not null,
  attempts integer not null default 0,
  subject text,
  error text,
  triggered_by text not null check (triggered_by in ('github', 'vercel', 'manual', 'test')),
  scheduler_run_id uuid,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_notifications_skip_shape check ((status = 'skipped') = (skip_reason is not null)),
  constraint assignment_notifications_recipient_shape check (recipient_profile_id is not null or status = 'skipped')
);
-- THE idempotency key: the same intended notification can exist exactly once (one decision row per window, one row per recipient).
create unique index assignment_notifications_unique_key on public.assignment_notifications
  (kind, readiness_id, schedule_version, coalesce(recipient_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), condition_key, delivery_mode);
create index assignment_notifications_readiness_idx on public.assignment_notifications (readiness_id, claimed_at desc);
create index assignment_notifications_status_idx on public.assignment_notifications (status, claimed_at desc);
comment on table public.assignment_notifications is
  'One row per intended readiness notification. The unique key makes duplicates impossible; a reschedule changes schedule_version so a genuinely new reminder is allowed and a stale one can never be re-sent.';

-- ------------------------------------------------------------------ 4. deliveries (append-only provider stages)
create table public.assignment_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.assignment_notifications (id),
  stage text not null check (stage in ('attempted', 'provider_accepted', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed')),
  provider_message_id text,
  -- the provider's own event id (webhook): makes webhook replays harmless
  provider_event_id text unique,
  detail text check (detail is null or char_length(detail) <= 500),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);
create index assignment_notification_deliveries_notification_idx on public.assignment_notification_deliveries (notification_id, occurred_at);
create index assignment_notification_deliveries_message_idx on public.assignment_notification_deliveries (provider_message_id) where provider_message_id is not null;

create or replace function private.deliveries_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'assignment_notification_deliveries is append-only';
end $$;
revoke all on function private.deliveries_append_only() from public;
create trigger assignment_notification_deliveries_no_change before update or delete on public.assignment_notification_deliveries
  for each row execute function private.deliveries_append_only();

-- ------------------------------------------------------------------ 5. address suppression
create table public.assignment_notification_suppressions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('bounced', 'complained')),
  source_delivery_id uuid references public.assignment_notification_deliveries (id),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles (id),
  cleared_reason text,
  constraint assignment_notification_suppressions_cleared_shape check (
    cleared_at is null or (cleared_by is not null and char_length(btrim(coalesce(cleared_reason, ''))) >= 5))
);
-- at most one ACTIVE suppression per person
create unique index assignment_notification_suppressions_active on public.assignment_notification_suppressions (profile_id) where cleared_at is null;

-- ------------------------------------------------------------------ 6. heartbeat + lock
create table public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null default 'readiness_reminders' check (job in ('readiness_reminders')),
  trigger text not null check (trigger in ('github', 'vercel', 'manual', 'test')),
  mode text not null check (mode in ('off', 'dry_run', 'test', 'live')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped_locked')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  examined integer not null default 0,
  sent integer not null default 0,
  skipped integer not null default 0,
  late_skipped integer not null default 0,
  failed integer not null default 0,
  actor_id uuid references public.profiles (id),
  error text check (error is null or char_length(error) <= 500)
);
create index scheduler_runs_started_idx on public.scheduler_runs (job, started_at desc);

create table public.scheduler_lock (
  id boolean primary key default true check (id),
  holder text,
  locked_until timestamptz
);
insert into public.scheduler_lock (id) values (true);

-- Single flight: returns true only when no other run holds an unexpired lock. A crashed run releases itself when the
-- (short) lock expires.
create or replace function public.acquire_scheduler_lock(p_holder text, p_ttl_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare got boolean;
begin
  update public.scheduler_lock set holder = p_holder, locked_until = now() + make_interval(secs => greatest(p_ttl_seconds, 5))
   where id and (locked_until is null or locked_until < now());
  get diagnostics got = row_count;
  return got;
end $$;
create or replace function public.release_scheduler_lock(p_holder text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.scheduler_lock set holder = null, locked_until = null where id and holder = p_holder;
end $$;
revoke all on function public.acquire_scheduler_lock(text, integer), public.release_scheduler_lock(text) from public, anon, authenticated;
grant execute on function public.acquire_scheduler_lock(text, integer), public.release_scheduler_lock(text) to service_role;

-- ------------------------------------------------------------------ security
alter table public.assignment_notifications enable row level security;
alter table public.assignment_notification_deliveries enable row level security;
alter table public.assignment_notification_suppressions enable row level security;
alter table public.scheduler_runs enable row level security;
alter table public.scheduler_lock enable row level security;

create policy "assignment notifications: admin read" on public.assignment_notifications for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "assignment deliveries: admin read" on public.assignment_notification_deliveries for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "assignment suppressions: admin read" on public.assignment_notification_suppressions for select to authenticated using ((select private.is_admin_or_super_admin()));
create policy "scheduler runs: admin read" on public.scheduler_runs for select to authenticated using ((select private.is_admin_or_super_admin()));

revoke all on public.assignment_notifications, public.assignment_notification_deliveries, public.assignment_notification_suppressions,
  public.scheduler_runs, public.scheduler_lock from public, anon, authenticated;
grant select on public.assignment_notifications, public.assignment_notification_deliveries, public.assignment_notification_suppressions, public.scheduler_runs to authenticated;
grant select, insert, update on public.assignment_notifications, public.assignment_notification_suppressions, public.scheduler_runs to service_role;
grant select, insert on public.assignment_notification_deliveries to service_role;
grant select on public.scheduler_lock to service_role;
