-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 15 (2026-09-14) —
-- EMPLOYEE REFERRALS (Ghana), OS-HR-GH-003 3.2.
--
-- referral_programs ties to the existing recruitment_requisitions
-- table (migration 0046, Phase 3.3) rather than a duplicated vacancy
-- concept; employee_referrals may optionally link to the existing
-- recruitment_applications table (migration 0036) once/if the referred
-- candidate actually applies through the normal channel — reusing
-- existing recruitment infrastructure rather than inventing a parallel
-- pipeline.
--
-- 3.2: "Eligibility conditions and the reward must be established
-- before the qualifying referral." This is a structural guarantee, not
-- just a documented order of operations: employee_referrals.
-- referral_program_id is a required NOT NULL foreign key, so a
-- referral row can literally never exist referencing a
-- referral_programs row that has not already been created — the
-- database makes "before" true by construction.

begin;

create table public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  requisition_id uuid not null references public.recruitment_requisitions (id),
  eligibility_conditions text not null,
  reward_amount numeric not null check (reward_amount > 0),
  reward_currency text not null,
  conflict_of_interest_exclusions text,
  status text not null default 'active',
  activated_by uuid not null references public.profiles (id),
  activated_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.referral_programs is
  'OS-HR-GH-003 3.2: "Ordift may activate a referral reward for designated vacancies." Ties to the existing recruitment_requisitions table (migration 0046) rather than a new vacancy concept. eligibility_conditions/reward_amount are required at activation — a program cannot exist without them, which is exactly what makes "eligibility conditions and the reward must be established before the qualifying referral" true by construction (see employee_referrals below). status: active | closed. A catalog-like record, not personal data — readable by any authenticated staff member (same precedent as leave_types/authorized_ai_tools) so employees can see which vacancies currently carry an active referral reward before referring someone.';

create unique index referral_programs_one_active_per_requisition_idx on public.referral_programs (requisition_id) where status = 'active';

alter table public.referral_programs enable row level security;

create policy "referral_programs: staff read" on public.referral_programs
  for select
  to authenticated
  using (true);

grant select on public.referral_programs to authenticated;
grant select, insert, update on public.referral_programs to service_role;

create trigger referral_programs_set_updated_at
  before update on public.referral_programs
  for each row execute function public.set_updated_at();

create table public.employee_referrals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  referral_program_id uuid not null references public.referral_programs (id),
  referred_by uuid not null references public.profiles (id),
  candidate_name text not null,
  candidate_contact text not null,
  recruitment_application_id uuid references public.recruitment_applications (id),
  status text not null default 'submitted',
  conflict_of_interest_checked boolean not null default false,
  reward_payable boolean not null default false,
  reward_paid boolean not null default false,
  reward_paid_at timestamptz,
  payment_reference text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employee_referrals is
  'status: submitted | candidate_hired | not_hired | disqualified. recruitment_application_id optionally links to the existing recruitment_applications table (migration 0036) once/if the referred candidate actually applies. reward_payable is never automatically set true merely because status=candidate_hired — confirmReferralRewardPayable() (src/lib/organization/employeeReferrals.ts) requires conflict_of_interest_checked=true as an explicit precondition first, the real gate behind OS-HR-GH-003 3.2''s "Conflict-of-interest exclusions may apply." reward_paid/payment_reference record only that a payment was made — "Payment is separate from basic salary" (3.2): nothing in this table or its accompanying code writes to employment_terms_history.basic_salary.';

create index employee_referrals_referred_by_idx on public.employee_referrals (referred_by);
create index employee_referrals_program_idx on public.employee_referrals (referral_program_id);

alter table public.employee_referrals enable row level security;

create policy "employee_referrals: read own or admin" on public.employee_referrals
  for select
  to authenticated
  using ((select auth.uid()) = referred_by or (select private.is_admin_or_super_admin()));

grant select on public.employee_referrals to authenticated;
grant select, insert, update on public.employee_referrals to service_role;

create trigger employee_referrals_set_updated_at
  before update on public.employee_referrals
  for each row execute function public.set_updated_at();

commit;
