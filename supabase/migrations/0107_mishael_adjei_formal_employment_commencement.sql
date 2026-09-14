-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 3 (2026-09-15) —
-- Mishael Adjei's formal Agreement Readiness. The Founder has supplied
-- the previously-missing facts directly for his real, already-existing
-- Production employee record (profile 218cc67f-e96d-4981-ae97-c53b4f73cee2,
-- onboarding 0a486cbf-859d-466b-90d5-64836d63a8f5) — recorded here as
-- his FIRST employment_terms_history snapshot (formal_employment_commencement),
-- the same table/mechanism every later transition or compensation
-- change is recorded against (migrations 0086, 0106).
--
-- Every value below is exactly what the Founder supplied, nothing more:
--   - employing_entity_id: the Ordift Studios (Ghana) entity (migration 0105)
--   - employment_jurisdiction_id: Ghana (migration 0105)
--   - work_location: "Ghana" (his current jurisdiction/location, verbatim)
--   - effective_from: 2026-09-18 — the commencement date for THIS formal
--     employment arrangement being onboarded; any earlier working
--     relationship is NOT reinterpreted as continuous statutory
--     employment by this row
--   - work_pattern: the Office/Administrative pattern the Founder
--     described, restated verbatim (Mon-Fri, 08:00-17:00, 1 hour
--     break, 8 hours/day, 40 hours/week) — consistent with OS-HR-GH-002
--     1.1's own "Office and administrative roles ordinarily operate
--     Monday-Friday" language, never invented
--   - basic_salary/currency: GHS 1,500.00/month, an Ordift-agreed
--     company salary — NOT represented anywhere as Ghana's statutory
--     minimum wage
--
-- Deliberately leaves position_id/department_id/grade_id/manager_id
-- NULL: his real, already-existing Position/Department/Grade
-- (Client Engagement Representative / Client, Marketing & Commercial /
-- grade a188e8fc-...) remain governed exclusively by assignStaffPosition()
-- and continue to resolve via recruitment_requisitions as a per-field
-- fallback (resolveEmployeeAgreementVariables(), employeeAgreements.ts)
-- — this row is never a wholesale replacement of his employment
-- context, only the addition of the specific facts the Founder just
-- supplied. recorded_by is NULL: this is a Founder-authorized,
-- migration-time data entry from facts supplied directly in
-- conversation, not an authenticated in-app action by a specific admin
-- user — same precedent as employing_entities.verified_by in migration
-- 0105.

begin;

insert into public.employment_terms_history (
  profile_id,
  effective_from,
  employing_entity_id,
  employment_jurisdiction_id,
  work_location,
  work_pattern,
  basic_salary,
  currency,
  source,
  recorded_by
)
select
  '218cc67f-e96d-4981-ae97-c53b4f73cee2',
  '2026-09-18',
  (select id from public.employing_entities where slug = 'ordift-studios'),
  (select id from public.employment_jurisdictions where slug = 'ghana'),
  'Ghana',
  'Monday-Friday, 08:00-17:00, with 1 hour unpaid break (8 working hours per day, 40 working hours per week) - Office/Administrative pattern.',
  1500.00,
  'GHS',
  'formal_employment_commencement',
  null
where not exists (
  select 1 from public.employment_terms_history where profile_id = '218cc67f-e96d-4981-ae97-c53b4f73cee2'
);

commit;
