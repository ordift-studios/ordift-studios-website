-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 7 (2026-09-14) —
-- SEPARATION / OFFBOARDING / FINAL SETTLEMENT FOUNDATION (Ghana),
-- OS-HR-GH-006 sections 1-5. Sections 6 (long-service/death benefits —
-- already built, migration 0091, and remain untouched/separate here per
-- 6.1/6.2) and 7 (employment records/references) are out of scope for
-- this step.
--
-- 1.2: "The system must not close employment without a documented
-- route, reason/process, decision-maker, effective date, notice/PILON
-- treatment, appeal status where applicable, final settlement and
-- offboarding status." This is enforced structurally, not just by
-- convention: closeEmployment() (src/lib/organization/offboarding.ts)
-- is the ONLY path that can ever set offboarding_status='employment_closed',
-- and it refuses unless effective_date is set and a linked
-- final_settlements row is already approved/paid. No other function in
-- this migration's accompanying code can reach that status.
--
-- 3.1: "No invented universal redundancy formula is used" — nothing in
-- this migration computes a redundancy compensation amount; a
-- redundancy separation records route/reason/consultation narrative
-- only, same as every other route.

begin;

create table public.separations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  separation_route text not null,
  reason text not null,
  decision_maker uuid not null references public.profiles (id),
  effective_date date,
  notice_treatment text,
  appeal_id uuid references public.appeals (id),
  offboarding_status text not null default 'offboarding_initiated',
  last_working_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint separations_route_check check (separation_route in (
    'resignation', 'probationary_separation', 'performance_capability_termination',
    'misconduct_dismissal', 'redundancy_role_elimination', 'fixed_term_expiry',
    'retirement', 'death_in_service', 'other_lawful_route'
  ))
);

comment on table public.separations is
  'separation_route is constrained to OS-HR-GH-006 1.1''s named routes plus a generic other_lawful_route catch-all ("and other lawful routes") — 1.1: "They must not be collapsed into one generic termination action." offboarding_status: offboarding_initiated | handover | departmental_clearance | assets_access_reconciled | final_settlement_review | cleared | employment_closed, the exact real 4.1 workflow (unconstrained text, application-validated — see computeNextOffboardingStatus() in offboarding.ts for the enforced sequence). appeal_id links to the existing appeals table (migration 0089) rather than duplicating appeal status here, reusing existing infrastructure. notice_treatment is free text (worked in full / shortened by mutual agreement / payment in lieu / restricted or garden duties per 2.2) — not constrained, since 2.2''s language is descriptive rather than a closed enum.';

create unique index separations_one_active_per_profile_idx on public.separations (profile_id)
  where offboarding_status <> 'employment_closed';

comment on index public.separations_one_active_per_profile_idx is
  'At most one in-flight separation per person at a time — a structural guarantee, not just application convention. A closed (employment_closed) separation does not block a later, genuinely new separation record.';

create index separations_profile_idx on public.separations (profile_id);

alter table public.separations enable row level security;

create policy "separations: read own or admin" on public.separations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.separations to authenticated;
grant select, insert, update on public.separations to service_role;

create trigger separations_set_updated_at
  before update on public.separations
  for each row execute function public.set_updated_at();

create table public.offboarding_handover_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  separation_id uuid not null references public.separations (id),
  profile_id uuid not null references public.profiles (id),
  category text not null,
  description text not null,
  status text not null default 'pending',
  handed_over_to uuid references public.profiles (id),
  handed_over_at timestamptz,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.offboarding_handover_items is
  'category: project | client | deliverable | file | credential | schedule | equipment | expense_advance | other (unconstrained text) — the exact real categories OS-HR-GH-006 4.2 lists ("active projects, clients, deliverables, files, credentials, schedules, equipment, expenses/advances and material business information"). status: pending | handed_over | not_applicable. profile_id is denormalized from the parent separation for simple own-or-admin RLS, same precedent as disciplinary_actions carrying its own profile_id rather than requiring a join through investigations.';

create index offboarding_handover_items_separation_idx on public.offboarding_handover_items (separation_id);

alter table public.offboarding_handover_items enable row level security;

create policy "offboarding_handover_items: read own or admin" on public.offboarding_handover_items
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.offboarding_handover_items to authenticated;
grant select, insert, update on public.offboarding_handover_items to service_role;

create trigger offboarding_handover_items_set_updated_at
  before update on public.offboarding_handover_items
  for each row execute function public.set_updated_at();

create table public.final_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  separation_id uuid not null references public.separations (id),
  profile_id uuid not null references public.profiles (id),
  salary_through_final_working_day numeric not null default 0 check (salary_through_final_working_day >= 0),
  outstanding_earnings_overtime numeric not null default 0 check (outstanding_earnings_overtime >= 0),
  annual_leave_settlement numeric not null default 0 check (annual_leave_settlement >= 0),
  approved_reimbursements numeric not null default 0 check (approved_reimbursements >= 0),
  notice_pilon_amount numeric not null default 0 check (notice_pilon_amount >= 0),
  other_lawful_entitlements numeric not null default 0 check (other_lawful_entitlements >= 0),
  deductions_total numeric not null default 0 check (deductions_total >= 0),
  gross_entitlements numeric generated always as (
    salary_through_final_working_day + outstanding_earnings_overtime + annual_leave_settlement +
    approved_reimbursements + notice_pilon_amount + other_lawful_entitlements
  ) stored,
  net_final_settlement numeric generated always as (
    salary_through_final_working_day + outstanding_earnings_overtime + annual_leave_settlement +
    approved_reimbursements + notice_pilon_amount + other_lawful_entitlements - deductions_total
  ) stored,
  status text not null default 'draft',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint final_settlements_separation_unique unique (separation_id)
);

comment on table public.final_settlements is
  'One row per separation. gross_entitlements/net_final_settlement are database GENERATED columns, computed directly from OS-HR-GH-006 5.1''s real formula ("Salary through final working day + approved outstanding earnings/overtime + eligible annual-leave settlement + approved reimbursements + applicable notice/PILON amounts + other lawful/statutory/company entitlements - lawful authorized deductions = Net Final Settlement") — never independently settable or driftable, a structural guarantee rather than an application-level sum. Each component is its own column (5.2: "Each component is separately identifiable. No generic manager-entered deduction field may directly reduce final pay..."). deductions_total is only ever changed via increment_final_settlement_deductions_total(), which itself only succeeds while status=''draft'' — a settlement''s figures become immutable the moment it leaves draft. status: draft | pending_approval | approved | paid.';

alter table public.final_settlements enable row level security;

create policy "final_settlements: read own or admin" on public.final_settlements
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.final_settlements to authenticated;
grant select, insert, update on public.final_settlements to service_role;

create trigger final_settlements_set_updated_at
  before update on public.final_settlements
  for each row execute function public.set_updated_at();

create table public.final_settlement_deductions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  final_settlement_id uuid not null references public.final_settlements (id),
  profile_id uuid not null references public.profiles (id),
  classification text not null,
  basis text not null,
  amount numeric not null check (amount > 0),
  supporting_record_reference text,
  approved_by uuid not null references public.profiles (id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.final_settlement_deductions is
  'Append-only itemized deduction ledger — OS-HR-GH-006 5.2: "No generic manager-entered deduction field may directly reduce final pay without classification, basis, supporting record and appropriate approval." classification/basis/approved_by are all required (not null) at the database level, not merely convention. supporting_record_reference is free text (e.g. a salary_advances.id) since the supporting record may live in any of several tables — the same polymorphic-by-convention approach already used for source/reference text fields elsewhere, deliberately not a rigid FK to any one table.';

create index final_settlement_deductions_settlement_idx on public.final_settlement_deductions (final_settlement_id);

alter table public.final_settlement_deductions enable row level security;

create policy "final_settlement_deductions: read own or admin" on public.final_settlement_deductions
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.final_settlement_deductions to authenticated;
grant select, insert on public.final_settlement_deductions to service_role;

-- Same security-definer/set-search-path-empty atomic-increment pattern
-- already proven by increment_leave_balance_used_days() (migration
-- 0087). Only succeeds while the settlement is still 'draft' — the
-- actual mechanism that makes an approved settlement's figures
-- immutable, not merely a documented convention.
create or replace function public.increment_final_settlement_deductions_total(
  p_final_settlement_id uuid, p_amount numeric
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.final_settlements
  set deductions_total = deductions_total + p_amount, updated_at = now()
  where id = p_final_settlement_id and status = 'draft';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.increment_final_settlement_deductions_total(uuid, numeric) from public;
revoke all on function public.increment_final_settlement_deductions_total(uuid, numeric) from anon;
grant execute on function public.increment_final_settlement_deductions_total(uuid, numeric) to service_role;

commit;
