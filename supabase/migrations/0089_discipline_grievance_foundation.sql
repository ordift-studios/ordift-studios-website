-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 4 (2026-09-14) —
-- DISCIPLINE / INVESTIGATION / GRIEVANCE / SPEAK-UP / APPEALS FOUNDATION
-- (Ghana).
--
-- Seven tables, deliberately kept as separate workflows per explicit
-- instruction ("Keep separate workflows" — grievance/Speak-Up/appeals;
-- "Performance Review/PIP" must remain separate from "Incident/
-- Investigation/Discipline", already true since no code here touches
-- the unbuilt performance/PIP subsystem at all).
--
-- No automatic termination rule exists anywhere in this migration or
-- its accompanying code (OS-HR-GH-004 5.1/5.3, OS-HR-GH-006 1.2/1.3).
-- Warning validity periods (6/12 months) are computed once at issuance
-- from OS-HR-GH-004 5.1's real approved durations — never a mutable
-- "status" column requiring a background job to flip active->expired;
-- "is this warning currently active" is a pure read-time computation
-- (isDisciplinaryActionCurrentlyActive(), src/lib/organization/discipline.ts).

begin;

create table public.disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  action_type text not null,
  reason text not null,
  incident_date date,
  investigation_id uuid,
  issued_by uuid not null references public.profiles (id),
  issued_at timestamptz not null default now(),
  active_until date,
  created_at timestamptz not null default now()
);

comment on table public.disciplinary_actions is
  'Append-only. action_type: informal_intervention | first_written_warning | final_written_warning | further_action (unconstrained text, application-validated, same precedent as activity_log.action). active_until is computed once at issuance from OS-HR-GH-004 5.1''s real approved validity periods (first written warning: 6 months; final written warning: 12 months; informal_intervention/further_action: null, no fixed validity stated) — never a mutable status a background job must maintain. "Currently active" is always a read-time computation (active_until is null or >= the query date), never stored redundantly. Never updated once inserted — a later action for the same person is always a new row, and an expired warning remains here permanently as historical/auditable record (OS-HR-GH-004 5.1: "Expired warnings remain in the audit history but are ordinarily inactive").';

create index disciplinary_actions_profile_idx on public.disciplinary_actions (profile_id);

alter table public.disciplinary_actions enable row level security;

create policy "disciplinary_actions: read own or admin" on public.disciplinary_actions
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.disciplinary_actions to authenticated;
grant select, insert on public.disciplinary_actions to service_role;

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  initiated_by uuid not null references public.profiles (id),
  reason text not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  outcome_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.investigations is
  'status: open | closed_no_action | closed_resulted_in_discipline | closed_resulted_in_separation (unconstrained text, application-validated). Investigation and discipline are linked (disciplinary_actions.investigation_id) but remain distinct records — an investigation can close with no disciplinary action at all, per OS-HR-GH-004 5.2: "Allegations are investigated... without predetermined conclusions."';

alter table public.investigations enable row level security;

-- Admin-only read (not "own or admin") — an active/open allegation
-- against someone is deliberately NOT automatically visible to that
-- person via this table alone (OS-HR-GH-004: "restricted sensitive
-- access"); any disclosure owed to the subject happens through the
-- real investigatory process (opportunity to respond), not blanket
-- read access to the case record.
create policy "investigations: admin read" on public.investigations
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.investigations to authenticated;
grant select, insert, update on public.investigations to service_role;

create trigger investigations_set_updated_at
  before update on public.investigations
  for each row execute function public.set_updated_at();

create table public.investigatory_suspensions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  investigation_id uuid not null references public.investigations (id),
  profile_id uuid not null references public.profiles (id),
  reason text not null,
  full_basic_pay boolean not null default true,
  normal_benefits boolean not null default true,
  access_restricted boolean not null default false,
  decision_maker uuid not null references public.profiles (id),
  suspended_at timestamptz not null default now(),
  initial_review_due_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz not null default now()
);

comment on column public.investigatory_suspensions.full_basic_pay is
  'Defaults true — OS-HR-GH-004 5.3: "The default is full basic pay and normal benefits." A false value is a deliberate, documented exception, never the starting assumption.';
comment on column public.investigatory_suspensions.initial_review_due_at is
  'Computed once at insert as suspended_at + 7 calendar days (OS-HR-GH-004 5.3) — the real approved figure, never invented. Further reviews are tracked in suspension_reviews, not by mutating this column.';

alter table public.investigatory_suspensions enable row level security;

create policy "investigatory_suspensions: admin read" on public.investigatory_suspensions
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.investigatory_suspensions to authenticated;
grant select, insert, update on public.investigatory_suspensions to service_role;

create table public.suspension_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  suspension_id uuid not null references public.investigatory_suspensions (id),
  reviewed_by uuid not null references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  decision text not null,
  notes text,
  next_review_due_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.suspension_reviews is
  'Append-only. decision: continue_suspension | end_suspension (unconstrained text, application-validated). Multiple review rows are expected over the life of one suspension (OS-HR-GH-004 5.3: "further documented reviews as necessary") — never overwritten, each review is a new row.';

alter table public.suspension_reviews enable row level security;

create policy "suspension_reviews: admin read" on public.suspension_reviews
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.suspension_reviews to authenticated;
grant select, insert on public.suspension_reviews to service_role;

create table public.grievances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  raised_by uuid not null references public.profiles (id),
  against_profile_id uuid references public.profiles (id),
  grievance_type text not null default 'formal',
  description text not null,
  bypassed_manager boolean not null default false,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  acknowledgement_due_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.grievances is
  'grievance_type: informal | formal. status: submitted | acknowledged | under_review | resolved | escalated. acknowledgement_due_at is computed once at insert as submitted_at + 2 working-day target (OS-HR-GH-004 6.1) — a target, not itself an enforcement mechanism. against_profile_id is deliberately NOT granted read access via RLS (see policy below) — restricted sensitive access, OS-HR-GH-004 1.2/6.1.';

alter table public.grievances enable row level security;

-- The RAISER sees their own grievance; the person it is raised against
-- does NOT automatically gain read access (deliberately omitted from
-- the OR clause) — restricted sensitive access.
create policy "grievances: read own submission or admin" on public.grievances
  for select
  to authenticated
  using ((select auth.uid()) = raised_by or (select private.is_admin_or_super_admin()));

grant select on public.grievances to authenticated;
grant select, insert, update on public.grievances to service_role;

create trigger grievances_set_updated_at
  before update on public.grievances
  for each row execute function public.set_updated_at();

create table public.speak_up_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  reported_by uuid references public.profiles (id),
  description text not null,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.speak_up_reports is
  'A dedicated whistleblowing channel, deliberately separate from grievances (OS-HR-GH-004 6.3). reported_by is nullable to support anonymous submission. status: submitted | under_review | resolved. Admin-read only — no "own read" policy at all, even for an identified reporter, matching the confidential/restricted handling this channel requires.';

alter table public.speak_up_reports enable row level security;

create policy "speak_up_reports: admin read" on public.speak_up_reports
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.speak_up_reports to authenticated;
grant select, insert, update on public.speak_up_reports to service_role;

create trigger speak_up_reports_set_updated_at
  before update on public.speak_up_reports
  for each row execute function public.set_updated_at();

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  appealed_decision_type text not null,
  appealed_decision_reference text not null,
  reason text not null,
  submitted_at timestamptz not null default now(),
  filing_deadline timestamptz,
  late_submission_approved boolean not null default false,
  reviewer_id uuid references public.profiles (id),
  status text not null default 'submitted',
  decision_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.appeals is
  'appealed_decision_type/appealed_decision_reference is the same polymorphic pointer pattern already proven for agreements.primary_context_type/primary_context_reference (migration 0069) — an appeal can reference a disciplinary_actions row, a grievances resolution, or any other decided-outcome record, without a separate appeals table per decision type. status: submitted | under_review | upheld | overturned | partially_upheld. filing_deadline reflects OS-HR-GH-004 6.2''s normal 5-working-day target where a caller supplies one; late_submission_approved records the explicit discretion that policy allows rather than a hard rejection.';

create index appeals_profile_idx on public.appeals (profile_id);
create index appeals_decision_idx on public.appeals (appealed_decision_type, appealed_decision_reference);

alter table public.appeals enable row level security;

create policy "appeals: read own or admin" on public.appeals
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.appeals to authenticated;
grant select, insert, update on public.appeals to service_role;

create trigger appeals_set_updated_at
  before update on public.appeals
  for each row execute function public.set_updated_at();

commit;
