-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 18 (2026-09-14) —
-- EMPLOYMENT RECORDS AND REFERENCES (Ghana), OS-HR-GH-006 section 7 —
-- the final section of the originally-authorized 74-section scope.
--
-- INSPECTION SUMMARY: 7.1 ("The Employee Record, signed agreements,
-- schedule versions, policy acknowledgements, salary history, leave/
-- attendance history, approvals, disciplinary/performance records and
-- offboarding/final settlement records retain version/effective-date/
-- audit history") names no new table — it is already satisfied by the
-- append-only/effective-dated architecture built across this entire
-- engagement (employment_terms_history, leave_requests,
-- attendance_records, disciplinary_actions, performance_reviews,
-- separations/final_settlements, agreement_versions, and every other
-- table built in migrations 0084-0102), each independently designed
-- with exactly this preservation property. This migration adds only
-- what 7.2/7.3/7.4 genuinely require: the reference-issuance/audit
-- workflow itself.
--
-- 7.3: "Medical history, grievances, protected complaints, family
-- circumstances and unrelated disciplinary information must not be
-- casually disclosed in references." This is enforced structurally by
-- omission, not by a filter: nothing in this migration or its
-- accompanying code (src/lib/organization/employmentReferences.ts)
-- reads from grievances, safeguarding_concern_reports,
-- disciplinary_actions, security_incident_reports, or any medical/
-- health data — issueStandardEmploymentVerification() only ever
-- assembles identity/role/entity/dates fields, and
-- issueDetailedCorporateReference() only ever persists exactly the
-- content a human author explicitly writes, never an automated pull
-- from any sensitive table.
--
-- "Personal recommendations are distinct from official Ordift
-- corporate references" (7.3): this table models only official
-- corporate references — a personal recommendation is, by definition,
-- not an Ordift corporate action and has no representation here at
-- all, by design.

begin;

create table public.reference_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  requester_name text not null,
  requester_organization text,
  requester_contact text,
  employee_or_former_employee text not null,
  reference_type text not null,
  identity_authority_verified boolean not null default false,
  identity_verified_by uuid references public.profiles (id),
  identity_verified_at timestamptz,
  information_authorized_for_release text,
  status text not null default 'requested',
  issued_by uuid references public.profiles (id),
  issued_at timestamptz,
  issued_reference_content text,
  issued_reference_hash text,
  decision_notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reference_requests_employee_status_check check (employee_or_former_employee in ('employee', 'former_employee')),
  constraint reference_requests_type_check check (reference_type in ('standard_verification', 'detailed_corporate_reference')),
  constraint reference_requests_status_check check (status in ('requested', 'issued', 'declined'))
);

comment on table public.reference_requests is
  'The real OS-HR-GH-006 7.4 audit sequence as columns: Reference Request (the row itself) -> Identity/Authority Verification (identity_authority_verified/identity_verified_by/identity_verified_at) -> Employee/Former Employee (employee_or_former_employee) -> Information Authorized for Release (information_authorized_for_release) -> Issued By (issued_by) -> Date (issued_at) -> Copy/Hash of Issued Reference (issued_reference_content/issued_reference_hash). issueStandardEmploymentVerification() (src/lib/organization/employmentReferences.ts) requires identity_authority_verified=true before issuance is possible — a real precondition, not documentation. reference_type=standard_verification releases only "appropriate identity, role/title, employing entity and dates" (7.2), assembled automatically from existing records (profiles, employment_terms_history, staff_onboarding, separations) — never free text the issuer could expand beyond those fields. reference_type=detailed_corporate_reference requires information_authorized_for_release to be explicitly, non-emptily scoped (7.2: "require authorized issuance and appropriate scope") and its content is always human-authored, never auto-assembled.';

create index reference_requests_profile_idx on public.reference_requests (profile_id);

alter table public.reference_requests enable row level security;

create policy "reference_requests: read own or admin" on public.reference_requests
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.reference_requests to authenticated;
grant select, insert, update on public.reference_requests to service_role;

create trigger reference_requests_set_updated_at
  before update on public.reference_requests
  for each row execute function public.set_updated_at();

commit;
