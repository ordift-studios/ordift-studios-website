-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 6 (2026-09-14) —
-- COMPENSATION / PAYROLL INFRASTRUCTURE (Ghana), OS-HR-GH-003 sections
-- 2-4. Basic salary structure itself (section 1: basic_salary/allowances,
-- effective-dated, historical values preserved) already exists —
-- employment_terms_history, migration 0086 — and is untouched here.
--
-- Five tables, covering what section 1 does not:
--   - salary_advances (2.1/2.2)
--   - staff_benefit_transactions (2.3/2.4/2.5)
--   - long_service_benefit_awards (3.3)
--   - death_in_service_benefit_awards (3.4)
--   - ghana_statutory_configuration (4.1/4.2)
--
-- No real Ghana SSNIT/statutory contribution rate, wage floor, or
-- eligible-service-day methodology is invented anywhere in this
-- migration — ghana_statutory_configuration is seeded with zero rows
-- (4.2: "must be maintained through effective-dated Ghana
-- configuration, not hard-coded"), and long_service_benefit_awards
-- requires a human-supplied eligible_service_start_date rather than an
-- auto-computed one (3.3: "the eligible-service-day methodology must be
-- configured and approved before the first employee becomes eligible").

begin;

create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  requested_by uuid not null references public.profiles (id),
  requested_amount numeric not null check (requested_amount > 0),
  basic_salary_reference numeric not null check (basic_salary_reference > 0),
  cap_amount numeric not null,
  exceeds_cap boolean not null,
  repayment_terms text,
  status text not null default 'requested',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  disbursed_at timestamptz,
  disbursed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.salary_advances is
  'status: requested | approved | declined | disbursed | repaid | written_off (unconstrained text, application-validated, same precedent as activity_log.action). basic_salary_reference is a snapshot of one month''s basic salary taken at request time (from employment_terms_history) — cap_amount is computed once from it as 0.5x (OS-HR-GH-003 2.2''s real 50% internal cap), never recomputed retroactively if salary later changes. exceeds_cap routes the approval decision to Founder/Super Admin only when true (2.2: "Higher exceptional advances require Founder/Senior approval") — the same isSuperAdminId()-only pattern already established for the upper partnership-concession bands (src/lib/partnerships/valueEconomics.ts resolveConcessionApprovalRequirement()), never a capability-based escape valve. repayment_terms must be recorded before status can move to disbursed (2.2: "A written repayment arrangement must be agreed before disbursement") — enforced in application code (recordSalaryAdvanceDecision()/disburseSalaryAdvance()), not a DB constraint, since the terms are naturally absent at request time.';

create index salary_advances_profile_idx on public.salary_advances (profile_id);

alter table public.salary_advances enable row level security;

create policy "salary_advances: read own or admin" on public.salary_advances
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.salary_advances to authenticated;
grant select, insert, update on public.salary_advances to service_role;

create trigger salary_advances_set_updated_at
  before update on public.salary_advances
  for each row execute function public.set_updated_at();

create table public.staff_benefit_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  transaction_type text not null,
  benefit_description text not null,
  amount numeric not null check (amount > 0),
  transaction_date date not null default current_date,
  payroll_recovery boolean not null default false,
  related_transaction_id uuid references public.staff_benefit_transactions (id),
  payroll_cutoff_date date,
  reconciled_payroll_cycle text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.staff_benefit_transactions is
  'Append-only ledger — OS-HR-GH-003 2.5: "Original purchase and refund events are never erased." transaction_type: purchase | refund (unconstrained text, application-validated); a refund is always a NEW row with related_transaction_id pointing back at the original purchase, never an update/overwrite of it. payroll_cutoff_date/reconciled_payroll_cycle are computed once at insert from transaction_date using 2.4''s real approved rule (processing cut-off is the 15th of each month: on-or-before -> that calendar month''s cycle "YYYY-MM"; after -> the next month''s cycle) — the 15th is explicitly an internal processing rule, not a statutory Ghana deadline, and is never presented as one. The benefit itself is non-cash-convertible and never increases basic_salary (2.3) — nothing in this table or its accompanying code writes to employment_terms_history.basic_salary.';

create index staff_benefit_transactions_profile_idx on public.staff_benefit_transactions (profile_id);

alter table public.staff_benefit_transactions enable row level security;

create policy "staff_benefit_transactions: read own or admin" on public.staff_benefit_transactions
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.staff_benefit_transactions to authenticated;
grant select, insert on public.staff_benefit_transactions to service_role;

create table public.long_service_benefit_awards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  milestone_years integer not null,
  percentage numeric not null,
  basic_salary_reference numeric not null check (basic_salary_reference > 0),
  award_amount numeric not null,
  eligible_service_start_date date not null,
  awarded_by uuid not null references public.profiles (id),
  awarded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint long_service_benefit_awards_milestone_check check (milestone_years in (3, 5, 10)),
  constraint long_service_benefit_awards_percentage_check check (
    (milestone_years = 3 and percentage = 25)
    or (milestone_years = 5 and percentage = 50)
    or (milestone_years = 10 and percentage = 100)
  )
);

comment on table public.long_service_benefit_awards is
  'Append-only. milestone_years/percentage are constrained to the exact real approved pairs from OS-HR-GH-003 3.3: 3 years-25%, 5 years-50%, 10 years-100% of one month''s basic salary — "milestone awards, not annual accumulation." award_amount is computed server-side as basic_salary_reference * percentage / 100, never a raw caller-supplied value. eligible_service_start_date is a required, human-supplied field, deliberately never auto-computed by this table or its code — 3.3 states "the eligible-service-day methodology must be configured and approved before the first employee becomes eligible," which has not happened yet; recording an award therefore requires a person to already have determined and approved eligibility outside this system. This benefit is separate from redundancy, pension/social security, workers compensation, death-in-service and statutory final entitlements — nothing here writes to any of those.';

create index long_service_benefit_awards_profile_idx on public.long_service_benefit_awards (profile_id);

alter table public.long_service_benefit_awards enable row level security;

create policy "long_service_benefit_awards: read own or admin" on public.long_service_benefit_awards
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.long_service_benefit_awards to authenticated;
grant select, insert on public.long_service_benefit_awards to service_role;

create table public.death_in_service_benefit_awards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  basic_salary_reference numeric not null check (basic_salary_reference > 0),
  award_amount numeric not null,
  beneficiary_verified boolean not null default false,
  beneficiary_details text,
  verification_notes text,
  awarded_by uuid not null references public.profiles (id),
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.death_in_service_benefit_awards is
  'Append-only. award_amount is computed server-side as exactly basic_salary_reference (OS-HR-GH-003 3.4: "a company-funded benefit equal to one month''s basic salary"), never a raw caller-supplied value. beneficiary_verified/beneficiary_details/verification_notes exist because 3.4 requires "proper beneficiary/estate verification" before payment — recording an award here does not itself constitute that verification, it records the outcome of a verification performed elsewhere. Separate from statutory, pension, insurance or workers-compensation benefits — nothing here writes to any of those.';

alter table public.death_in_service_benefit_awards enable row level security;

-- Admin-only read (not "own or admin") — the subject employee is
-- deceased; this record concerns a beneficiary/estate, not a living
-- person's own self-service data.
create policy "death_in_service_benefit_awards: admin read" on public.death_in_service_benefit_awards
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.death_in_service_benefit_awards to authenticated;
grant select, insert on public.death_in_service_benefit_awards to service_role;

create table public.ghana_statutory_configuration (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  effective_from date not null,
  employer_contribution_rate_percent numeric,
  employee_contribution_rate_percent numeric,
  statutory_wage_floor numeric,
  notes text not null,
  configured_by uuid not null references public.profiles (id),
  configured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.ghana_statutory_configuration is
  'CONFIGURATION REQUIRED — deliberately seeded with zero rows by this migration. OS-HR-GH-003 4.2: "Contribution rates, statutory wage floors and other changeable statutory values must be maintained through effective-dated Ghana configuration, not hard-coded permanently." No real Ghana pension/SSNIT contribution rate or statutory wage floor is invented anywhere in this system — a person with the actual authoritative current figures must insert the first row (with a documented source in notes) before any payroll calculation may rely on this table. Append-only, effective-dated: "current" configuration = the row with the latest effective_from <= today; a rate change is always a new row, never an update of a past one, preserving the historical rate that applied on any given past date.';

create index ghana_statutory_configuration_effective_idx on public.ghana_statutory_configuration (effective_from desc);

alter table public.ghana_statutory_configuration enable row level security;

-- Admin-only — payroll/statutory configuration, not personal employee
-- data; no "own read" concept applies.
create policy "ghana_statutory_configuration: admin read" on public.ghana_statutory_configuration
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.ghana_statutory_configuration to authenticated;
grant select, insert on public.ghana_statutory_configuration to service_role;

commit;
