-- Ordift Studios — Access Management (Milestone 0 follow-on, 2026-07-26)
--
-- Purely additive. Nothing here removes or restructures an existing
-- table, column, policy, or grant — every currently-working Admin,
-- Staff, and Client code path is untouched. See the chat response that
-- shipped this migration for the full architecture audit; the summary:
--
--   1. `client` is not a technical dependency anywhere in this schema —
--      no RLS policy checks has_role('client'), it's purely an
--      app-level default (src/app/portal/signup/actions.ts) for the
--      public self-service signup form. Safe to leave completely
--      alone here; the two admin accounts' client-role cleanup is a
--      data change (DELETE from user_roles), not a schema change.
--   2. Two new roles: `super_admin` (stacks on top of `admin` — an
--      account can hold both; a small set of highest-risk actions
--      require super_admin specifically, everything admin could
--      already do stays unchanged) and `contractor` (a genuinely
--      narrower level than `staff` — no blanket read access, scoped
--      instead to rows they're explicitly assigned to via the new
--      project_assignments table).
--   3. Suspension/deactivation/expiry is enforced in exactly one
--      place — private.has_role() — so every existing RLS policy that
--      already calls private.has_role()/private.is_staff_or_admin()
--      (which is most of them) automatically becomes
--      suspension-and-expiry-aware with zero changes to those
--      policies. This is the same "one central lever" principle the
--      has_role()/is_staff_or_admin() split was already built around.
--   4. `staff_details` existed since 0001 but was never wired into any
--      code path — repurposed here (columns added, not renamed) to
--      hold operational title + engagement type for any internal
--      account, not only ones with the `staff` role.
--   5. `Talent` stays exactly as-is (the existing `model` role) — full
--      Talent Management (models, influencers, creators, actors,
--      presenters) is an explicitly separate, not-yet-scoped future
--      module (ARCHITECTURE.md). Nothing here blocks it: a future
--      `talent` role, if ever needed, is a `roles` row insert, and
--      operational_titles/engagement_types already generalize to
--      whatever that module needs.
--
begin;

-- ============================================================
-- New permission-level roles
-- ============================================================
insert into public.roles (slug, name, description) values
  ('super_admin', 'Super Admin', 'Highest permission tier — the only tier that can grant/revoke Admin or Super Admin, suspend/deactivate another Super Admin, or manage the operational-title/engagement-type lookup tables. Stacks on top of Admin; does not replace it.'),
  ('contractor', 'Contractor / Collaborator', 'Project-scoped internal collaborator (photographer, retoucher, videographer, etc.) — sees only projects they are explicitly assigned to via project_assignments, never the full Admin Platform.')
on conflict (slug) do nothing;

-- ============================================================
-- profiles — access status + optional expiry (additive columns)
-- ============================================================
alter table public.profiles
  add column if not exists access_status text not null default 'active'
    check (access_status in ('active', 'suspended', 'deactivated')),
  add column if not exists access_status_reason text,
  add column if not exists access_status_changed_at timestamptz,
  add column if not exists access_status_changed_by uuid references public.profiles (id),
  add column if not exists access_expires_at timestamptz;

comment on column public.profiles.access_status is
  'Enforced centrally inside private.has_role() — suspended/deactivated blocks every role check, not just internal-console access. Preserves the row (and every FK''d historical record) rather than deleting it.';
comment on column public.profiles.access_expires_at is
  'Optional — for temporary/project-based collaborators. Checked live (now() comparison) inside private.has_role(), same enforcement point as access_status; no scheduled job needed.';

-- ============================================================
-- staff_details — repurposed (not renamed) to hold operational title
-- + engagement type for any internal account. Previously had zero
-- grants and zero call sites (dead since 0001); both are fixed below.
-- ============================================================
create table if not exists public.operational_titles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists public.engagement_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

insert into public.operational_titles (business_id, slug, name, sort_order) values
  (public.ordift_studios_business_id(), 'photographer', 'Photographer', 10),
  (public.ordift_studios_business_id(), 'videographer', 'Videographer', 20),
  (public.ordift_studios_business_id(), 'retoucher', 'Retoucher', 30),
  (public.ordift_studios_business_id(), 'photo_editor', 'Photo Editor', 40),
  (public.ordift_studios_business_id(), 'video_editor', 'Video Editor', 50),
  (public.ordift_studios_business_id(), 'graphic_designer', 'Graphic Designer', 60),
  (public.ordift_studios_business_id(), 'creative_director', 'Creative Director', 70),
  (public.ordift_studios_business_id(), 'drone_operator', 'Drone Operator', 80),
  (public.ordift_studios_business_id(), 'lighting_assistant', 'Lighting Assistant', 90),
  (public.ordift_studios_business_id(), 'production_assistant', 'Production Assistant', 100),
  (public.ordift_studios_business_id(), 'makeup_artist', 'Makeup Artist', 110),
  (public.ordift_studios_business_id(), 'stylist', 'Stylist', 120),
  (public.ordift_studios_business_id(), 'talent_manager', 'Talent Manager', 130),
  (public.ordift_studios_business_id(), 'workshop_instructor', 'Workshop Instructor', 140),
  (public.ordift_studios_business_id(), 'event_coordinator', 'Event Coordinator', 150),
  (public.ordift_studios_business_id(), 'other', 'Other', 999)
on conflict (business_id, slug) do nothing;

insert into public.engagement_types (business_id, slug, name, sort_order) values
  (public.ordift_studios_business_id(), 'full_time', 'Full-time', 10),
  (public.ordift_studios_business_id(), 'part_time', 'Part-time', 20),
  (public.ordift_studios_business_id(), 'freelancer', 'Freelancer', 30),
  (public.ordift_studios_business_id(), 'independent_contractor', 'Independent Contractor', 40),
  (public.ordift_studios_business_id(), 'project_based', 'Project-based', 50),
  (public.ordift_studios_business_id(), 'intern', 'Intern', 60),
  (public.ordift_studios_business_id(), 'volunteer', 'Volunteer', 70)
on conflict (business_id, slug) do nothing;

alter table public.staff_details
  add column if not exists operational_title_id uuid references public.operational_titles (id),
  add column if not exists engagement_type_id uuid references public.engagement_types (id),
  add column if not exists updated_at timestamptz not null default now();

comment on table public.staff_details is
  'Details for any internal account (staff, contractor, admin, super_admin) — not only the staff role. department/job_title (0001) predate operational_title_id/engagement_type_id (0009); prefer the latter going forward.';

-- ============================================================
-- project_assignments — internal collaborators, scoped to a specific
-- project. Same polymorphic entity_type/entity_id pattern already
-- used by activity_log/deliverables/project_requests.
-- ============================================================
create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null check (entity_type in ('enquiry', 'workshop_registration')),
  entity_id uuid not null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'completed', 'removed', 'withdrawn')),
  role_note text,
  starts_at timestamptz,
  ends_at timestamptz,
  access_expires_at timestamptz,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  removal_reason text,
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index project_assignments_entity_idx on public.project_assignments (entity_type, entity_id);
create index project_assignments_user_idx on public.project_assignments (user_id);

-- ============================================================
-- Central enforcement point — has_role() now also requires the
-- caller's own profile to be active and unexpired. Every existing
-- policy calling private.has_role()/private.is_staff_or_admin() (the
-- large majority of policies in this schema) inherits
-- suspension/expiry awareness automatically; none of those policies
-- are touched by this migration.
-- ============================================================
create or replace function private.has_role(role_slug text)
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
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and r.slug = role_slug
      and p.access_status = 'active'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

revoke all on function private.has_role(text) from public, anon, authenticated, service_role;
grant execute on function private.has_role(text) to authenticated;

-- is_staff_or_admin() body is unchanged (still calls private.has_role()
-- twice) — recreated only so its definition stays next to has_role()'s
-- for anyone reading this file; behavior inherits the change above
-- automatically even without this recreate, since it's the same
-- function object.
create or replace function private.is_staff_or_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_role('staff') or private.has_role('admin');
$$;

revoke all on function private.is_staff_or_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_staff_or_admin() to authenticated;

create or replace function private.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_role('super_admin');
$$;

revoke all on function private.is_super_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_super_admin() to authenticated;

-- Used by contractor-scoped RLS policies below — true only for an
-- 'active' assignment row that hasn't expired, mirroring has_role()'s
-- own active/expiry check rather than trusting status blindly.
create or replace function private.has_project_access(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_assignments pa
    join public.profiles p on p.id = pa.user_id
    where pa.user_id = auth.uid()
      and pa.entity_type = p_entity_type
      and pa.entity_id = p_entity_id
      and pa.status = 'active'
      and (pa.access_expires_at is null or pa.access_expires_at > now())
      and p.access_status = 'active'
      and (p.access_expires_at is null or p.access_expires_at > now())
  );
$$;

revoke all on function private.has_project_access(text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.has_project_access(text, uuid) to authenticated;

-- Counts ACTIVE (access_status = 'active') accounts holding
-- super_admin, ignoring role assignment alone — a super_admin whose
-- profile is suspended/deactivated doesn't count as protection against
-- lockout, since they can't act anyway. Used by the app (not by any
-- RLS policy) to block the last-super-admin removal case.
create or replace function private.active_super_admin_count()
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where r.slug = 'super_admin'
    and p.access_status = 'active';
$$;

revoke all on function private.active_super_admin_count() from public, anon, authenticated, service_role;
grant execute on function private.active_super_admin_count() to authenticated;

-- ============================================================
-- RLS — new tables
-- ============================================================
alter table public.operational_titles enable row level security;
alter table public.engagement_types enable row level security;
alter table public.project_assignments enable row level security;

create policy "operational_titles: read all authenticated" on public.operational_titles
  for select
  to authenticated
  using (true);
create policy "operational_titles: super_admin manages" on public.operational_titles
  for all
  to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy "engagement_types: read all authenticated" on public.engagement_types
  for select
  to authenticated
  using (true);
create policy "engagement_types: super_admin manages" on public.engagement_types
  for all
  to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy "project_assignments: own read" on public.project_assignments
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff_or_admin()));
create policy "project_assignments: staff manage" on public.project_assignments
  for all
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));

grant select on public.operational_titles to authenticated;
grant insert, update, delete on public.operational_titles to authenticated;
grant select on public.engagement_types to authenticated;
grant insert, update, delete on public.engagement_types to authenticated;
grant select, insert, update, delete on public.project_assignments to authenticated;

-- staff_details previously had zero grants (dead table) — now wired up
-- for real, same "self read, staff/admin read all, staff/admin write"
-- shape as model_profiles/vendor_profiles.
create policy "staff_details: staff update" on public.staff_details
  for update
  to authenticated
  using ((select private.is_staff_or_admin()))
  with check ((select private.is_staff_or_admin()));
create policy "staff_details: staff insert" on public.staff_details
  for insert
  to authenticated
  with check ((select private.is_staff_or_admin()));

grant select on public.staff_details to authenticated;
grant insert, update on public.staff_details to authenticated;

-- ============================================================
-- Contractor project-scoped read access — additive policies on
-- existing tables. RLS policies are OR'd together: adding a new one
-- can only ever grant additional access, never remove the read/update
-- access any existing role already has. entity_id on enquiries/
-- workshop_registrations is just each table's own `id` column.
-- ============================================================
create policy "enquiries: contractor read assigned" on public.enquiries
  for select
  to authenticated
  using ((select private.has_project_access('enquiry', id)));

create policy "workshop_registrations: contractor read assigned" on public.workshop_registrations
  for select
  to authenticated
  using ((select private.has_project_access('workshop_registration', id)));

create policy "deliverables: contractor read assigned" on public.deliverables
  for select
  to authenticated
  using ((select private.has_project_access(entity_type, entity_id)));

-- ============================================================
-- project_updates — collaborator-authored notes/reference links on an
-- assigned project. Deliberately separate from enquiry_notes (which
-- is the existing client-visible Updates tab, migration 0006) — this
-- keeps collaborator activity from ever becoming client-visible by
-- accident. Reference-link only, no file upload, matching the
-- established Phase 1A uploads policy.
-- ============================================================
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  entity_type text not null check (entity_type in ('enquiry', 'workshop_registration')),
  entity_id uuid not null,
  author_user_id uuid not null references public.profiles (id),
  note text not null,
  link_url text,
  created_at timestamptz not null default now()
);

create index project_updates_entity_idx on public.project_updates (entity_type, entity_id);

alter table public.project_updates enable row level security;

create policy "project_updates: staff read all" on public.project_updates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));
create policy "project_updates: contractor read assigned" on public.project_updates
  for select
  to authenticated
  using ((select private.has_project_access(entity_type, entity_id)));
create policy "project_updates: contractor insert assigned own" on public.project_updates
  for insert
  to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (select private.has_project_access(entity_type, entity_id))
  );
create policy "project_updates: staff insert" on public.project_updates
  for insert
  to authenticated
  with check ((select private.is_staff_or_admin()));

grant select, insert on public.project_updates to authenticated;

commit;
