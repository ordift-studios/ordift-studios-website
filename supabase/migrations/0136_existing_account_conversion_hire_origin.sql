-- Recruitment/Hiring convergence, Route 3: Existing Client/Account ->
-- Staff (2026-09-16). Additive only. recruitment_requisitions.hire_origin
-- is a plain, unconstrained-value text column (no enum) — every
-- pre-existing row keeps its exact current value
-- ('standard_recruitment' or 'founder_direct_hire'), completely
-- unaffected. This migration only WIDENS the existing consistency
-- check to also accept the new 'existing_account_conversion' origin,
-- which — like founder_direct_hire — names a specific real person by
-- construction (this route is IDENTITY REUSE: the person already
-- exists as a genuine Client; nothing about them is recreated).

begin;

alter table public.recruitment_requisitions
  drop constraint recruitment_requisitions_direct_hire_consistency;

alter table public.recruitment_requisitions
  add constraint recruitment_requisitions_direct_hire_consistency check (
    (hire_origin in ('founder_direct_hire', 'existing_account_conversion') and direct_hire_profile_id is not null)
    or (hire_origin = 'standard_recruitment' and direct_hire_profile_id is null)
  );

comment on column public.recruitment_requisitions.hire_origin is
  'standard_recruitment (default, matches every pre-existing row) | founder_direct_hire | existing_account_conversion (2026-09-16 — an existing Client/other-relationship account genuinely becoming Staff; same "names a specific real person" shape as founder_direct_hire). See createRecruitmentRequisition()/createAndApproveExistingAccountConversion() (src/lib/recruitment/requisitions.ts). Not a bypass of governance: every origin still produces a real, approvable requisition through the same decideRequisition() gate.';

commit;
