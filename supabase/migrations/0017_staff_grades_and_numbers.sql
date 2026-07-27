-- Ordift Studios — Staff Grades + Staff Numbers (Admin Profile Quick Card
-- foundation, 2026-07-28)
--
-- Purely additive, same discipline as 0009/0016: no existing table,
-- column, policy, or grant is altered or removed. Nothing here touches
-- the public site, forms, dual-write, or Google Sheets paths.
--
-- Two independent pieces, both feeding the Admin Profile Quick Card:
--
--   1. public.grades — implements the organizational Grade system
--      speced out (and deliberately deferred) during the 2026-07-27
--      IAM/email verification pass. Same lookup-table shape as
--      operational_titles/engagement_types (0009): business-scoped,
--      rank_order for display/sort, active flag instead of delete.
--      Grade is confidential internal metadata — it NEVER grants
--      permissions (only Roles do, via private.has_role()) and its RLS
--      restricts SELECT to Admin/Super Admin only, not staff generally
--      and not even the row owner unless they also hold one of those
--      two roles. This matches the approved visibility policy: Grade
--      is admin-console-only, never shown on public/client-facing
--      surfaces, and — per that same policy read literally — not
--      surfaced to the graded person themselves unless they are also
--      an Admin/Super Admin. The Quick Card UI additionally hides the
--      Grade field client-side for non-admin viewers as a second,
--      defense-in-depth layer on top of this RLS restriction.
--
--   2. staff_details.staff_number — a human-readable identifier for
--      any internal account (staff/contractor/admin/super_admin),
--      generated via the existing public.next_record_sequence()
--      function from 0013 with a new "STAFF" prefix — no new counter
--      mechanism, reusing the same atomic per-prefix/per-year sequence
--      already backing ENQ-/WSH-/PRJ- record IDs. Format:
--      STAFF-YYYY-NNNNNN. Nullable and backfilled lazily (assigned the
--      first time a Quick Card/profile is built for an account that
--      doesn't have one yet, via the app), not backfilled in bulk by
--      this migration — there is no reliable "join order" to assign
--      sequence numbers by for existing accounts, and nothing currently
--      depends on staff_number existing for any account.
--
-- staff_details.grade_id is a nullable FK — assigning a grade to any
-- account, including backfilling the founder's own account to Grade 10
-- (Founder/CEO), is a data change made through the app after this
-- migration lands, not part of this file.

begin;

-- ============================================================
-- Grades lookup table
-- ============================================================
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  grade_code text not null,
  name text not null,
  rank_order int not null,
  description text,
  badge_color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, grade_code)
);

insert into public.grades (business_id, grade_code, name, rank_order, description) values
  (public.ordift_studios_business_id(), 'G1', 'Intern / Trainee', 10, 'Entry-level, supervised learning role.'),
  (public.ordift_studios_business_id(), 'G2', 'Junior Contributor', 20, 'Early-career, works under regular guidance.'),
  (public.ordift_studios_business_id(), 'G3', 'Contributor', 30, 'Delivers independently on defined tasks.'),
  (public.ordift_studios_business_id(), 'G4', 'Senior Contributor', 40, 'Experienced individual contributor, minimal supervision.'),
  (public.ordift_studios_business_id(), 'G5', 'Lead', 50, 'Leads a workstream or small group of contributors.'),
  (public.ordift_studios_business_id(), 'G6', 'Supervisor', 60, 'Day-to-day oversight of a team or function.'),
  (public.ordift_studios_business_id(), 'G7', 'Manager', 70, 'Owns a function or department''s operations.'),
  (public.ordift_studios_business_id(), 'G8', 'Senior Manager', 80, 'Broader cross-functional ownership.'),
  (public.ordift_studios_business_id(), 'G9', 'Director', 90, 'Strategic ownership of a major business area.'),
  (public.ordift_studios_business_id(), 'G10', 'Founder / CEO', 100, 'Founder-level, highest tier.');

alter table public.grades enable row level security;

-- Read: Admin/Super Admin only — see confidentiality note at top of file.
create policy "grades: admin read" on public.grades
  for select
  to authenticated
  using ((select private.has_role('admin')) or (select private.is_super_admin()));

-- Manage (create/rename/reorder/archive): Super Admin only, matching the
-- operational_titles/engagement_types precedent from 0009.
create policy "grades: super_admin manages" on public.grades
  for all
  to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

grant select on public.grades to authenticated;
grant insert, update, delete on public.grades to authenticated;

create trigger grades_set_updated_at
  before update on public.grades
  for each row execute function public.set_updated_at();

-- ============================================================
-- staff_details — staff_number + grade_id (additive columns only)
-- ============================================================
alter table public.staff_details
  add column if not exists staff_number text unique,
  add column if not exists grade_id uuid references public.grades (id);

comment on column public.staff_details.staff_number is
  'Human-readable identifier, format STAFF-YYYY-NNNNNN, generated via public.next_record_sequence(''STAFF'', year). Nullable; assigned lazily by the app, not backfilled by this migration.';
comment on column public.staff_details.grade_id is
  'Confidential internal seniority tier — see public.grades. Never used in any permission check; Roles (private.has_role()) remain the sole permission mechanism.';

-- No new grant needed on staff_details itself: "staff_details: read own
-- or admin" (0001) and "staff_details: staff update"/"staff_details:
-- staff insert" (0009) already cover these two new columns, since RLS
-- and grants in Postgres are row/table-scoped, not column-scoped, and
-- no existing grant excludes them. The Quick Card UI is what restricts
-- who actually SEES grade_id's resolved name (via the grades RLS
-- policy above) and who can WRITE it (enforced at the app/API layer,
-- narrower than the existing staff-wide update grant — see
-- ADMIN_GUIDE.md for the Quick Card's Edit Profile access rules).

commit;
