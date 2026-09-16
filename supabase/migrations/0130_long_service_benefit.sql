-- Long-Service Benefit Engine (backlog Phase 7, 2026-09-16). An ORDIFT
-- CONTROLLED BENEFIT — explicitly NOT statutory gratuity. A separate
-- future statutory-benefit architecture (if/when genuinely needed for
-- a real jurisdiction requirement) is deliberately out of scope here
-- and must never be conflated with this table.
--
-- Configurable, versioned, effective-dated policy rather than a
-- hardcoded formula — a future policy change is a NEW row, never an
-- edit to an existing one (append-only, matching this codebase's own
-- established discipline for every other versioned policy/master).
--
-- The one real policy seeded below (3yr=25%, 5yr=50%, 10yr=100% of one
-- month basic salary) is the Founder-supplied, explicitly-authorized
-- direction from this same conversation — not invented. No absence-
-- deduction formula is seeded: "eligible service days" adjustment for
-- unpaid/unauthorized absence is left as a genuinely configurable,
-- currently-unset capability (long_service_benefit_policies.absence_adjustment_rule,
-- nullable) rather than an invented rule, per explicit instruction.

begin;

create table public.long_service_benefit_policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('draft', 'active', 'superseded')),
  -- [{ "yearsOfService": 3, "percentOfBasicSalary": 25 }, ...] — validated
  -- shape enforced at the application layer (longServiceBenefit.ts), not
  -- here; jsonb itself enforces no structure.
  milestones jsonb not null,
  jurisdiction_id uuid references public.employment_jurisdictions (id),
  absence_adjustment_rule text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.long_service_benefit_policies is 'Ordift-controlled long-service benefit policy, NOT statutory gratuity. Versioned/effective-dated — a policy change is a new row, never an edit. absence_adjustment_rule is deliberately nullable: no unpaid/unauthorized-absence deduction formula has been supplied; left as a documented future configuration point, never invented.';

alter table public.long_service_benefit_policies enable row level security;

create policy "long_service_benefit_policies: staff read" on public.long_service_benefit_policies
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.long_service_benefit_policies to authenticated;
grant select, insert, update on public.long_service_benefit_policies to service_role;

create table public.long_service_benefit_calculations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  policy_id uuid not null references public.long_service_benefit_policies (id),
  milestone_years int not null check (milestone_years > 0),
  percent_of_basic_salary numeric(5, 2) not null check (percent_of_basic_salary > 0),
  eligible_basic_salary numeric(12, 2) not null check (eligible_basic_salary >= 0),
  currency text not null,
  calculated_amount numeric(12, 2) not null check (calculated_amount >= 0),
  service_start_date date not null,
  calculation_date date not null,
  status text not null default 'calculated' check (status in ('calculated', 'approved', 'paid', 'rejected')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (profile_id, policy_id, milestone_years)
);

comment on table public.long_service_benefit_calculations is 'One calculated milestone benefit per (profile, policy, milestone) — the unique constraint prevents recalculating/double-counting the same milestone. status starts "calculated" (evidence only); "approved" requires a real Super Admin action; "paid" is recorded only after a genuine Payables payment exists, never automatically. This table never itself moves money.';

alter table public.long_service_benefit_calculations enable row level security;

create policy "long_service_benefit_calculations: own or staff read" on public.long_service_benefit_calculations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_staff_or_admin()));

grant select on public.long_service_benefit_calculations to authenticated;
grant select, insert, update on public.long_service_benefit_calculations to service_role;

-- The one real, Founder-supplied policy this session authorized.
insert into public.long_service_benefit_policies (name, effective_from, status, milestones, notes, created_by)
values (
  'Ordift Studios Long-Service Benefit (2026)',
  '2026-09-16',
  'active',
  '[{"yearsOfService": 3, "percentOfBasicSalary": 25}, {"yearsOfService": 5, "percentOfBasicSalary": 50}, {"yearsOfService": 10, "percentOfBasicSalary": 100}]'::jsonb,
  'Ordift-controlled benefit, not statutory gratuity. Percentage is of one month basic salary at the applicable milestone. Founder-authorized direction, 2026-09-16.',
  '966bf3f7-16fe-4f35-9b71-bc0408b3975c'
);

commit;
