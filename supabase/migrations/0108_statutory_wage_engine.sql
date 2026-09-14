-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 4 (2026-09-15) —
-- JURISDICTION-AWARE STATUTORY WAGE ENGINE.
--
-- No prior statutory-wage architecture exists anywhere in this
-- codebase (confirmed by search) — this is a genuinely new table.
-- Preserves each jurisdiction's NATIVE legal basis (HOURLY | DAILY |
-- WEEKLY | MONTHLY | OTHER | REVIEW_REQUIRED) rather than forcing every
-- jurisdiction into one shape — Ghana's 2026 floor is a DAILY rate;
-- another jurisdiction's may be MONTHLY, and this schema must not
-- assume otherwise. monthly_conversion_factor is nullable and left
-- NULL by default: it exists only for a FUTURE jurisdiction-approved
-- methodology to convert a sub-monthly rate to a monthly-equivalent
-- floor, and is never populated by inventing an assumption (see
-- statutoryWageEngine.ts's own comparison logic, which resolves to
-- REVIEW_REQUIRED rather than guessing when this is null and a
-- comparison would require it).

begin;

create table public.statutory_wage_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  jurisdiction_id uuid not null references public.employment_jurisdictions (id),
  employing_entity_id uuid references public.employing_entities (id),
  rate_basis text not null,
  rate_amount numeric,
  currency text not null,
  monthly_conversion_factor numeric,
  worker_category text,
  source_authority text,
  source_reference text,
  effective_from date not null,
  effective_to date,
  last_verified_date date,
  verification_status text not null default 'unverified',
  superseded_by uuid references public.statutory_wage_rules (id),
  notes text,
  legal_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

alter table public.statutory_wage_rules
  add constraint statutory_wage_rules_rate_basis_check
    check (rate_basis in ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'OTHER', 'REVIEW_REQUIRED')),
  add constraint statutory_wage_rules_verification_status_check
    check (verification_status in ('unverified', 'pending_review', 'verified'));

comment on table public.statutory_wage_rules is 'Jurisdiction-specific statutory wage floors, each preserving its own native legal rate basis rather than being normalized into one universal shape. employing_entity_id is nullable — a rule with it null applies to every entity in that jurisdiction; one entity may need its own row only where genuinely legally distinct. superseded_by chains a rule to the newer version that replaced it (both rows are kept — never deleted/rewritten, matching this codebase''s "never rewrite historical migrations/records" principle applied to statutory data). legal_review_required marks a rule whose applicability or interpretation itself needs legal sign-off, independent of any one employee''s compliance state.';
comment on column public.statutory_wage_rules.rate_amount is 'Nullable — a rate_basis of OTHER or REVIEW_REQUIRED may have no single numeric amount at all (e.g. a category-dependent scale not yet modeled).';
comment on column public.statutory_wage_rules.monthly_conversion_factor is 'Nullable, and left null by default. Only ever set when a genuine, approved jurisdiction-specific methodology for converting this rate to a monthly-equivalent exists — never an invented assumption (e.g. an assumed "working days per month"). While null, comparing an employee''s monthly salary against a non-MONTHLY rate resolves to REVIEW_REQUIRED, not a guessed calculation.';
comment on column public.statutory_wage_rules.worker_category is 'Nullable — the applicable worker/category this rate governs (e.g. a jurisdiction with different floors for different categories of work). Null means the rate applies generally, matching Ghana''s current single National Daily Minimum Wage (no category differentiation).';

alter table public.statutory_wage_rules enable row level security;

create policy "statutory_wage_rules: staff read" on public.statutory_wage_rules
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.statutory_wage_rules to authenticated;
grant select, insert, update on public.statutory_wage_rules to service_role;

create index statutory_wage_rules_jurisdiction_idx on public.statutory_wage_rules (jurisdiction_id, effective_from desc);

-- Seed: Ghana's real, currently-effective 2026 National Daily Minimum
-- Wage, exactly as the Founder supplied it — GH₵21.77 per day, effective
-- 2026-01-01. source_authority/source_reference are left NULL: the
-- Founder named the figure and its effective date, not a specific
-- issuing body or citation, and neither is invented here.
insert into public.statutory_wage_rules (
  jurisdiction_id, rate_basis, rate_amount, currency, effective_from,
  verification_status, last_verified_date, notes
)
select
  (select id from public.employment_jurisdictions where slug = 'ghana'),
  'DAILY',
  21.77,
  'GHS',
  '2026-01-01',
  'verified',
  '2026-09-15',
  'Ghana National Daily Minimum Wage, as supplied directly by the Founder. This is a statutory FLOOR only — it is never itself presented as any individual employee''s agreed salary.'
where not exists (
  select 1 from public.statutory_wage_rules where jurisdiction_id = (select id from public.employment_jurisdictions where slug = 'ghana') and rate_basis = 'DAILY' and effective_from = '2026-01-01'
);

commit;
