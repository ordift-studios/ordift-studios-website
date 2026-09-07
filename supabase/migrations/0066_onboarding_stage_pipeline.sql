-- Organizational Structure, Authority Grants, Staff Onboarding & Work
-- Email V1 — closure addition (2026-09-07), Part 26/56.
--
-- Gap found on re-inspection: public.staff_onboarding (0046) already
-- tracks an overall in_progress/completed STATUS, but nothing tracked
-- WHICH of the specific named onboarding stages a person is currently
-- at (Candidate/Proposed -> Preliminary Approval -> Background
-- Screening -> Management Review (where needed) -> Approved for Hire/
-- Engagement -> Invited -> Identity/Profile -> Work Email -> Documents
-- -> Authority Assignment -> Active for an employee track; a shorter
-- Proposed -> Approved -> Invited -> Profile -> Payment Setup ->
-- Engagement Assigned -> Active track for external contractors/
-- vendors, per the explicit "do not force employee-only stages onto
-- vendors/contractors" instruction).
--
-- Confirmed safe before writing: public.staff_onboarding has ZERO rows
-- in Production (verified read-only immediately before this
-- migration), so these are genuinely additive, backward-compatible
-- columns — no existing row's shape changes meaning.
--
-- `pipeline` selects which named stage list applies (employee vs
-- external_contractor) — the actual ordered stage lists themselves are
-- pure, zero-import TypeScript constants (src/lib/organization/
-- onboardingStages.ts), not a second DB-side source of truth; `stage`
-- here is just unconstrained text, same precedent as
-- activity_log.action/workflow_statuses.status.
begin;

alter table public.staff_onboarding
  add column if not exists pipeline text not null default 'employee',
  add column if not exists stage text not null default 'candidate_proposed',
  add column if not exists stage_changed_at timestamptz not null default now(),
  add column if not exists stage_changed_by uuid references public.profiles (id);

comment on column public.staff_onboarding.pipeline is
  'Which named onboarding stage sequence applies to this person: "employee" (the full 10-stage sequence) or "external_contractor" (the shorter Proposed/Approved/Invited/Profile/Payment Setup/Engagement Assigned/Active sequence) — see src/lib/organization/onboardingStages.ts for the canonical ordered lists. Chosen once at onboarding start based on engagement classification, never implied by Grade or capability.';
comment on column public.staff_onboarding.stage is
  'Current named stage within the chosen pipeline (unconstrained text, application-validated against onboardingStages.ts). Distinct from the pre-existing status column (in_progress/completed), which remains the coarse overall completion flag.';

commit;
