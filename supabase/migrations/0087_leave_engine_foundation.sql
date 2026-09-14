-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 2 (2026-09-14) —
-- LEAVE ENGINE FOUNDATION (Ghana).
--
-- Three additive tables. leave_types is a controlled CATALOG — every
-- entitlement figure below is transcribed verbatim from OS-HR-GH-002
-- (Employment, Working Time, Attendance & Leave Policy), never invented
-- or estimated; source_document_reference cites the exact section for
-- every row. Where the policy gives a duration in weeks rather than a
-- day count (maternity), or leaves a cap deliberately open (unpaid,
-- civic duty), annual_entitlement_days is correctly left null rather
-- than converting/guessing a number the policy itself never states in
-- days. Nursing/breastfeeding accommodation, medical-appointment time,
-- and family/dependent-emergency handling are deliberately NOT leave
-- types here — OS-HR-GH-002 itself treats them as accommodations/
-- attendance exceptions, not banked leave with an entitlement (Sections
-- 5.4, 7.3, 8.2) — building those is separate, later work.
--
-- leave_balances tracks entitlement/accrual/carry-over/usage per
-- (profile, leave_type, leave_year) — effective by year, never
-- overwriting a prior year's record. leave_requests is the approval
-- workflow (Submitted -> Under Review -> Approved / Alternative Dates
-- Proposed / Declined, per OS-HR-GH-002 Section 4.3) — a genuinely
-- mutable record (its own status progresses), unlike this session's
-- append-only audit tables, matching the existing department_requests/
-- recruitment_requisitions precedent for this class of workflow.
--
-- "Only Approved leave reserves/deducts entitlement" (OS-HR-GH-002
-- 4.3) is enforced in application code (decideLeaveRequest(),
-- src/lib/organization/leaveRequests.ts) via an atomic increment of
-- leave_balances.used_days — never a naive read-then-write.

begin;

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text not null,
  name text not null,
  jurisdiction text not null,
  paid boolean not null default true,
  requires_certificate boolean not null default false,
  annual_entitlement_days numeric,
  per_leave_year_cap_days numeric,
  tier_structure jsonb,
  entitlement_description text not null,
  source_document_reference text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, slug, jurisdiction)
);

comment on table public.leave_types is
  'Controlled leave-type catalog. jurisdiction: WorkforceJurisdiction-shaped text (src/lib/compliance/requirementClassification.ts), app-validated. annual_entitlement_days/per_leave_year_cap_days are null where the source policy does not state a fixed day count (e.g. maternity is stated in weeks; unpaid/civic-duty are deliberately open-ended) — entitlement_description always carries the real approved wording for that case. tier_structure (jsonb) is populated only for sick leave, encoding OS-HR-GH-002 5.1''s real progressive tiers verbatim. source_document_reference cites the exact approved section for every row — never invented.';

alter table public.leave_types enable row level security;

create policy "leave_types: read own or admin" on public.leave_types
  for select
  to authenticated
  using (true); -- catalog data, not personal — readable by any authenticated user, matching engagement_types/employing_entities precedent

grant select on public.leave_types to authenticated;
grant select, insert, update on public.leave_types to service_role;

insert into public.leave_types (business_id, slug, name, jurisdiction, paid, requires_certificate, annual_entitlement_days, per_leave_year_cap_days, tier_structure, entitlement_description, source_document_reference)
select public.ordift_studios_business_id(), v.slug, v.name, 'GH', v.paid, v.requires_certificate, v.annual_entitlement_days, v.per_leave_year_cap_days, v.tier_structure::jsonb, v.entitlement_description, v.source_document_reference
from (values
  ('annual', 'Annual Leave', true, false, 20, null, null,
    '20 paid working days per leave year for eligible full-time employees, subject to proration for eligible service and never below mandatory statutory rights.',
    'OS-HR-GH-002 Section 4.1'),
  ('sick', 'Sick / Medical Leave', true, false, null, null,
    '[{"tier":1,"maxDays":2,"payPercent":100,"certificateRequired":false},{"tier":2,"maxDays":10,"payPercent":100,"certificateRequired":true},{"tier":3,"maxDays":10,"payPercent":50,"certificateRequired":true},{"tier":4,"maxDays":20,"payPercent":0,"certificateRequired":true}]',
    'Up to 2 paid working days per year without a medical certificate (prompt notification required); then 10 certified working days at 100% pay; then 10 certified working days at 50% pay; then 20 certified working days unpaid. Exceptional management-approved extension possible for serious illness/hospitalization/accident/prolonged recovery.',
    'OS-HR-GH-002 Section 5.1'),
  ('maternity', 'Maternity Leave', true, false, null, null, null,
    'At least 12 weeks fully paid plus all mandatory Ghana extensions/protections. Not capped in days by this policy — stronger statutory rights always prevail.',
    'OS-HR-GH-002 Section 6'),
  ('paternity', 'Paternity Leave', true, false, 10, null, null,
    '10 paid working days.',
    'OS-HR-GH-002 Section 6'),
  ('adoption', 'Adoption Leave', true, false, 10, null, null,
    '10 paid working days.',
    'OS-HR-GH-002 Section 6'),
  ('compassionate_bereavement', 'Compassionate / Bereavement Leave', true, false, 5, null, null,
    '5 paid working days for spouse, child/adopted child, parent, legal guardian, sibling, grandparent, parent-in-law or person genuinely standing in a parental role; up to 5 additional working days may be considered through management review.',
    'OS-HR-GH-002 Section 6'),
  ('marriage', 'Marriage Leave', true, false, 5, null, null,
    '5 paid working days for the employee''s legally recognized marriage.',
    'OS-HR-GH-002 Section 6'),
  ('emergency_personal', 'Emergency / Personal Leave', true, false, null, 3, null,
    '3 paid working days per leave year for genuine unforeseen personal/family emergencies.',
    'OS-HR-GH-002 Section 6'),
  ('study_exam', 'Study / Exam Leave', true, false, null, 5, null,
    'Up to 5 paid working days per leave year for Ordift-approved education/professional development, with reasonable evidence.',
    'OS-HR-GH-002 Section 6'),
  ('pregnancy_loss_employee', 'Pregnancy Loss Leave (Employee)', true, true, 10, null, null,
    '10 paid working days for the employee experiencing medically confirmed miscarriage/stillbirth/pregnancy loss, subject to stronger statutory/medical rights.',
    'OS-HR-GH-002 Section 6'),
  ('pregnancy_loss_partner', 'Pregnancy Loss Leave (Spouse/Partner)', true, false, 5, null, null,
    '5 paid working days for spouse/partner of an employee experiencing medically confirmed pregnancy loss.',
    'OS-HR-GH-002 Section 6'),
  ('personal_safety', 'Personal Safety Leave', true, false, null, 5, null,
    'Up to 5 paid working days for qualifying domestic violence, stalking, serious threats or immediate personal-safety circumstances, with highly restricted handling and no requirement that a police report be the sole form of evidence.',
    'OS-HR-GH-002 Section 6'),
  ('unpaid', 'Unpaid Leave', false, false, null, null, null,
    'Discretionary. Up to 10 working days may use normal management approval; longer periods require enhanced/senior approval. No absolute yearly maximum is stated by this policy.',
    'OS-HR-GH-002 Section 7.1'),
  ('civic_duty', 'Civic / Legal Duty Leave', true, false, null, null, null,
    'Reasonable short compulsory court/government/civic obligations receive authorized paid time, separate from annual/emergency leave. No fixed day count is stated by this policy.',
    'OS-HR-GH-002 Section 7.4')
) as v(slug, name, paid, requires_certificate, annual_entitlement_days, per_leave_year_cap_days, tier_structure, entitlement_description, source_document_reference)
where not exists (
  select 1 from public.leave_types lt
  where lt.business_id = public.ordift_studios_business_id() and lt.slug = v.slug and lt.jurisdiction = 'GH'
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  leave_type_id uuid not null references public.leave_types (id),
  leave_year int not null,
  entitlement_days numeric not null default 0,
  carried_over_days numeric not null default 0,
  protected_carried_over_days numeric not null default 0,
  used_days numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, leave_type_id, leave_year)
);

comment on table public.leave_balances is
  'One row per (profile, leave_type, leave_year) — remaining = entitlement_days + carried_over_days + protected_carried_over_days - used_days, computed at read time, never stored redundantly. protected_carried_over_days is kept separate from carried_over_days per OS-HR-GH-002 4.4: employer-caused or statutorily protected unused leave is tracked separately and never absorbed by the ordinary 5-day carry-over cap. used_days increments ONLY when a leave_requests row transitions to approved (application-enforced, atomic increment — see decideLeaveRequest()).';

create index leave_balances_profile_year_idx on public.leave_balances (profile_id, leave_year);

alter table public.leave_balances enable row level security;

create policy "leave_balances: read own or admin" on public.leave_balances
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.leave_balances to authenticated;
grant select, insert, update on public.leave_balances to service_role;

create trigger leave_balances_set_updated_at
  before update on public.leave_balances
  for each row execute function public.set_updated_at();

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  days_requested numeric not null,
  half_allocation text,
  status text not null default 'submitted',
  reason text,
  certificate_reference text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  alternative_start_date date,
  alternative_end_date date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leave_requests is
  'Leave request workflow (OS-HR-GH-002 Section 4.3): status submitted | under_review | approved | alternative_proposed | declined | cancelled (unconstrained text, application-validated, same precedent as agreements.status). half_allocation: H1 | H2 | null — only meaningful for annual-leave planning allocations (OS-HR-GH-002 4.2); it is a planning tag only, never a second expiring entitlement. Only a transition to approved deducts from leave_balances.used_days.';

create index leave_requests_profile_idx on public.leave_requests (profile_id);
create index leave_requests_status_idx on public.leave_requests (status);

alter table public.leave_requests enable row level security;

create policy "leave_requests: read own or admin" on public.leave_requests
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.leave_requests to authenticated;
grant select, insert, update on public.leave_requests to service_role;

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

-- Atomic balance increment (Part 5.2's own requirement: "Only Approved
-- leave reserves/deducts entitlement", enforced via a single UPDATE,
-- never a read-then-write race). Returns the number of rows updated —
-- decideLeaveRequest() (src/lib/organization/leaveRequests.ts) checks
-- this is exactly 1 and reports an error rather than silently
-- succeeding if no matching leave_balances row exists yet (e.g.
-- ensureLeaveBalance() was never called for this profile/type/year).
-- Same security definer / empty search_path / explicit-grant pattern as
-- the existing next_legal_agreement_reference_seq() (migration 0069).
create or replace function public.increment_leave_balance_used_days(
  p_profile_id uuid, p_leave_type_id uuid, p_leave_year int, p_days numeric
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.leave_balances
  set used_days = used_days + p_days, updated_at = now()
  where profile_id = p_profile_id and leave_type_id = p_leave_type_id and leave_year = p_leave_year;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.increment_leave_balance_used_days(uuid, uuid, int, numeric) from public;
revoke all on function public.increment_leave_balance_used_days(uuid, uuid, int, numeric) from anon;
grant execute on function public.increment_leave_balance_used_days(uuid, uuid, int, numeric) to service_role;

commit;
