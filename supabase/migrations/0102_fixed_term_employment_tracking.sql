-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 17 (2026-09-14) —
-- FIXED-TERM EMPLOYMENT TRACKING (Ghana), OS-HR-GH-003 9.1.
--
-- 9.2 (resignation withdrawal) is a separate concern and out of scope
-- for this step.
--
-- "Service history is preserved across versions" (9.1): each contract
-- term is its own row, linked to the term it renews via
-- renewed_from_id — never an UPDATE-in-place that would lose the prior
-- term's own start/end dates and decided outcome. "Repeated renewals
-- must not be used to evade rights" (9.1): no numeric renewal cap is
-- invented (Ghana mandatory-law territory this package does not
-- supply a figure for) — instead, the full renewal chain is always
-- reconstructable (getFixedTermServiceHistory(), src/lib/organization/
-- fixedTermEmployment.ts), so anyone assessing whether renewals are
-- being used to evade rights has the complete history to examine.

begin;

create table public.fixed_term_employment_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  start_date date not null,
  end_date date not null,
  renewed_from_id uuid references public.fixed_term_employment_records (id),
  outcome text,
  outcome_decided_by uuid references public.profiles (id),
  outcome_decided_at timestamptz,
  outcome_notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_term_employment_records_dates_check check (end_date > start_date),
  constraint fixed_term_employment_records_outcome_check check (
    outcome is null or outcome in ('renewal', 'conversion_to_indefinite', 'expiry', 'other_lawful_outcome')
  )
);

comment on table public.fixed_term_employment_records is
  'One row per fixed-term contract period. outcome is constrained to OS-HR-GH-003 9.1''s exact real four named outcomes ("Renewal, conversion to indefinite employment, expiry or another lawful outcome must be deliberately selected") — null until a human decides it via decideFixedTermOutcome(), never defaulted or inferred from the end date passing. renewed_from_id links a renewal to the exact prior term it continues from; createFixedTermEmploymentRecord() (fixedTermEmployment.ts) only permits this when the prior record''s own outcome is already exactly ''renewal'' — a renewal record can never be created before the renewal decision that authorizes it exists. status: active | concluded (set to concluded only once outcome is decided).';

create index fixed_term_employment_records_profile_idx on public.fixed_term_employment_records (profile_id);
create unique index fixed_term_employment_records_renewed_from_unique_idx on public.fixed_term_employment_records (renewed_from_id) where renewed_from_id is not null;

comment on index public.fixed_term_employment_records_renewed_from_unique_idx is
  'Each prior term can be renewed into at most one next term — prevents a branching/duplicate renewal chain, keeping "service history preserved across versions" a single linear, walkable chain.';

alter table public.fixed_term_employment_records enable row level security;

create policy "fixed_term_employment_records: read own or admin" on public.fixed_term_employment_records
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.fixed_term_employment_records to authenticated;
grant select, insert, update on public.fixed_term_employment_records to service_role;

create trigger fixed_term_employment_records_set_updated_at
  before update on public.fixed_term_employment_records
  for each row execute function public.set_updated_at();

commit;
