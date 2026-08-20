-- Notification Preferences — CRM Lifecycle Automation Phase 1, Batch 3
-- refinement (2026-08-20). Per-user, per-category notification opt-in,
-- deliberately separate from role: being granted `admin` must never
-- automatically enroll someone in an internal notification category —
-- only a Super Admin, editing this explicitly, does.
--
-- A normalized (user_id, category) table, not a jsonb settings blob on
-- profiles/staff_details — matches this schema's existing precedent for
-- per-user structured data (member_numbers, project_assignments), and
-- is far easier to RLS-scope and query per category than a shared blob
-- column. Neither profiles nor staff_details currently has a jsonb
-- column to extend anyway (checked directly before writing this).
--
-- `category` is deliberately plain text, not a check-constrained enum —
-- the future categories already anticipated (New Enquiry, Payment
-- alerts, Refund/cancellation alerts, Project/deliverable alerts; none
-- built yet) should never require a migration just to add a category,
-- only an application-level allow-list (see
-- src/lib/notifications/preferences.ts).
--
-- No row for a given (user, category) means "not opted in" — the
-- application treats a missing row as enabled=false, so a newly
-- granted Admin is never silently subscribed to anything. Super Admin
-- recipients for New Booking are resolved unconditionally in
-- application code (src/lib/notifications/recipients.ts), not through
-- this table, so no backfill row is needed to preserve the current
-- Super Admin's existing alert delivery.
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_user_category_unique unique (user_id, category)
);

comment on table public.notification_preferences is
  'Per-user opt-in for internal operational notification categories (e.g. new_booking), set only by a Super Admin. Absence of a row means not opted in.';

alter table public.notification_preferences enable row level security;

-- Read: a user may see their own preference row; Super Admin may see
-- everyone's (needed to render/manage the toggle in Admin User
-- Management). Plain admin/staff cannot browse other users' settings.
create policy "notification_preferences: read own or super admin"
  on public.notification_preferences
  for select
  to authenticated
  using (auth.uid() = user_id or private.is_super_admin());

-- No INSERT/UPDATE/DELETE grant to `authenticated` at all — every write
-- goes through the service-role admin client from a Super-Admin-gated
-- server action (src/app/admin/users/actions.ts's setNewBookingAlertsAction),
-- mirroring the existing profiles.access_status pattern
-- (0012_service_role_update_profiles.sql) rather than relying on an
-- RLS row-check a client session could ever reach directly. This means
-- even a Super Admin's own authenticated session cannot write this
-- table directly — only the gated server action, using the service-
-- role client, can.
grant select on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;
