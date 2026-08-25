-- Ordift Organizational & Administrative Architecture V1, Phase 3.3
-- (2026-08-25): Corporate identity, cross-department workflow,
-- recruitment requisitions, staff onboarding, payee/payment
-- instructions, compensation bands, and payment obligations.
--
-- INSPECTION SUMMARY (full detail in the Phase 3.3 report) — every
-- table below was checked against existing architecture first:
--   - project_requests/request_types (0008): narrowly built for
--     client-submitted booking changes — entity_type is DB-CHECK-
--     constrained to ('enquiry','workshop_registration') and RLS
--     ownership is hardcoded against those two specific tables. Not
--     safely extensible to an internal cross-department request
--     without breaking changes. NOT reused/duplicated — a genuinely
--     different concept (client<->staff vs internal department<->
--     department) gets its own table below.
--   - workflow_statuses/workflow_assignments (0023) + the
--     WorkflowCapability engine: the DB tables are polymorphic and
--     reusable in principle, but engine.ts's TRANSITIONS map and the
--     WorkflowStatus/WorkflowEntityType TS unions are a single fixed
--     linear chain hardcoded to Portfolio's publish lifecycle. Not
--     touched by this migration or any Phase 3.3 code — a mature,
--     actively-used system left completely alone, per explicit
--     instruction not to rewrite it for stylistic consistency.
--   - recruitment_applications (0036): zero requisition concept, zero
--     link to departments/positions, zero interview/panel/evaluator
--     entity — only a single "interview" status label. Extended
--     additively (one nullable FK) rather than duplicated.
--   - vendor_profiles/model_profiles (0001): explicitly still
--     "scaffolded" per their own migration comments, zero payment/bank
--     columns. Not touched — payee identity below references profiles
--     directly, applicable to any classification, not just vendor/model.
--   - bank_accounts (0024): the business's OWN receiving accounts for
--     inbound client bank-transfer collection — a fundamentally
--     different concept from a person's outbound payout instructions.
--     Not reused/renamed/repurposed.
--   - Paystack integration: confirmed inbound-collection-only
--     (initialize/verify/refund) — zero transfer/recipient API calls,
--     live or dead. Nothing here assumes or fabricates payout capability.
--
-- Every table is purely additive. No existing table's columns, RLS
-- policies, or CHECK constraints are altered. No amounts/salaries are
-- seeded (grade_compensation_bands ships with zero rows). No real
-- external mailbox or payout is created by this migration.

begin;

-- ============================================================
-- PART B/C — Corporate digital identity (email)
-- ============================================================
-- Pure-logic generation already exists in
-- src/lib/organization/corporateEmail.ts (Phase 3.3, written earlier
-- this phase) — this is that module's persistence layer. `email` is a
-- generated column so it's always derived from local_part/domain, never
-- independently editable/driftable.
--
-- Distinguishes "reserved internally" from "external mailbox actually
-- provisioned" exactly as instructed: `provider`/`external_mailbox_id`
-- stay null until a real external provisioning integration exists and
-- actually succeeds — nothing in this phase claims or fabricates that.
create table public.corporate_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  local_part text not null,
  domain text not null default 'ordiftstudios.com',
  email text generated always as (local_part || '@' || domain) stored,
  -- Verified onboarding name data the local_part was generated from —
  -- preserved for audit/regeneration traceability, never used to
  -- re-derive Position/Grade/Department/Call Sign/authority (Part B:
  -- "must NOT depend on" those).
  legal_first_name text not null,
  legal_middle_names text,
  legal_surname text not null,
  additional_verified_names_used text,
  status text not null default 'reserved',
  provider text,
  external_mailbox_id text,
  reserved_at timestamptz not null default now(),
  reserved_by uuid references public.profiles (id),
  provisioning_requested_at timestamptz,
  provisioned_at timestamptz,
  deactivated_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (business_id, domain, local_part)
);

comment on table public.corporate_identities is
  'Corporate staff email identity — reservation and lifecycle only. NEVER reused after deactivation (unique constraint + append-only, no delete policy for anyone). Generation logic lives in src/lib/organization/corporateEmail.ts; this table is the persisted reservation record. status values: reserved, pending_provisioning, active, suspended, deactivated, provisioning_failed (unconstrained text, same precedent as activity_log.action and workflow_statuses.status).';
comment on column public.corporate_identities.provider is
  'Null until a real external mailbox provider integration exists and is actually used — see Phase 3.3 report for the current inspection result (none exists yet).';

alter table public.corporate_identities enable row level security;

create policy "corporate_identities: read admin tier" on public.corporate_identities
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.corporate_identities to authenticated;
grant select, insert, update, delete on public.corporate_identities to service_role;

-- ============================================================
-- PART D — Generic cross-department request/workflow
-- ============================================================
-- Deliberately new, not an extension of project_requests (client<->
-- staff, DB-constrained to two entity types) or workflow_statuses
-- (single-entity content-publish lifecycle) — see the header note
-- above. request_type/status are unconstrained text (same precedent as
-- activity_log.action), extensible without a migration for future
-- request kinds. requesting/servicing party is expressed as EITHER a
-- Department OR an executive jurisdiction (or both null for a party
-- that's neither) — reflecting that Ordift's real org model has two
-- independent axes (Departments vs GR.9 jurisdictions; People/HR
-- jurisdiction, for example, has no corresponding Department row) —
-- forcing every request into a single department_id FK would
-- misrepresent that structure.
--
-- Cross-department workflow participation never touches
-- reports_to_position_id, staff_details, or grade_id — nothing here
-- can alter reporting lines or Grade, by construction (no FK to those
-- write paths exists).
create table public.department_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  reference_number text,
  request_type text not null,
  title text not null,
  description text,
  requesting_department_id uuid references public.departments (id),
  requesting_jurisdiction text,
  servicing_department_id uuid references public.departments (id),
  servicing_jurisdiction text,
  requested_by uuid not null references public.profiles (id),
  assigned_to uuid references public.profiles (id),
  status text not null default 'submitted',
  priority text,
  payload jsonb not null default '{}',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision text,
  decision_notes text,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.department_requests is
  'Generic REQUESTING -> SERVICING -> REVIEW -> APPROVAL -> EXECUTION -> COMPLETION workflow foundation (Phase 3.3, Part D). A department/jurisdiction requesting work from another does NOT become superior to it — this table has no reporting-line or Grade effect whatsoever. request_type/status are unconstrained text, extensible without a migration (e.g. request_type = ''recruitment_requisition'', ''identity_provisioning'', ''contractor_payout_review'', ''vendor_contract_review'').';
comment on column public.department_requests.requesting_jurisdiction is
  'One of the authority_grants jurisdiction values (operations/finance/strategy/people/technology/governance) when the requesting party is a GR.9 executive function rather than one of the four Departments — e.g. People/HR has no Department row.';

create index department_requests_status_idx on public.department_requests (status);
create index department_requests_servicing_department_idx on public.department_requests (servicing_department_id);

alter table public.department_requests enable row level security;

create policy "department_requests: staff read" on public.department_requests
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.department_requests to authenticated;
grant select, insert, update, delete on public.department_requests to service_role;

create trigger department_requests_set_updated_at
  before update on public.department_requests
  for each row execute function public.set_updated_at();

-- Plural comments/notes, as explicitly required — a request's single
-- decision_notes field isn't enough for a running discussion thread.
create table public.department_request_comments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  request_id uuid not null references public.department_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  comment text not null,
  created_at timestamptz not null default now()
);

alter table public.department_request_comments enable row level security;

create policy "department_request_comments: staff read" on public.department_request_comments
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.department_request_comments to authenticated;
grant select, insert, update, delete on public.department_request_comments to service_role;

-- ============================================================
-- PART E — Recruitment requisition + interview panel
-- ============================================================
-- Links into department_requests (a requisition IS a department
-- request with request_type='recruitment_requisition') for its
-- generic review/approval lifecycle, and holds requisition-specific
-- structured fields separately rather than in payload jsonb, matching
-- this codebase's general preference for typed columns.
create table public.recruitment_requisitions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  request_id uuid not null references public.department_requests (id) on delete cascade,
  requested_position_id uuid references public.positions (id),
  department_id uuid references public.departments (id),
  grade_id uuid references public.grades (id),
  headcount int not null default 1 check (headcount > 0),
  engagement_type_id uuid references public.engagement_types (id),
  required_skills text,
  responsibilities text,
  justification text,
  proposed_compensation_band_id uuid,
  preferred_start_date date,
  hiring_manager_id uuid references public.profiles (id),
  interview_requirements text,
  created_at timestamptz not null default now()
);

comment on table public.recruitment_requisitions is
  'A department''s request to hire — separate from recruitment_applications (inbound candidate applications). One requisition can receive many applications. proposed_compensation_band_id references grade_compensation_bands (FK added after that table exists, below) — a proposal only, never itself an approved salary.';

alter table public.recruitment_requisitions enable row level security;

create policy "recruitment_requisitions: staff read" on public.recruitment_requisitions
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.recruitment_requisitions to authenticated;
grant select, insert, update, delete on public.recruitment_requisitions to service_role;

-- Additive link — existing recruitment_applications rows are
-- untouched (this starts null on every one); an application MAY
-- optionally be tied to the requisition it's answering.
alter table public.recruitment_applications
  add column if not exists requisition_id uuid references public.recruitment_requisitions (id);

comment on column public.recruitment_applications.requisition_id is
  'Optional link to the department requisition this application is answering (Phase 3.3, Part E). Null for a general/unsolicited application, exactly as every existing row already is.';

-- Interview panel — supports multiple interviewers/evaluators per the
-- explicit separation-of-duties requirement (Recruitment assesses
-- eligibility/behavioural fit; the requesting department assesses
-- technical competence). evaluator_role is unconstrained text
-- ('recruitment' | 'department' | 'executive' | ...) so a panel can
-- include any mix without a schema change.
create table public.recruitment_interview_panels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  application_id uuid not null references public.recruitment_applications (id) on delete cascade,
  scheduled_at timestamptz,
  format text,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

alter table public.recruitment_interview_panels enable row level security;

create policy "recruitment_interview_panels: admin read" on public.recruitment_interview_panels
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.recruitment_interview_panels to authenticated;
grant select, insert, update, delete on public.recruitment_interview_panels to service_role;

create table public.recruitment_interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  panel_id uuid not null references public.recruitment_interview_panels (id) on delete cascade,
  evaluator_id uuid not null references public.profiles (id),
  evaluator_role text not null,
  assessment_notes text,
  recommendation text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (panel_id, evaluator_id)
);

comment on table public.recruitment_interview_evaluations is
  'One evaluation row per panel member. evaluator_role (e.g. recruitment/department/executive) is how the UI/app layer enforces separation of duties — Recruitment''s own evaluation covers eligibility/behavioural fit, the requesting department''s covers technical competence. Not a schema-level constraint, matching the app-layer-enforced pattern already used throughout the Admin Platform.';

alter table public.recruitment_interview_evaluations enable row level security;

create policy "recruitment_interview_evaluations: admin read" on public.recruitment_interview_evaluations
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.recruitment_interview_evaluations to authenticated;
grant select, insert, update, delete on public.recruitment_interview_evaluations to service_role;

-- ============================================================
-- PART F — Staff onboarding (process tracker, not a data duplicate)
-- ============================================================
-- Deliberately thin: Position/Grade/Department/reporting resolution
-- already happens via assignStaffPosition() (Phase 2/3.1), and the
-- staff/member number is issued through the existing, untouched Phase
-- 2.1 sequential numbering architecture (assignClassification()) —
-- this table only tracks WHICH onboarding steps are done for a real
-- profile, never a second copy of the underlying data.
create table public.staff_onboarding (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  recruitment_application_id uuid references public.recruitment_applications (id),
  corporate_identity_id uuid references public.corporate_identities (id),
  start_date date,
  status text not null default 'in_progress',
  documents_received jsonb not null default '{}',
  tasks_completed jsonb not null default '{}',
  policies_accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (profile_id)
);

comment on table public.staff_onboarding is
  'Onboarding PROCESS state for one profile — Position/Grade/Department/reporting-line/staff-number are resolved and stored exactly where Phase 2/2.1/3 already put them (staff_details, member_numbers), never duplicated here. documents_received/tasks_completed are lightweight checklist tracking (jsonb), not file storage.';

alter table public.staff_onboarding enable row level security;

create policy "staff_onboarding: read own or admin" on public.staff_onboarding
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.staff_onboarding to authenticated;
grant select, insert, update, delete on public.staff_onboarding to service_role;

-- ============================================================
-- PART G — Payee / payment-instruction (highly sensitive)
-- ============================================================
-- Distinct from public.bank_accounts (0024) — that table is the
-- BUSINESS's own receiving accounts for inbound client bank-transfer
-- collection; this is a real PERSON's outbound payout instructions.
-- Never confused/merged. No secret/routing value is ever written to
-- activity_log — see the app-layer code (Part O of the report) for the
-- explicit redaction discipline.
create table public.payment_instructions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  method text not null,
  country text not null,
  currency text not null,
  account_holder_name text not null,
  institution_name text,
  account_identifier text,
  routing_identifier text,
  verification_status text not null default 'unverified',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.payment_instructions is
  'A person''s (staff or non-staff — freelancer/contractor/vendor/instructor/model) outbound payout instructions. HIGHLY SENSITIVE — account_identifier/routing_identifier must never be displayed unmasked on any broad admin list screen, and never written to activity_log. Read access is deliberately narrow: the payee''s own row, or Super Admin — not the general admin/staff tier.';

alter table public.payment_instructions enable row level security;

create policy "payment_instructions: read own or super admin" on public.payment_instructions
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_super_admin()));

grant select on public.payment_instructions to authenticated;
grant select, insert, update, delete on public.payment_instructions to service_role;

create trigger payment_instructions_set_updated_at
  before update on public.payment_instructions
  for each row execute function public.set_updated_at();

-- ============================================================
-- PART H — Compensation bands (Grade-level structural guidance only)
-- ============================================================
-- Zero rows seeded — no monetary amount is populated by this
-- migration, per explicit instruction. Every amount column is
-- nullable. Deliberately separate from payment_obligations (Part I):
-- this table is COMPENSATION TERMS/guidance, never itself an
-- authorization to pay anything.
create table public.grade_compensation_bands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  grade_id uuid not null references public.grades (id),
  engagement_type_id uuid references public.engagement_types (id),
  location text,
  currency text not null,
  minimum_amount numeric(14,2),
  midpoint_amount numeric(14,2),
  maximum_amount numeric(14,2),
  effective_date date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.grade_compensation_bands is
  'Structural compensation banding by Grade — guidance only, never an assumption that everyone at a Grade earns the same amount. Zero rows seeded by this migration (Phase 3.3, Part H) — no fictional salary data. VAULT/Finance jurisdiction is the intended eventual write-owner; PULSE/People the intended eventual read-visibility grantee; neither is wired to any real capability yet since no one occupies either Position.';

alter table public.grade_compensation_bands enable row level security;

create policy "grade_compensation_bands: super admin only" on public.grade_compensation_bands
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.grade_compensation_bands to authenticated;
grant select, insert, update, delete on public.grade_compensation_bands to service_role;

alter table public.recruitment_requisitions
  add constraint recruitment_requisitions_compensation_band_fk
  foreign key (proposed_compensation_band_id) references public.grade_compensation_bands (id);

-- ============================================================
-- PART I — Payment obligations / payout architecture
-- ============================================================
-- Provider-agnostic by construction: payout_provider/payout_reference
-- stay null until a real outbound-transfer integration exists — none
-- does today (confirmed: Paystack integration is inbound-collection-
-- only, see the report). No money moves as a result of this migration
-- or any Phase 3.3 code; creating a row here is never itself an
-- authorization to pay (status starts 'pending_approval').
-- Deliberately independent of the INBOUND public.payments table
-- (0024) — never joined, never shares a status vocabulary — to keep
-- inbound collection and outbound payout structurally separate.
create table public.payment_obligations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  payee_profile_id uuid not null references public.profiles (id),
  payment_instruction_id uuid references public.payment_instructions (id),
  source_type text not null,
  source_reference text,
  description text not null,
  currency text not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending_approval',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  payout_provider text,
  payout_reference text,
  payout_initiated_at timestamptz,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.payment_obligations is
  'An amount Ordift owes a payee (staff/freelancer/contractor/vendor/instructor/model/etc.) — the internal record of the obligation, never itself a money movement. status: pending_approval -> approved -> payout_initiated -> paid | failed | reversed | cancelled (unconstrained text). payout_provider/payout_reference are null until a real outbound-transfer provider integration exists and is actually used — see the Phase 3.3 report''s Paystack inspection.';

create index payment_obligations_status_idx on public.payment_obligations (status);
create index payment_obligations_payee_idx on public.payment_obligations (payee_profile_id);

alter table public.payment_obligations enable row level security;

create policy "payment_obligations: read own or super admin" on public.payment_obligations
  for select
  to authenticated
  using ((select auth.uid()) = payee_profile_id or (select private.is_super_admin()));

grant select on public.payment_obligations to authenticated;
grant select, insert, update, delete on public.payment_obligations to service_role;

create trigger payment_obligations_set_updated_at
  before update on public.payment_obligations
  for each row execute function public.set_updated_at();

commit;
