-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 12 (2026-09-14) —
-- SAFEGUARDING CHILDREN AND VULNERABLE PERSONS (Ghana), OS-HR-GH-005
-- section 6.
--
-- INSPECTION SUMMARY: 6.1 (professional boundaries, consent/supervision
-- with children/vulnerable persons) is a conduct principle, not a named
-- workflow — no new table is built for it. 6.2 ("Permission to capture
-- does not automatically equal permission to publish") is the same
-- capture-does-not-equal-publish principle already structurally
-- enforced for portfolio/BTS use (portfolio_use_requests, migration
-- 0095) — a children's-image publication request is a heightened case
-- of that same existing controlled-approval workflow, not a separate
-- table. 6.3 is explicit: "Background/safeguarding checks are role- and
-- jurisdiction-specific through the requirement-classification system
-- rather than universally imposed on every employee" — WHETHER a check
-- is required for a given role/jurisdiction is already the existing
-- classifyRequirement()/requirement_evaluations system (migration
-- 0083); this migration does not duplicate that decision engine. What
-- it adds is the missing piece: an actual factual record that a
-- specific check was completed, referencing the requirement_evaluations
-- row that required it (optional, since not every check need trace to
-- one).

begin;

create table public.safeguarding_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  check_type text not null,
  result text not null,
  completed_at timestamptz,
  expiry_date date,
  verification_reference text,
  requirement_evaluation_id uuid references public.requirement_evaluations (id),
  verified_by uuid not null references public.profiles (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.safeguarding_checks is
  'check_type: background_check | police_clearance | safeguarding_training | reference_check | other (unconstrained text). result: cleared | not_cleared | pending (unconstrained text). requirement_evaluation_id optionally links back to the specific requirement_evaluations row (migration 0083) whose classifyRequirement() outcome determined this check was required for this role/jurisdiction — OS-HR-GH-005 6.3''s explicit "through the requirement-classification system," never a second, competing decision made by this table.';

create index safeguarding_checks_profile_idx on public.safeguarding_checks (profile_id);

alter table public.safeguarding_checks enable row level security;

create policy "safeguarding_checks: read own or admin" on public.safeguarding_checks
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.safeguarding_checks to authenticated;
grant select, insert, update on public.safeguarding_checks to service_role;

create trigger safeguarding_checks_set_updated_at
  before update on public.safeguarding_checks
  for each row execute function public.set_updated_at();

create table public.safeguarding_concern_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  reported_by uuid not null references public.profiles (id),
  concerning_profile_id uuid references public.profiles (id),
  description text not null,
  immediate_safety_action_taken text,
  mandatory_reporting_obligation_notes text,
  status text not null default 'reported',
  handled_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.safeguarding_concern_reports is
  'OS-HR-GH-005 6.4: "Safeguarding concerns use restricted reporting/escalation, prioritizing immediate safety and preserving any mandatory reporting obligations." reported_by is required (NOT nullable) — deliberately unlike the anonymous-support design of speak_up_reports (migration 0089): a safeguarding concern needs an identified reporter for immediate-safety follow-up. concerning_profile_id is nullable — a concern may involve a non-employee (a client, a minor on set) rather than only ever a staff member. mandatory_reporting_obligation_notes records that any external mandatory-reporting duty was considered/actioned, never that this system itself files a report with an authority. status: reported | escalated | resolved. "Restricted reporting" (6.4) refers to restricted READ ACCESS to a filed concern (admin-only, see the policy below), not a restriction on who may report — reportSafeguardingConcern() (src/lib/organization/safeguarding.ts) carries no authorization gate, matching the same prompt-reporting precedent already established for security_incident_reports (migration 0096) and speak_up_reports.';

alter table public.safeguarding_concern_reports enable row level security;

-- Admin-only read — the "restricted reporting/escalation" 6.4 calls
-- for. No "own read" policy at all, matching the same restricted-
-- sensitive-access precedent as investigations/speak_up_reports
-- (migration 0089).
create policy "safeguarding_concern_reports: admin read" on public.safeguarding_concern_reports
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.safeguarding_concern_reports to authenticated;
grant select, insert, update on public.safeguarding_concern_reports to service_role;

create trigger safeguarding_concern_reports_set_updated_at
  before update on public.safeguarding_concern_reports
  for each row execute function public.set_updated_at();

commit;
