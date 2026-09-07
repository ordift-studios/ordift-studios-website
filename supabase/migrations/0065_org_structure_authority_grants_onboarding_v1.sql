-- Ordift Studios — Organizational Structure, Authority Grants, Staff
-- Onboarding & Work Email V1 (2026-09-07).
--
-- INSPECTION SUMMARY — this phase was preceded by an extensive existing
-- "Ordift Organizational & Administrative Architecture V1" build
-- (Phases 1-3.4, migrations 0017/0037-0043/0046). Confirmed already
-- live and NOT rebuilt or duplicated by this migration:
--   - Corporate Grade (public.grades, G1-G10, display-formatted GR.1..
--     GR.10 by src/lib/organization/gradeDisplay.ts) — untouched.
--   - Departments/Positions (public.departments/positions), reporting
--     lines (positions.reports_to_position_id, staff_details.manager_id)
--     — untouched; Part A below only ADDS new department rows.
--   - Authority Grants (public.authority_grants, 0042) — standing
--     Executive Admin / Director-tier authority, time-bound delegation
--     with self-scoping safeguard (canDelegate()), auto-expiry, full
--     audit — untouched; Part D below only ADDS one nullable column so
--     the SAME table/UI/expiry/revocation/delegation machinery can also
--     carry a Financial Authority Level, rather than a parallel grant
--     system.
--   - Corporate identity / work email (public.corporate_identities,
--     0046 + src/lib/organization/corporateEmail.ts +
--     reserveCorporateIdentity.ts) — name-derived candidate generation,
--     fixed domain, collision checking, status lifecycle, admin-only
--     reservation, audit — untouched; Part I below only ADDS an
--     explicit request/approval diff trail.
--   - Staff onboarding process tracker (public.staff_onboarding, 0046)
--     — untouched.
--   - Recruitment requisitions + interview panels/evaluations (0046) —
--     untouched.
--   - Payment instructions / payment obligations / payee architecture
--     (0046, extended by Universal Payables 2026-09-03) — untouched;
--     reused as-is for refund/write-off authority-level gating (no
--     second payables ledger).
--   - Production budgets/changes (0062) — untouched; Part H below only
--     ADDS one nullable anti-splitting reference column.
--
-- Genuinely new in this migration: Financial Authority Levels 0-5
-- (Parts B/C), Employment Status distinct from Account/Access Status
-- (Part E, extends profiles.access_status and adds
-- staff_details.employment_status), Acting Assignments (Part F),
-- Background Screening (Part G), anti-splitting reference (Part H),
-- work-email request/approval diff trail (Part I), and additive
-- Department/Employment-Classification catalogue rows (Parts A/J) so
-- the full canonical taxonomy from this phase's spec exists without
-- touching any existing Department/Position/engagement_type row or its
-- live FKs.
--
-- Every change below is additive. No existing table's rows are
-- modified except the two explicitly-approved CHECK-constraint widenings
-- in Part E (profiles.access_status gains 'invited'/'restricted' as
-- ALLOWED values — every existing row's actual value is untouched,
-- since none of them currently holds a value that stops being valid).

begin;

-- ============================================================
-- PART A — Department catalogue expansion (additive rows only)
-- ============================================================
-- The 39-Position catalogue's 4 existing departments (Executive &
-- Administration, Creative & Production, Client, Marketing & Commercial,
-- Talent & Model Management) already have real Positions/reporting
-- chains built on them (0037-0043) — NOT split, renamed, or
-- reassigned here. The spec's fuller 11-domain taxonomy is added as
-- NEW rows for future hiring/org growth (Part 4's own framing: "these
-- do NOT imply Ordift currently has a separate employee in each
-- department... must nevertheless support future scale"). Uses the
-- existing, unmodified public.departments table — no schema change
-- needed for this part.
insert into public.departments (business_id, slug, name, description, active, sort_order)
select public.ordift_studios_business_id(), v.slug, v.name, v.description, true, v.sort_order
from (values
  ('post-production', 'Post-Production', 'Photo editing, retouching, video editing, colour, AI/post-production workflows.', 25),
  ('production-operations', 'Production & Operations', 'Production management, equipment, locations, logistics, suppliers and operational coordination.', 26),
  ('design-brand', 'Design & Brand', 'Graphic Design, Branding & Creative Strategy.', 45),
  ('content-marketing', 'Content & Marketing', 'Content Creation, Social Media, Marketing, Communications.', 46),
  ('talent-partnerships', 'Talent & Partnerships', 'Talent Management, Collaborations, Partnerships, Referral relationships.', 47),
  ('client-services-commercial', 'Client Services & Commercial', 'Enquiries, Bookings, Client Management, Account Management, Commercial relationships.', 48),
  ('finance-administration', 'Finance & Administration', 'Accounts, Payments, Payables, Receivables, Financial administration.', 60),
  ('people-organization', 'People & Organization', 'HR, Recruitment, Staff records, Onboarding, Organization, Training, Compliance.', 70),
  -- Locked public/business naming preserved exactly: umbrella = OS
  -- Academy, flagship series = Ordift Creative Lab. Never "Ordift Academy".
  ('os-academy', 'OS Academy', 'Ordift Creative Lab, workshops, instructors, educational programming.', 80),
  ('technology-systems', 'Technology & Systems', 'Website, platform, integrations, systems administration and technical operations.', 90)
) as v(slug, name, description, sort_order)
where not exists (select 1 from public.departments d where d.slug = v.slug);

-- ============================================================
-- PART J — Employment/engagement classification expansion (additive)
-- ============================================================
-- Existing public.engagement_types (0009) already has 7 rows
-- (full_time/part_time/freelancer/independent_contractor/project_based/
-- intern/volunteer) — untouched. Adds the remaining classifications
-- from the spec's minimum list. Per explicit instruction, the existing
-- broad `contractor`/`vendor`/`model` AUTH ROLES remain the umbrella
-- system identity for those external workforce kinds — these rows are
-- the CONTRACTUAL classification, a separate concept, not a duplicate
-- of the role system.
insert into public.engagement_types (business_id, slug, name, sort_order)
select public.ordift_studios_business_id(), v.slug, v.name, v.sort_order
from (values
  ('fixed_term', 'Fixed-Term Employee', 15),
  ('vendor_supplier', 'Vendor / Supplier', 45),
  ('instructor', 'Instructor', 55),
  ('model_talent', 'Model / Talent', 65),
  ('collaborator_partner', 'Collaborator / Partner', 75)
) as v(slug, name, sort_order)
where not exists (select 1 from public.engagement_types e where e.slug = v.slug);

-- ============================================================
-- PART B — Financial Authority Level thresholds (versioned, additive)
-- ============================================================
-- Canonical Level 0-5 USD routine-approval ceilings — per explicit
-- instruction NOT buried as a hardcoded constant. Append-only
-- versioning (supersedes_id self-FK), same established pattern as
-- production_budgets (0062) and every other "must not be silently
-- rewritten" domain in this codebase — the only write is INSERT, never
-- UPDATE of a value column. routine_ceiling_usd null = Level 5 (no
-- internal ceiling — never "disable governance", see Part C's
-- consuming code for how Level 5 still respects destination
-- verification/refund-reference/audit). Internal admin UX never shows
-- "F0/F1/..." — "level" here is the internal integer; display copy is
-- entirely the app layer's job ("Level 2 — Standard Management Approval").
create table public.financial_authority_level_thresholds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  level smallint not null check (level between 0 and 5),
  label text not null,
  routine_ceiling_usd numeric(14,2),
  effective_date date not null default current_date,
  supersedes_id uuid references public.financial_authority_level_thresholds (id),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.financial_authority_level_thresholds is
  'Versioned, effective-dated, admin-configurable Financial Authority Level ceilings (canonical base currency USD). Append-only — a change is a NEW row with supersedes_id set, never an UPDATE of an existing ceiling. Level 5 (routine_ceiling_usd null) = no internal Ordift monetary ceiling, which is NOT a bypass of bank limits, law, evidence, the Payables lifecycle, contracts, audit, supplier controls, or destination-verification safeguards — those are enforced independently in application code regardless of level.';

create index financial_authority_level_thresholds_active_idx on public.financial_authority_level_thresholds (level) where active and supersedes_id is null;

alter table public.financial_authority_level_thresholds enable row level security;

create policy "financial_authority_level_thresholds: staff read" on public.financial_authority_level_thresholds
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.financial_authority_level_thresholds to authenticated;
grant select, insert, update, delete on public.financial_authority_level_thresholds to service_role;

insert into public.financial_authority_level_thresholds (business_id, level, label, routine_ceiling_usd, notes) values
  (public.ordift_studios_business_id(), 0, 'No Financial Approval', 0, 'Can potentially view or prepare transactions where otherwise authorized. Cannot independently approve financial commitments.'),
  (public.ordift_studios_business_id(), 1, 'Minor Operational Approval', 250, null),
  (public.ordift_studios_business_id(), 2, 'Standard Management Approval', 1000, null),
  (public.ordift_studios_business_id(), 3, 'Senior Management Approval', 5000, null),
  (public.ordift_studios_business_id(), 4, 'Executive Approval', 15000, null),
  (public.ordift_studios_business_id(), 5, 'Founder / Ultimate Approval', null, 'Above USD $15,000. No internal ceiling — does not bypass external/legal/audit/contract/supplier/destination-verification safeguards.');

-- ============================================================
-- PART C — Financial Authority Level ASSIGNMENT reuses
-- authority_grants (no parallel grant system)
-- ============================================================
-- A person's Financial Authority Level is granted as an
-- authority_grants row exactly like Executive Admin/Director-tier/any
-- delegation — same table, same admin UI, same effective_at/expires_at/
-- revoked_at lifecycle, same audit, same self-scoping delegation
-- safeguard (canDelegate()/validateDelegationAuthority() already
-- refuse delegating a level higher than the grantor's own — the
-- existing "you cannot delegate an authority you don't hold" check in
-- authority.ts applies unchanged once the app layer treats
-- 'financial_authority' + a level as one authority string per level,
-- e.g. 'financial_authority_level_3' — see src/lib/organization/
-- financialAuthority.ts for the exact convention). One nullable column
-- lets a financial_authority_grants row ALSO carry a structured level
-- for querying/display without parsing the authority string.
alter table public.authority_grants
  add column if not exists financial_authority_level smallint check (financial_authority_level between 0 and 5);

comment on column public.authority_grants.financial_authority_level is
  'Set only on rows where authority is one of the financial_authority_level_N convention strings (see FINANCIAL_AUTHORITY_LEVEL_AUTHORITY() in src/lib/organization/financialAuthority.ts) — structured mirror of the level encoded in `authority`, for querying/display. Null for every other authority_grants row (Executive Admin, Director-tier, any non-financial delegation). Financial Authority Level is NEVER implied by Grade, Position, Department, or capability — this column is the ONLY source of truth for "what Financial Authority Level does this person hold", and it is only ever populated by an explicit grant.';

-- ============================================================
-- PART D — Corporate identity request/approval diff trail (additive)
-- ============================================================
-- The existing reserve-and-generate flow (reserveCorporateIdentity())
-- already IS the approval act (only Technology/GEEK capability holders
-- or Super Admin may call it) — these columns add the explicit
-- "requester proposed X, approver approved Y, here is the difference"
-- trail the spec's Part 53 asks for, for the case where a person
-- requests an alternative local part via the existing generic
-- department_requests workflow (request_type =
-- 'work_email_alternative_request') before an admin approves.
alter table public.corporate_identities
  add column if not exists requested_local_part text,
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists approved_at timestamptz,
  add column if not exists approval_reason text;

comment on column public.corporate_identities.requested_local_part is
  'The local part the person actually asked for (via a work_email_alternative_request department_request), if different from the system-generated candidate that was ultimately reserved in local_part. Null when the system suggestion was used as-is.';

-- ============================================================
-- PART E — Employment Status vs Account/System Access Status
-- ============================================================
-- profiles.access_status (0009) already IS the Account/System Access
-- Status concept — widened, not replaced, to add 'invited' (before
-- first login) and 'restricted' (narrowed but not fully suspended).
-- Every existing row's actual value ('active'/'suspended'/'deactivated')
-- remains valid under the new, wider constraint — nothing is touched.
alter table public.profiles drop constraint if exists profiles_access_status_check;
alter table public.profiles add constraint profiles_access_status_check
  check (access_status in ('invited', 'active', 'restricted', 'suspended', 'deactivated'));

comment on column public.profiles.access_status is
  'Account/SYSTEM access status — deliberately independent of staff_details.employment_status (e.g. Employment=Notice Period while System=Active until the last working day; Employment=Exited then System=Disabled, never deleted). invited/restricted added (2026-09-07) for the pre-first-login and narrowed-access states.';

-- New, genuinely absent until now: Employment/Engagement STATUS, as
-- distinct from Account/System Access Status above and from
-- engagement_type_id (the CONTRACTUAL classification). Unconstrained
-- text — same precedent as activity_log.action/workflow_statuses.status
-- — starts null for every existing row (no fabricated backfill; an
-- admin sets this explicitly going forward, never silently assumed).
alter table public.staff_details
  add column if not exists employment_status text,
  add column if not exists employment_status_changed_at timestamptz,
  add column if not exists employment_status_changed_by uuid references public.profiles (id);

comment on column public.staff_details.employment_status is
  'Employment/engagement lifecycle status — Pre-Start, Active, Probation, Leave, Suspended, Notice Period, Exited (unconstrained text, application-validated). Independent of profiles.access_status (system/account access) and of engagement_type_id (contractual classification). Null on every pre-existing row — this phase does not fabricate a status for real people; an authorized administrator sets it explicitly.';

-- ============================================================
-- PART F — Acting Assignments
-- ============================================================
-- Substantive (permanent) position/Grade is untouched by an acting
-- assignment, by construction: this table has no path that writes
-- staff_details.grade_id/position_id. financial_authority_level here is
-- a DISPLAY/reference convenience only — the actual temporary authority
-- (if any) is granted the normal way, as a time-bound authority_grants
-- row (expires_at = end_date), so revocation/expiry/audit reuse that
-- one mechanism rather than a second. All temporary authority expires;
-- this table's own end_date is descriptive of the acting assignment
-- itself, and ended_early_at lets an admin end it before the planned
-- date without deleting the historical record.
create table public.acting_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  acting_title text not null,
  acting_position_id uuid references public.positions (id),
  scope_department_id uuid references public.departments (id),
  financial_authority_level smallint check (financial_authority_level between 0 and 5),
  linked_authority_grant_id uuid references public.authority_grants (id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  approved_by uuid not null references public.profiles (id),
  reason text not null,
  ended_early_at timestamptz,
  ended_early_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.acting_assignments is
  'Temporary acting assignment — e.g. Production Manager (substantive, G6) holding "Acting Head of Production" for a defined period. Never changes staff_details.grade_id/position_id. linked_authority_grant_id optionally points to the real, expiring authority_grants row (if any) that carries the actual temporary capability/Financial Authority Level for this assignment — kept as one source of expiring authority, not two.';

create index acting_assignments_profile_id_idx on public.acting_assignments (profile_id);
create index acting_assignments_active_idx on public.acting_assignments (profile_id, end_date) where ended_early_at is null;

alter table public.acting_assignments enable row level security;

create policy "acting_assignments: read own or admin" on public.acting_assignments
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.acting_assignments to authenticated;
grant select, insert, update, delete on public.acting_assignments to service_role;

-- ============================================================
-- PART G — Background Screening (highly sensitive, strictly restricted)
-- ============================================================
-- Structured status/outcome only — never a repository for raw sensitive
-- documents. evidence_reference is a pointer (e.g. an external
-- checker's case reference), never file content. Read is deliberately
-- Super-Admin-only (stricter than the general admin tier), matching
-- grade_compensation_bands' precedent — "ordinary coworkers, supervisors
-- or unrelated managers must not be able to browse" is satisfied by
-- construction: there is no admin-tier read policy at all here, only
-- super_admin. category/status are unconstrained text (documented
-- vocabulary, application-validated) — jurisdiction-aware by design
-- (Ghana/Qatar/UK/etc. all have different lawful/available checks; the
-- system makes no legal claim about which are valid where).
create table public.background_screenings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  category text not null,
  jurisdiction text,
  status text not null default 'pending',
  evidence_reference text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.background_screenings is
  'Onboarding screening gate — structured status/outcome only, never raw sensitive document content. category: identity_verification, employment_history, education, professional_qualification, references, right_to_work, role_licence, criminal_history (unconstrained text). status: pending, clear, review_required, unable_to_verify, adverse_information_identified, management_approved_following_review, not_approved (unconstrained text). Read is Super-Admin-only by design — stricter than the general Admin tier, since this is HR-sensitive data ordinary coworkers/supervisors/unrelated managers must never browse.';

create index background_screenings_profile_id_idx on public.background_screenings (profile_id);

alter table public.background_screenings enable row level security;

create policy "background_screenings: super admin only" on public.background_screenings
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.background_screenings to authenticated;
grant select, insert, update, delete on public.background_screenings to service_role;

-- ============================================================
-- PART H — Anti-splitting reference (additive, minimal)
-- ============================================================
-- Reuses the existing append-only production_budget_changes table
-- (0062) rather than a new table. A shared related_commitment_reference
-- lets several separate changes/commitments be recognised as part of
-- one genuine cumulative commitment for anti-splitting evaluation (see
-- flagPotentialSplitting() in src/lib/organization/financialAuthority.ts)
-- — deliberately NOT a probabilistic detector, just an explicit,
-- documented grouping key plus a required approval reason when flagged.
alter table public.production_budget_changes
  add column if not exists related_commitment_reference text,
  add column if not exists anti_splitting_reviewed boolean not null default false,
  add column if not exists anti_splitting_review_reason text;

comment on column public.production_budget_changes.related_commitment_reference is
  'Optional shared key linking several separate budget changes that are genuinely part of one underlying commitment (anti-splitting evaluation) — e.g. two $900 changes both referencing the same underlying $1,800 supplier commitment. Null for an unrelated, standalone change.';

commit;
