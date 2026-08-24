-- Ordift Organizational & Administrative Architecture V1, Phase 2:
-- link staff_details to the approved Department/Position catalogue
-- (2026-08-25).
--
-- Purely additive — two new nullable FK columns. Nothing existing is
-- altered: staff_details.department (legacy free text), .job_title
-- (legacy free text), .operational_title_id, .engagement_type_id, and
-- .grade_id (0009/0017) are all untouched. .grade_id specifically
-- REMAINS the column that stores a person's Grade — this migration
-- doesn't add a parallel grade column; it changes WHO/HOW that existing
-- column gets written (auto-resolved from position_id going forward, at
-- the application layer — see updateStaffOperationalDetailsAction),
-- never a new source of truth.
--
-- No existing row is updated by this migration — Production
-- staff_details currently has zero rows (confirmed Phase 1), so both
-- new columns start unset for everyone; no real employee is assigned a
-- Department/Position by this migration.

begin;

alter table public.staff_details
  add column if not exists department_id uuid references public.departments (id),
  add column if not exists position_id uuid references public.positions (id);

comment on column public.staff_details.department_id is
  'Resolved from the assigned Position''s department_id when a Position is set — see position_id. Legacy staff_details.department (free text) is preserved separately and used only as a fallback display value for accounts with no Position assigned yet.';
comment on column public.staff_details.position_id is
  'The authoritative organizational appointment (see public.positions). Assigning/changing this is what re-resolves department_id, operational_title_id, and grade_id together — see updateStaffOperationalDetailsAction. Nullable: not every account has been migrated into the new catalogue yet, per explicit instruction never to guess an existing employee''s Position.';

commit;
