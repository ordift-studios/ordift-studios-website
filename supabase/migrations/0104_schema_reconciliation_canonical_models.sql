-- Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 1 (2026-09-14) —
-- SCHEMA RECONCILIATION: three overlaps surfaced by the Phase B4 final
-- reconciliation report are resolved here per explicit Founder
-- authorization. Governing principle: one canonical domain model per
-- business concept — where the pre-existing, already-UI-connected
-- architecture can support the Founder-approved Ghana requirements
-- with sensible extension, extend and reuse it rather than maintaining
-- a second competing model.
--
-- This is a CORRECTIVE migration. No historical migration file
-- (0065, 0079, 0089, 0091, 0092, 0097, 0101) is altered or deleted —
-- their tables, once created, remain part of the historical record.
-- Three of the tables they created are retired HERE, in a new
-- migration, per the explicit instruction governing this reconciliation.
--
-- Verified immediately before writing this migration: all ten tables
-- touched below hold zero rows in Production. No data migration is
-- required or performed — this is a pure schema correction.

begin;

-- ============================================================
-- PART A — Separation / offboarding: separation_cases becomes canonical
-- ============================================================
-- separation_cases (migration 0079) already has a live Admin Portal
-- workspace (src/app/admin/organization/separation/[caseId]) built on
-- separationCases.ts/separationRequirements.ts. The newer `separations`
-- table (migration 0092) duplicated the case concept with a
-- Ghana-specific route taxonomy and a granular 7-stage workflow that
-- separation_cases did not have. Both are folded into separation_cases
-- as additive columns; `separations` is retired.
--
-- final_settlements/final_settlement_deductions (migration 0092) are
-- NOT retired — they are genuinely new capability that migration 0079
-- explicitly declined to build ("no amount is calculated or paid
-- here... Finance remains independently controlled"), which conflicts
-- with OS-HR-GH-006 5.1's explicit requirement that this system
-- compute and itemize the real Net Final Settlement figure. They are
-- repointed from `separations` to `separation_cases`.

alter table public.separation_cases
  add column separation_route text,
  add column notice_treatment text,
  add column appeal_id uuid references public.appeals (id),
  add column offboarding_stage text not null default 'offboarding_initiated',
  add column resignation_withdrawal_requested_at timestamptz,
  add column resignation_withdrawal_decided_at timestamptz,
  add column resignation_withdrawal_decided_by uuid references public.profiles (id),
  add column resignation_withdrawal_outcome text;

alter table public.separation_cases
  add constraint separation_cases_route_check check (
    separation_route is null or separation_route in (
      'resignation', 'probationary_separation', 'performance_capability_termination',
      'misconduct_dismissal', 'redundancy_role_elimination', 'fixed_term_expiry',
      'retirement', 'death_in_service', 'other_lawful_route'
    )
  );

alter table public.separation_cases
  add constraint separation_cases_withdrawal_outcome_check check (
    resignation_withdrawal_outcome is null or resignation_withdrawal_outcome in ('approved', 'declined')
  );

comment on column public.separation_cases.separation_route is
  'OS-HR-GH-006 1.1''s exact real named routes — nullable (not every separation_cases row is a Ghana employee case; existing category/reason_type remain the general-purpose classification for all relationship types). Populated for Ghana staff cases going forward.';
comment on column public.separation_cases.notice_treatment is
  'OS-HR-GH-006 2.2: worked in full / shortened by mutual agreement / payment in lieu / restricted or garden duties (unconstrained text, application-validated) — separate from notice_policy_source/notice_required_days (migration 0079), which record how the notice PERIOD was resolved, not how it is being served.';
comment on column public.separation_cases.appeal_id is
  'Links to the existing appeals table (migration 0089) rather than duplicating appeal status — OS-HR-GH-006 1.2''s "appeal status where applicable."';
comment on column public.separation_cases.offboarding_stage is
  'OS-HR-GH-006 4.1''s real 7-stage workflow: offboarding_initiated | handover | departmental_clearance | assets_access_reconciled | final_settlement_review | cleared | employment_closed (enforced by computeNextOffboardingStage(), src/lib/organization/offboarding.ts). Deliberately a separate, more granular column from the existing coarse status (open/cleared/cancelled, migration 0079) — status continues to mean what it always meant (case-level open/cleared/cancelled); offboarding_stage tracks the real Ghana-specific workflow sequence within an open case. employment_closed may only be reached once status is independently already ''cleared'' AND final_settlements is approved/paid — see closeEmployment() for the actual enforced precondition.';
comment on column public.separation_cases.resignation_withdrawal_requested_at is
  'OS-HR-GH-006 2.4/9.2''s real workflow: Submitted -> Withdrawal Requested -> Management Review -> Approved/Declined. Approval cancels offboarding and restores appropriate access (application-layer action, not a schema concern); decline leaves the original resignation in effect — resignation_withdrawal_outcome=''declined'' changes nothing else on this row.';

alter table public.final_settlements drop constraint final_settlements_separation_id_fkey;
alter table public.final_settlements rename column separation_id to separation_case_id;
alter table public.final_settlements add constraint final_settlements_separation_case_id_fkey foreign key (separation_case_id) references public.separation_cases (id);

comment on table public.final_settlements is
  'One row per separation_cases row (migration 0079/0104), not per the now-retired `separations` table. gross_entitlements/net_final_settlement remain database GENERATED columns computed directly from OS-HR-GH-006 5.1''s real formula. This table exists precisely because migration 0079''s separation_cases.final_settlement_status/final_settlement_reference are deliberately boundary/pointer fields only ("Finance remains independently controlled") — OS-HR-GH-006 5.1 requires this system to actually compute and itemize the settlement, which those boundary fields structurally cannot do. Each component remains its own column (5.2).';

drop table public.offboarding_handover_items;
drop table public.separations;

-- ============================================================
-- PART B — Safeguarding / background screening: background_screenings
-- becomes canonical
-- ============================================================
-- background_screenings (migration 0065) already has a live Admin
-- Portal surface (src/app/admin/organization/people/[id]) and a
-- Super-Admin-only RLS policy stricter than safeguarding_checks'
-- own "read own or admin". Its category vocabulary already includes
-- criminal_history; extended here to add a safeguarding-specific
-- category and the two genuinely new fields OS-HR-GH-005 6.3 needs
-- that background_screenings did not yet have: an expiry date and a
-- link back to the real classification system.

alter table public.background_screenings
  add column requirement_evaluation_id uuid references public.requirement_evaluations (id),
  add column expiry_date date,
  add column child_vulnerable_person_relevant boolean not null default false;

comment on column public.background_screenings.requirement_evaluation_id is
  'Optionally links to the requirement_evaluations row (migration 0083) whose classifyRequirement() outcome determined this screening was required for this role/jurisdiction — OS-HR-GH-005 6.3: "through the requirement-classification system rather than universally imposed." Never a second, competing decision engine.';
comment on column public.background_screenings.expiry_date is
  'When a screening/check result has a real expiry (e.g. a time-limited clearance) — nullable, since not every category expires.';
comment on column public.background_screenings.child_vulnerable_person_relevant is
  'Flags this screening as specifically relevant to OS-HR-GH-005 section 6 (staff working with children or vulnerable persons) — a typed distinction within the one canonical screening record, never a second table.';

drop table public.safeguarding_checks;

comment on table public.background_screenings is
  'The one canonical background/safeguarding-check record for this system (migration 0065, extended 0104). category now includes safeguarding_clearance alongside the original eight (identity_verification, employment_history, education, professional_qualification, references, right_to_work, role_licence, criminal_history) — see BACKGROUND_SCREENING_CATEGORIES in src/lib/organization/backgroundScreening.ts. requirement_evaluation_id/expiry_date/child_vulnerable_person_relevant (migration 0104) are what OS-HR-GH-005 6.3''s safeguarding-check requirement needed beyond the original onboarding-screening design; no second table was created for it.';

-- safeguarding_concern_reports (migration 0097) is NOT touched — no
-- pre-existing restricted-reporting table exists for this concept; it
-- remains genuinely new, non-duplicated infrastructure.

-- ============================================================
-- PART C — Acting appointments: acting_assignments becomes canonical
-- ============================================================
-- acting_assignments (migration 0065) already has a live Admin Portal
-- surface (src/app/admin/authority) and already models the real
-- system-authority side of an acting role (linked_authority_grant_id,
-- financial_authority_level) that acting_appointments never touched.
-- The one genuinely new field OS-HR-GH-003 8.2 needs that
-- acting_assignments did not have is the optional acting allowance —
-- added here directly on the canonical record, per explicit
-- instruction not to create a second acting-allowance table.

alter table public.acting_assignments
  add column responsibilities text,
  add column reporting_to uuid references public.profiles (id),
  add column temporary_permissions text,
  add column acting_allowance_amount numeric,
  add column allowance_approved_by uuid references public.profiles (id),
  add column allowance_approved_at timestamptz;

comment on column public.acting_assignments.acting_allowance_amount is
  'OS-HR-GH-003 8.2: "An acting allowance is optional and separately approved." Nullable — most acting assignments carry none. allowance_approved_by/allowance_approved_at are only ever set together with a non-null amount (enforced in authorizeActingAllowance(), src/lib/organization/actingAssignments.ts). This is a flat, optional figure on the canonical acting record, never a second table and never wired into employment_terms_history.basic_salary — an acting allowance is explicitly separate from substantive pay.';
comment on column public.acting_assignments.temporary_permissions is
  'Descriptive text only — real system/financial authority for an acting assignment continues to flow exclusively through linked_authority_grant_id -> the existing authority_grants.expires_at mechanism (migration 0065''s own original design), never a second, competing authority concept. "Acting Appointment ≠ Promotion": nothing in this table or its accompanying code ever writes to the promotions table (migration 0101) — expiry of an acting assignment (isActingAssignmentActive() returning false once end_date passes, or endActingAssignmentEarly()) never silently becomes a promotion; a promotion is always a separate, independently decided recordPromotion() call.';

comment on table public.acting_assignments is
  'The one canonical acting-appointment record for this system (migration 0065, extended 0104). Temporary authority/allowance ends with the assignment (end_date passing, or endActingAssignmentEarly()) unless a new decision is made — no automatic rollover or promotion conversion exists anywhere in this table or its code.';

drop table public.acting_appointments;

commit;
