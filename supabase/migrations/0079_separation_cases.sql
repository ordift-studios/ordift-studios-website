begin;

-- Sequence 1, E.5 Stage 2J, Part 2/3 — Workforce lifecycle: separation/
-- offboarding/clearance foundation. Deliberately a SEPARATE persistence
-- domain from public.onboarding_requirements (migration 0078), not a
-- generalized/renamed version of it — see the Stage 2J report for the
-- concrete evidence behind that choice (Option B): onboarding is a
-- strict linear stage sequence per person; clearance is a PARALLEL set
-- of areas (Department, Finance, Legal, HR, Access, Corporate Identity,
-- Authority, Handover) that can be worked on concurrently, has
-- materially higher-sensitivity subject matter (Authority/Corporate
-- Identity/Finance disposition), and can be triggered by the employee,
-- the company, or an exceptional circumstance — none of which apply to
-- onboarding. The reusable part (requirement TYPE/STATUS vocabulary and
-- the pure gating logic) is reused directly from
-- src/lib/organization/onboardingRequirements.ts in code, not
-- duplicated at the schema level; only the STATE tables differ, and
-- only where their semantics genuinely differ.
create table public.separation_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  -- Top-level category, per Part 3: 'employee_initiated' |
  -- 'company_initiated' | 'exceptional'. Specific reason_type values
  -- (resignation, termination, contract_expiry, redundancy,
  -- mutual_separation, retirement, other_company_initiated,
  -- abandonment, death, incapacity, emergency_involuntary,
  -- other_exceptional, ...) are application-validated, matching this
  -- schema's own established convention for stage/status text columns
  -- (see staff_onboarding.stage) rather than a DB enum.
  category text not null,
  reason_type text not null,
  reason_notes text,
  initiated_by uuid references public.profiles (id),
  -- 'self' | 'company' — Part 5's domain foundation for an eventual
  -- employee-initiated entry point. Not exposed to any employee-facing
  -- surface in this stage (deliberately deferred); every case created
  -- through this stage's admin-only action is 'company', recorded
  -- honestly rather than defaulted to a value implying self-service
  -- already exists.
  initiated_by_role text not null default 'company',
  submitted_at timestamptz not null default now(),
  proposed_last_working_date date,
  confirmed_last_working_date date,
  company_acknowledged_at timestamptz,
  company_acknowledged_by uuid references public.profiles (id),
  -- Notice-policy BOUNDARY only (Part 6) — records which source
  -- eventually resolved a notice requirement and what it produced,
  -- never a jurisdiction formula computed here. 'unresolved' (the
  -- honest default state) until some future policy engine or a human
  -- resolves it.
  notice_policy_source text,
  notice_reference text,
  notice_required_days integer,
  notice_resolved_at timestamptz,
  notice_resolved_by uuid references public.profiles (id),
  -- Final-settlement/service-benefit BOUNDARY only (Part 7) — a status
  -- marker and an external pointer, never an amount or formula. Finance
  -- remains independently controlled; this column only records that a
  -- handoff to Finance has been requested/is in progress/is done.
  final_settlement_status text not null default 'not_started',
  final_settlement_reference text,
  -- 'open' | 'cleared' | 'cancelled' (a withdrawn resignation, or a
  -- case opened in error). 'cleared' is set only by
  -- finalizeSeparationClearance() after every REQUIRED
  -- separation_requirements row is satisfied/waived/not_applicable —
  -- see src/lib/organization/separationCases.ts.
  status text not null default 'open',
  final_clearance_at timestamptz,
  final_clearance_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- At most one OPEN case per person at a time — a real safety
-- constraint (prevents an accidental duplicate case), not a business
-- rule about how many separations a person may ever have over time.
create unique index separation_cases_one_open_per_profile
  on public.separation_cases (profile_id)
  where (status = 'open');

comment on table public.separation_cases is
  'Sequence 1, E.5 Stage 2J — a controlled workforce-separation/offboarding case. Deliberately does NOT itself revoke roles, Authority Grants, Corporate Identity, or Google Workspace access, execute payment, or delete any historical record — see finalizeSeparationClearance() in src/lib/organization/separationCases.ts. notice_*/final_settlement_* columns are boundary/evidence fields only, never a computed legal or financial outcome.';

alter table public.separation_cases enable row level security;

create policy "separation_cases: read own or admin" on public.separation_cases
  for select
  to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin_or_super_admin()));

grant select on public.separation_cases to authenticated;
grant select, insert, update, delete on public.separation_cases to service_role;

-- Per-case clearance requirement STATE, mirroring
-- public.onboarding_requirements' shape closely (same requirement_type
-- vocabulary, same completed/verified evidence columns) but keyed to a
-- separation case, not an onboarding record, and using `area` rather
-- than `stage` — clearance areas run in parallel, not in a fixed
-- sequence. Requirement CATALOG definitions live in code
-- (src/lib/organization/separationRequirements.ts), same convention as
-- onboarding.
create table public.separation_requirements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  separation_case_id uuid not null references public.separation_cases (id) on delete cascade,
  requirement_key text not null,
  requirement_type text not null,
  area text not null,
  required boolean not null default true,
  status text not null default 'pending',
  responsible_role text,
  evidence_reference text,
  notes text,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (separation_case_id, requirement_key)
);

comment on table public.separation_requirements is
  'Per-separation-case clearance requirement STATE only (Sequence 1, E.5 Stage 2J). A row exists only once a human has acted on it; an applicable catalog requirement with no row is treated as pending by the application layer, same convention as public.onboarding_requirements.';

alter table public.separation_requirements enable row level security;

create policy "separation_requirements: read own case or admin" on public.separation_requirements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.separation_cases sc
      where sc.id = separation_requirements.separation_case_id
        and (sc.profile_id = (select auth.uid()) or (select private.is_admin_or_super_admin()))
    )
  );

grant select on public.separation_requirements to authenticated;
grant select, insert, update, delete on public.separation_requirements to service_role;

commit;
