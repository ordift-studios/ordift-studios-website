-- Ordift Studios — Admin Platform foundation (Tier 1, 2026-07-26)
--
-- Adds the Supabase-side schema for the internal Admin Platform (see
-- chat-approved architecture: Enquiries/CRM, Bookings, Feature Flags,
-- Activity Log) and, per explicit instruction to design this as the
-- long-term operating system for the whole Ordift ecosystem (not only
-- Ordift Studios), makes role grants business-scoped from day one —
-- the cheapest possible moment to do it, since only one business
-- (`ordift-studios`) exists and every row backfills to it automatically.
--
-- Design principles carried forward from 0001_init.sql:
--   - business_id on every new table, defaulting to the seeded Ordift
--     Studios row, same pattern as enquiries/workshop_registrations.
--   - RLS enabled from creation, `TO authenticated` explicit, stable
--     function calls wrapped in `(select ...)`.
--   - Grants audited against the actual feature being built, not added
--     preemptively (matching 0001's documented practice for
--     model_profiles/vendor_profiles).
--
-- Multi-business readiness (new this migration):
--   1. public.user_roles gains a `business_id` column, backfilled to
--      Ordift Studios and defaulted for all future inserts. This means
--      role grants are already business-scoped before a second business
--      exists, so introducing one later is a new `businesses` row + new
--      user_roles rows, not a schema change. The composite primary key
--      stays (user_id, role_id) for now — with a single business that's
--      still correct, since a user can only hold one row per role today
--      regardless. Extending the PK to include business_id is a small,
--      isolated follow-up migration for whenever a second business
--      actually launches, not something to speculate on now.
--   2. private.has_role() / private.is_staff_or_admin() are
--      DELIBERATELY NOT CHANGED here — they still check role membership
--      globally. A business-scoped variant
--      (has_role(role_slug, business_id)) is a Phase 2/3 change, made
--      easy by the column added in (1), not a blocker for Tier 1 with
--      one business.
--   3. Every new table below (enquiry_notes, feature_flags,
--      activity_log) carries business_id from creation for the same
--      reason enquiries/workshop_registrations already do.
--
-- Grant gap found and fixed while building the CRM/Bookings modules:
-- 0001_init.sql defined "enquiries: staff update" and
-- "workshop_registrations: staff update" RLS policies, but never
-- granted UPDATE on either table to `authenticated` at all — Postgres
-- requires both the grant and the policy, so staff could not actually
-- update either table despite the policy existing (same
-- documented-as-deliberate gap 0001 left on model_profiles/
-- vendor_profiles: "add write grants when a real workflow is built, not
-- before"). The CRM stage-management and Bookings status-management
-- modules are that real workflow, so this migration adds the two
-- missing grants. RLS row-scoping (is_staff_or_admin()) is the actual
-- trust boundary here, same as the existing "staff update" policies —
-- no column-scoping is added, matching the model_profiles/
-- vendor_profiles precedent (unlike profiles, where the same
-- authenticated user could self-serve-update their own row and needed
-- column scoping; enquiries/workshop_registrations updates are
-- role-gated, not self-service).

begin;

-- ============================================================
-- user_roles: business_id (multi-business readiness — see header)
-- ============================================================
alter table public.user_roles
  add column business_id uuid references public.businesses (id) default public.ordift_studios_business_id();

update public.user_roles
  set business_id = public.ordift_studios_business_id()
  where business_id is null;

alter table public.user_roles
  alter column business_id set not null;

-- ============================================================
-- Enquiry notes (CRM module) — append-only internal note thread per
-- enquiry. Deliberately no update/delete: correcting a note means
-- adding a new one, same reasoning as treating this as an audit trail
-- rather than an editable field.
-- ============================================================
create table public.enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  author_user_id uuid references public.profiles (id),
  note text not null,
  created_at timestamptz not null default now()
);

create index enquiry_notes_enquiry_id_idx on public.enquiry_notes (enquiry_id);

alter table public.enquiry_notes enable row level security;

create policy "enquiry_notes: staff read" on public.enquiry_notes
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

create policy "enquiry_notes: staff insert" on public.enquiry_notes
  for insert
  to authenticated
  with check ((select private.is_staff_or_admin()));

grant select, insert on public.enquiry_notes to authenticated;

-- ============================================================
-- Feature flags — business-toggleable switches distinct from the
-- deploy-gated infra flags (LEGAL_PAGES_APPROVED, FORMS_SENDING_ENABLED
-- stay as Vercel env vars by design — see src/lib/shared/env.ts and the
-- chat-approved architecture doc). Staff can see flag state; only admin
-- can change it.
-- ============================================================
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  key text not null,
  enabled boolean not null default false,
  description text,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);

alter table public.feature_flags enable row level security;

create policy "feature_flags: staff read" on public.feature_flags
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

create policy "feature_flags: admin manages" on public.feature_flags
  for all
  to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

grant select, insert, update, delete on public.feature_flags to authenticated;

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- ============================================================
-- Activity log — audit trail for admin-platform actions (role grants,
-- CRM stage changes, flag toggles to start; every future module writes
-- here the same way rather than inventing its own log). Insert-only
-- from the app; no update/delete policy at all, so nothing can alter
-- history after the fact.
-- ============================================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  actor_user_id uuid references public.profiles (id),
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

create policy "activity_log: staff read" on public.activity_log
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

create policy "activity_log: staff insert" on public.activity_log
  for insert
  to authenticated
  with check ((select private.is_staff_or_admin()));

grant select, insert on public.activity_log to authenticated;

-- ============================================================
-- Grant gap fix — see header note. RLS policies already existed in
-- 0001_init.sql; only the missing table-level grants are added here.
-- ============================================================
grant update on public.enquiries to authenticated;
grant update on public.workshop_registrations to authenticated;

commit;
