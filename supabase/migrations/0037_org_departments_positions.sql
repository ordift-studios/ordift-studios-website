-- Ordift Studios — Organizational Architecture V1, Phase 1: Departments +
-- Positions (2026-08-25)
--
-- Purely additive/structural. No existing table, column, policy, or grant
-- is altered or removed — same discipline as 0009/0017/0019. Nothing
-- here touches staff_details.department/job_title (both stay exactly as
-- they are; migrating away from them is explicitly a later, separate,
-- careful step — not this migration), no existing user's user_roles or
-- staff_details.grade_id changes, and no organizational catalogue is
-- seeded here — this migration creates the shape only.
--
-- Two tables, same proven lookup-table shape already used by
-- operational_titles/engagement_types (0009)/grades (0017)/
-- member_number_classifications (0019): business-scoped, slug+name,
-- active flag instead of delete, sort_order for display.
--
-- Design decisions, per the approved Phase 0 architecture:
--
--   1. departments is a genuine organizational unit (Creative &
--      Production, Operations, ...), NOT the same thing as the existing
--      Sanity `service` document type (also loosely called "Department"
--      in a couple of Studio labels) — that's a client-facing service
--      line, this is an internal org unit. No relationship between them.
--
--   2. departments.head_profile_id is deliberately DISTINCT from the
--      future staff_details.manager_id (not built in this phase) —
--      Department Head (who nominally owns a department) and Direct
--      Manager (who someone actually reports to day-to-day) are
--      different concepts and must not be conflated. head_profile_id
--      introduces no circular dependency: profiles has no reference back
--      to departments, so this is a plain one-directional FK.
--
--   3. positions.operational_title_id is nullable — "where appropriate"
--      per the approved direction. A craft-based position (Photographer,
--      Editor, ...) references the relevant operational_titles row; a
--      position with no obvious craft mapping (COO, Director) simply
--      leaves it null. operational_titles itself is UNCHANGED by this
--      migration — it remains the craft/role-family/specialty axis;
--      positions is the actual organizational-appointment-at-a-level
--      axis layered on top of it. This is what makes multiple Positions
--      per craft possible (Junior Photographer / Photographer / Senior
--      Photographer / Lead Photographer, each its own row, each its own
--      default_grade_id) — i.e. professional/technical progression
--      without forcing anyone into a management position, per explicit
--      direction. No such rows are seeded here.
--
--   4. positions.default_grade_id is NOT NULL — the entire point of this
--      table is "Position is the authoritative source of a person's
--      default Grade" (approved Decision 3), so a Position that doesn't
--      specify a default grade would defeat its own purpose. Nothing in
--      this migration writes to staff_details.grade_id — automatic
--      resolution is a future phase's application-layer logic, exactly
--      as approved ("do not implement manager_id/grade overrides/etc.
--      yet").
--
--   5. positions.default_role_slug is nullable and references
--      roles(slug) (the existing stable, human-readable identifier used
--      throughout the app's RoleSlug type) — explicitly NOT a permission
--      grant. roles/user_roles/private.has_role() remain the sole
--      permission-granting mechanism, unchanged by this migration. This
--      column is only an approved baseline suggestion a future,
--      separately-authorized onboarding flow may read from — it does
--      not itself grant, revoke, or imply any role for any account, and
--      this migration does not touch user_roles for any existing user.
--
--   6. Read access: all authenticated (same as operational_titles/
--      engagement_types — organizational structure, not confidential,
--      unlike Grade itself which stays admin/super_admin-only via its
--      own existing RLS on the grades table, untouched here). Manage
--      (insert/update/delete): Admin or Super Admin, per explicit
--      direction ("Only Admin/Super Admin... according to existing
--      access patterns") — using private.is_admin_or_super_admin()
--      (0027), the same narrower helper already used for staff_details/
--      grades writes, not the broader is_staff_or_admin().
--
--   7. service_role is granted table privileges explicitly in this same
--      migration — learned from 0010/0016/0018 needing separate
--      follow-up fixes for exactly this gap (Production has
--      "Automatically expose new tables" disabled, so service_role gets
--      zero privileges on a new table until granted, regardless of RLS).

begin;

-- ============================================================
-- departments
-- ============================================================
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text not null,
  name text not null,
  description text,
  head_profile_id uuid references public.profiles (id),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

comment on table public.departments is
  'Organizational unit (Creative & Production, Operations, ...) — internal org structure, unrelated to the client-facing Sanity `service` document type. See Ordift Organizational & Administrative Architecture V1, Phase 1.';
comment on column public.departments.head_profile_id is
  'Nominal department head — distinct from the future staff_details.manager_id (direct reporting line, not built in this phase). Do not conflate the two.';

alter table public.departments enable row level security;

create policy "departments: read all authenticated" on public.departments
  for select
  to authenticated
  using (true);

create policy "departments: admin manages" on public.departments
  for all
  to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

grant select on public.departments to authenticated;
grant insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.departments to service_role;

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- ============================================================
-- positions
-- ============================================================
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  department_id uuid not null references public.departments (id),
  operational_title_id uuid references public.operational_titles (id),
  name text not null,
  slug text not null,
  description text,
  default_grade_id uuid not null references public.grades (id),
  default_role_slug text references public.roles (slug),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

comment on table public.positions is
  'Approved organizational appointment at a defined level (e.g. "Senior Photographer") — Department + optional craft (operational_title) + authoritative default Grade + suggested baseline system Role. See Ordift Organizational & Administrative Architecture V1, Phase 1.';
comment on column public.positions.default_grade_id is
  'The authoritative source of a person''s default organizational Grade once assigned this Position — see Decision 3. Not written to any staff_details row by this migration; automatic resolution is a future phase.';
comment on column public.positions.default_role_slug is
  'An approved baseline suggestion only — never a permission grant. roles/user_roles/private.has_role() remain the sole permission-granting mechanism. This migration does not modify any user_roles row.';

alter table public.positions enable row level security;

create policy "positions: read all authenticated" on public.positions
  for select
  to authenticated
  using (true);

create policy "positions: admin manages" on public.positions
  for all
  to authenticated
  using ((select private.is_admin_or_super_admin()))
  with check ((select private.is_admin_or_super_admin()));

grant select on public.positions to authenticated;
grant insert, update, delete on public.positions to authenticated;
grant select, insert, update, delete on public.positions to service_role;

create trigger positions_set_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();

commit;
