-- Rollback for 0154 (readiness reminders). Safe only while no reminder has ever been sent: it deletes the notification,
-- delivery, suppression and scheduler tables. If reminders were ever live, EXPORT those tables first (they are the
-- audit trail) and obtain separate approval before running this.
-- Blocks itself if anything but 'off' mode or any notification rows exist.
begin;
do $$
begin
  if exists (select 1 from public.assignment_readiness where area_label is not null) then
    raise exception 'Refusing rollback: area labels are in use.';
  end if;
  if exists (select 1 from public.assignment_readiness_settings where reminders_mode <> 'off') then
    raise exception 'Refusing rollback: reminders_mode is not off. Switch reminders off first.';
  end if;
  if exists (select 1 from public.assignment_notifications) then
    raise exception 'Refusing rollback: assignment_notifications has rows (audit trail). Export and obtain approval first.';
  end if;
end $$;

drop function if exists public.acquire_scheduler_lock(text, integer);
drop function if exists public.release_scheduler_lock(text);
drop table if exists public.scheduler_lock;
drop table if exists public.scheduler_runs;
drop table if exists public.assignment_notification_suppressions;
drop table if exists public.assignment_notification_deliveries;
drop table if exists public.assignment_notifications;
drop function if exists private.deliveries_append_only();

alter table public.assignment_readiness drop column if exists area_label;

drop trigger if exists assignment_readiness_settings_mode_guard on public.assignment_readiness_settings;
drop function if exists private.readiness_settings_mode_guard();
alter table public.assignment_readiness_settings drop constraint if exists assignment_readiness_settings_enabled_matches_mode;
alter table public.assignment_readiness_settings
  drop column if exists reminders_mode, drop column if exists reminders_mode_changed_at, drop column if exists reminders_mode_changed_by,
  drop column if exists reminders_switched_on_at, drop column if exists late_cap_first_hours, drop column if exists late_cap_check_hours,
  drop column if exists late_cap_escalation_hours, drop column if exists scheduler_stale_alarm_hours;
alter table public.assignment_readiness_settings add constraint assignment_readiness_settings_no_reminders_in_b1 check (reminders_enabled = false);

commit;
