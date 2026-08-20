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

-- Corrected 2026-08-20 after Staging verification: this project's
-- Supabase instance grants broad default table privileges (INSERT/
-- UPDATE/DELETE) to `anon`/`authenticated` on every new table in
-- `public` regardless of what's explicitly GRANTed here — confirmed
-- identical on payment_completion_claims (migration 0029, applied via
-- the normal CLI path), so this is a pre-existing project-wide
-- baseline, not something this migration or how it was applied
-- introduced. The GRANTs below are declarative of intent but not the
-- actual enforcement mechanism.
--
-- The real protection is Postgres RLS's own default-deny: this table
-- has RLS enabled with only a SELECT policy defined above, so INSERT/
-- UPDATE/DELETE have zero applicable policies for `authenticated`/
-- `anon` and are denied for every row — verified directly against
-- Staging (an authenticated non-service-role UPDATE attempt returns no
-- error but affects zero rows; the underlying data is provably
-- untouched — see recipients.integration.test.ts). This is the same
-- mechanism (not a grant-level one) that already protects every other
-- "service-role-only-write" table in this project. Every write in the
-- application goes through the service-role admin client from a
-- Super-Admin-gated server action
-- (src/app/admin/users/actions.ts's setNewBookingAlertsAction),
-- mirroring the existing profiles.access_status pattern
-- (0012_service_role_update_profiles.sql).
grant select on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;
