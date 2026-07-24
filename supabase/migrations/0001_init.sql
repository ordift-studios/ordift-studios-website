-- Ordift Studios — Client Portal schema (Version 1.3, 2026-07-24)
--
-- Hardening pass 2026-07-24 (before first successful run against the
-- live project):
--   1. Every SECURITY DEFINER (and trigger) function now sets
--      `search_path = ''` and fully schema-qualifies every object it
--      touches (public.*, auth.uid()) — closes the classic
--      "search_path hijacking" hole where a caller-controlled
--      search_path could redirect an unqualified name to a
--      caller-owned object of the same name.
--   2. Explicit REVOKE ... FROM PUBLIC + GRANT EXECUTE ... TO <role> on
--      every function — nothing is left at Postgres's default
--      (PUBLIC-executable) grant.
--   3. Every RLS policy now specifies `TO authenticated` explicitly
--      (Supabase's current recommended form — see
--      https://supabase.com/docs/guides/database/postgres/row-level-security)
--      and wraps auth.uid()/auth.role()/has_role()/is_staff_or_admin()
--      calls in `(select ...)` so Postgres evaluates them once per
--      statement (an InitPlan) instead of once per row.
--   4. Added `handle_new_user()` — an AFTER INSERT trigger on
--      auth.users that creates the matching public.profiles row
--      transactionally, using the official Supabase pattern
--      (https://supabase.com/docs/guides/auth/managing-user-data).
--      Previously this was two separate, non-transactional application
--      calls (auth.signUp(), then a manual profiles insert) — if the
--      second one ever failed, you'd get an auth.users row with no
--      profiles row, and since enquiries.user_id/
--      workshop_registrations.user_id both FK into profiles(id), a
--      later dual-write for that person would fail its FK constraint.
--      src/app/portal/signup/actions.ts was updated to match: it no
--      longer inserts the profile row itself (the trigger owns that
--      now) and instead passes full_name through signUp()'s user
--      metadata, which the trigger reads.
--   5. THE DESTRUCTIVE RESET SECTION HAS BEEN REMOVED FROM THIS FILE.
--      This migration is now forward-only and non-destructive — running
--      it a second time against a database that already has these
--      objects will fail loudly (table/policy/type already exists)
--      rather than silently wiping data. The reset-from-scratch script
--      now lives separately at supabase/reset-dev-database.sql, is
--      never part of the migration history, and requires uncommenting
--      an explicit confirmation line before it will run.
--
-- Hardening pass 3 (2026-07-24, before this file's first successful
-- run — the failed first attempt had already created public.businesses
-- + its seed row, cleaned up separately, not via this file):
--   6. RLS restricts which ROW a user can touch, not which COLUMNS —
--      Supabase's default privileges grant table-wide UPDATE/INSERT to
--      `authenticated` on every new table, so without an explicit
--      column-scoped grant, a user satisfying "profiles: update own"
--      could still overwrite their own business_id, id, created_at, or
--      updated_at in the same call. Added explicit column-level
--      REVOKE + GRANT on public.profiles for both UPDATE (full_name,
--      phone, avatar_url only) and INSERT (same gap, same fix).
--   7. Found the same class of gap already live: "model_profiles:
--      update own" / "vendor_profiles: update own" let a model/vendor
--      overwrite ANY column on their own row, including `status` — and
--      neither table has a defined self-service edit workflow yet
--      (both are scaffolded, no real feature built on them). Replaced
--      both with staff/admin-only update policies, matching the
--      existing enquiries/workshop_registrations staff-update pattern,
--      rather than column-scoping a self-update path nothing needs yet.
--   8. Removed "profiles: insert own" entirely and the column-scoped
--      INSERT grant that went with it. Now that handle_new_user()
--      creates every public.profiles row transactionally the moment
--      auth.users gets a new row, there is no legitimate path left for
--      `authenticated` to insert into profiles at all — self-service
--      insert was already dead app-code (nothing called it), so this
--      closes it rather than leaving an unused, forgeable surface
--      around. Only `revoke insert ... from authenticated;` remains,
--      with no matching grant — profile creation happens exclusively
--      via the Auth trigger (as postgres, via SECURITY DEFINER) or a
--      trusted admin/service_role operation.
--
-- Design principles (per explicit instruction — "schema so future
-- features can be added without requiring a database redesign"):
--   1. UUID primary keys everywhere — portable across environments and a
--      future mobile app, no auto-increment collision risk.
--   2. Roles are a many-to-many relationship (user_roles), not a single
--      column — a person can be both a Client and a Workshop Participant
--      at once, and a brand-new role is a row insert, not a migration.
--   3. `businesses` exists from day one so "additional Ordift businesses"
--      is a new row + scoped RLS later, not a schema change. Every
--      business-scoped table carries a `business_id` defaulting to the
--      seeded Ordift Studios row.
--   4. `metadata jsonb` on the role-specific profile tables (vendor,
--      model) absorbs fields nobody has confirmed requirements for yet
--      (see MILESTONES.md — Model/Vendor portals are scaffolded, not
--      fleshed out, since no real workflow was defined for them before
--      this milestone) without forcing a later ALTER TABLE.
--   5. `enquiries.crm_stage` uses the exact lifecycle already approved in
--      the original brief (New Lead → ... → Referral) — this table is
--      the seed of the V2.0 CRM, not a separate concept bolted on later.
--   6. Payments/subscriptions/digital products are deliberately NOT
--      modeled here — no payment provider is approved yet (same
--      zero-invention/pricing-gating rule applied throughout this
--      project). `amount_due`/`amount_paid`/`payment_status` columns
--      exist on the tables that need them so a future `payments` table
--      can FK into `enquiries`/`workshop_registrations` without
--      restructuring either.

begin;

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Businesses (multi-business readiness)
-- ============================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.businesses (slug, name) values ('ordift-studios', 'Ordift Studios');

-- Used as the DEFAULT for every business-scoped table's business_id
-- below. PostgreSQL forbids a bare subquery written directly in a
-- column DEFAULT ("0A000: cannot use subquery in DEFAULT expression"),
-- so this wraps the lookup in a function instead. SECURITY DEFINER +
-- search_path='' so it resolves public.businesses correctly regardless
-- of the calling role's RLS visibility or search_path — same reasoning
-- as public.has_role()/public.is_staff_or_admin() below.
create or replace function public.ordift_studios_business_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from public.businesses where slug = 'ordift-studios';
$$;

revoke all on function public.ordift_studios_business_id() from public;
grant execute on function public.ordift_studios_business_id() to service_role;

-- ============================================================
-- Profiles (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-creates a public.profiles row the moment a new auth.users row is
-- committed — official Supabase pattern (see note 4 at the top of this
-- file). Runs as SECURITY DEFINER (the function owner, postgres, owns
-- public.profiles and therefore isn't subject to its own RLS policies)
-- with search_path='' so the insert target can't be hijacked.
-- full_name comes from signUp()'s user metadata (see
-- src/app/portal/signup/actions.ts); business_id is left unset so the
-- column DEFAULT above fills it in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
-- The Auth service (GoTrue) performs every auth.users insert —
-- self-service signup and future admin-created accounts alike — as the
-- supabase_auth_admin role, which is what actually fires this trigger.
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Roles (lookup table, not an enum — new roles are a row insert)
-- ============================================================
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text
);

insert into public.roles (slug, name, description) values
  ('client', 'Client', 'Photography, videography, and every other department''s clients — one role, scoped by their own project data, not by department.'),
  ('workshop_participant', 'Workshop Participant', 'Registered for one or more Ordift Academy workshops.'),
  ('model', 'Model', 'Represented talent — scaffolded only; Talent Management is still Phase 1B (see Plan Part D).'),
  ('vendor', 'Vendor / Partner', 'External vendors and partners — scaffolded only; no vendor workflow was defined before this milestone.'),
  ('staff', 'Staff', 'Ordift Studios team member handling day-to-day operations.'),
  ('admin', 'Admin', 'Full access, incl. user/role management.');

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id),
  primary key (user_id, role_id)
);

-- Helper used inside RLS policies and callable via RPC from the app.
create or replace function public.has_role(role_slug text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.slug = role_slug
  );
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated, service_role;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_role('staff') or public.has_role('admin');
$$;

revoke all on function public.is_staff_or_admin() from public;
grant execute on function public.is_staff_or_admin() to authenticated, service_role;

-- ============================================================
-- Enquiries (mirrors src/lib/enquiry — dual-written from the existing
-- API route alongside Google Sheets, not a replacement for it; see
-- CMS_MIGRATION.md / ARCHITECTURE.md §4.4). user_id is nullable: a guest
-- can submit before creating an account. reference_number matches the
-- ORD-YYYYMMDD-XXXX already generated by src/lib/enquiry/reference.ts —
-- kept as the join key between the Sheet and this table.
-- ============================================================
create type public.crm_stage as enum (
  'new_lead', 'contacted', 'discovery_meeting', 'quotation_sent',
  'negotiation', 'booked', 'in_progress', 'delivered', 'completed',
  'repeat_client', 'referral', 'declined', 'closed'
);

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  user_id uuid references public.profiles (id) on delete set null,
  reference_number text unique not null,
  email text not null,
  full_name text not null,
  service text not null,
  crm_stage public.crm_stage not null default 'new_lead',
  amount_due numeric,
  amount_paid numeric,
  payment_status text,
  submitted_at timestamptz not null default now()
);

create index enquiries_user_id_idx on public.enquiries (user_id);
create index enquiries_email_idx on public.enquiries (email);

-- ============================================================
-- Workshop registrations (mirrors src/lib/workshops — dual-written
-- alongside the Google Sheet, same reasoning as enquiries above).
-- workshop_id/workshop_slug reference Sanity documents by ID/slug, not a
-- Postgres FK — Sanity and Supabase are separate systems by design (see
-- CMS_MIGRATION.md).
-- ============================================================
create table public.workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  user_id uuid references public.profiles (id) on delete set null,
  registration_reference text unique not null,
  email text not null,
  full_name text not null,
  workshop_id text not null,
  workshop_slug text not null,
  workshop_title text not null,
  registration_status text not null,
  waiting_list_position int,
  payment_status text not null,
  amount_due numeric,
  amount_paid numeric,
  certificate_issued boolean not null default false,
  certificate_url text,
  registration_date timestamptz not null default now()
);

create index workshop_registrations_user_id_idx on public.workshop_registrations (user_id);
create index workshop_registrations_email_idx on public.workshop_registrations (email);

-- ============================================================
-- Model profiles (scaffolded — see roles.description above)
-- ============================================================
create table public.model_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'pending', -- pending | active | inactive
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Vendor profiles (scaffolded — see roles.description above)
-- ============================================================
create table public.vendor_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  company_name text,
  status text not null default 'pending', -- pending | active | inactive
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Staff details (department/title — kept separate from profiles since
-- not every profile is staff)
-- ============================================================
create table public.staff_details (
  id uuid primary key references public.profiles (id) on delete cascade,
  department text,
  job_title text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security — enabled on every table from day one, per
-- explicit instruction, so every user can only reach their own data.
-- Every policy below specifies `TO authenticated` explicitly and wraps
-- auth.uid()/has_role()/is_staff_or_admin() calls in `(select ...)` —
-- Supabase's current recommended RLS form: TO makes the intended
-- audience explicit rather than relying on a role check buried in
-- USING, and wrapping stable function calls in a scalar subquery lets
-- Postgres evaluate them once per statement (an InitPlan) instead of
-- once per row.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.enquiries enable row level security;
alter table public.workshop_registrations enable row level security;
alter table public.model_profiles enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.staff_details enable row level security;
alter table public.businesses enable row level security;

-- businesses / roles: readable by any authenticated user (reference
-- data) — the role check is `TO authenticated` itself, not a USING
-- clause re-checking it.
create policy "businesses readable by authenticated" on public.businesses
  for select
  to authenticated
  using (true);
create policy "roles readable by authenticated" on public.roles
  for select
  to authenticated
  using (true);

-- profiles: read/update own row; staff/admin read all
create policy "profiles: read own" on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_staff_or_admin()));
create policy "profiles: update own" on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level companion to the update policy above. RLS only answers
-- "which row" — without this, a user satisfying (select auth.uid()) =
-- id could still set business_id, id, created_at, or updated_at in the
-- same update() call, since Supabase's default privileges otherwise
-- grant unrestricted UPDATE on every new public table to
-- `authenticated`. service_role is untouched (it bypasses RLS and
-- isn't named in this policy at all).
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- No insert policy and no matching grant, deliberately: every
-- public.profiles row is created exclusively by handle_new_user()
-- (SECURITY DEFINER, fires transactionally off auth.users) or by a
-- trusted server-side/service_role operation. `authenticated` has no
-- legitimate reason to insert into profiles at all, so this revoke
-- leaves no grant behind it to close the gap with.
revoke insert on public.profiles from authenticated;

-- user_roles: read own; only admin manages assignments
create policy "user_roles: read own" on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_staff_or_admin()));
create policy "user_roles: admin manages" on public.user_roles
  for all
  to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

-- enquiries: client reads own (by user_id); staff/admin read all.
-- Inserts happen server-side via the Secret Key (bypasses RLS entirely
-- as service_role), same as the existing Sheets-writing API route.
create policy "enquiries: read own" on public.enquiries
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_staff_or_admin()));
create policy "enquiries: staff update" on public.enquiries
  for update
  to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

-- workshop_registrations: same pattern as enquiries
create policy "workshop_registrations: read own" on public.workshop_registrations
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_staff_or_admin()));
create policy "workshop_registrations: staff update" on public.workshop_registrations
  for update
  to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

-- model_profiles / vendor_profiles: read own; staff/admin read all and
-- are the ONLY ones who can update — see "Hardening pass 3" note 7 at
-- the top of this file for why there's no self-update policy here.
create policy "model_profiles: read own" on public.model_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_staff_or_admin()));
create policy "model_profiles: staff update" on public.model_profiles
  for update
  to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));
create policy "vendor_profiles: read own" on public.vendor_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_staff_or_admin()));
create policy "vendor_profiles: staff update" on public.vendor_profiles
  for update
  to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

-- staff_details: staff reads own; admin reads all
create policy "staff_details: read own or admin" on public.staff_details
  for select
  to authenticated
  using ((select auth.uid()) = id or (select public.has_role('admin')));

-- ============================================================
-- Keep profiles.updated_at current
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

commit;
