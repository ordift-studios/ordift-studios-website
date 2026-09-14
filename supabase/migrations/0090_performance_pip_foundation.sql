-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 5 (2026-09-14) —
-- PERFORMANCE MANAGEMENT / PERFORMANCE IMPROVEMENT PLAN (PIP) FOUNDATION
-- (Ghana), OS-HR-GH-003 section 6.
--
-- Deliberately kept separate from discipline (migration 0089): OS-HR-GH-003
-- 6.2 states "Serious misconduct is handled separately through discipline"
-- and nothing here writes to disciplinary_actions/investigations, nor does
-- anything in discipline.ts write to these tables. A failed PIP "escalates
-- to review; it does not automatically terminate employment" (6.3) — no
-- automatic termination or status-linking to a disciplinary_actions row
-- exists anywhere in this migration or its accompanying code.

begin;

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  reviewer_id uuid not null references public.profiles (id),
  review_period_start date,
  review_period_end date,
  conducted_at timestamptz not null default now(),
  competency_notes text,
  kpi_notes text,
  outcome_summary text not null,
  next_review_due_at date,
  created_at timestamptz not null default now()
);

comment on table public.performance_reviews is
  'Append-only. outcome_summary is a free-text account of the review outcome — OS-HR-GH-003 6.2 references "strong performance" and "underperformance" descriptively, not as a closed rating scale, so no numeric or fixed-category rating is invented here. next_review_due_at is computed once at insert as conducted_at + 6 months (OS-HR-GH-003 6.1: "confirmed employees ordinarily receive a formal performance review every six months") — the real approved cadence, never invented. Never updated once inserted — a later review is always a new row.';

create index performance_reviews_profile_idx on public.performance_reviews (profile_id);

alter table public.performance_reviews enable row level security;

create policy "performance_reviews: read own or admin" on public.performance_reviews
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.performance_reviews to authenticated;
grant select, insert on public.performance_reviews to service_role;

create table public.performance_improvement_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  performance_review_id uuid references public.performance_reviews (id),
  initiated_by uuid not null references public.profiles (id),
  deficient_standard text not null,
  required_improvement text not null,
  measurable_objectives jsonb not null default '[]'::jsonb,
  support_resources text,
  planned_duration_days integer not null default 30,
  start_date date not null default current_date,
  planned_end_date date not null,
  status text not null default 'active',
  extended_end_date date,
  extension_reason text,
  extended_by uuid references public.profiles (id),
  extended_at timestamptz,
  outcome_notes text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_improvement_plans_duration_check check (planned_duration_days in (30, 60, 90))
);

comment on table public.performance_improvement_plans is
  'planned_duration_days is constrained to 30/60/90 — OS-HR-GH-003 6.3''s exact real approved values ("standard PIP is 30 days, configurable to 30/60/90 days"), never an invented range. planned_end_date is computed server-side as start_date + planned_duration_days, never a raw caller-supplied value. extended_end_date/extension_reason/extended_by/extended_at record the single documented extension 6.3 permits ("one documented extension") — application logic enforces this is set at most once, never a second time. status: active | extended | completed_improved | completed_failed_escalated (unconstrained text, application-validated). A failed PIP (completed_failed_escalated) records escalation only — it never itself terminates employment or writes to disciplinary_actions/investigations (OS-HR-GH-003 6.3: "does not automatically terminate employment"; 6.2: serious misconduct is handled separately through discipline).';

create index performance_improvement_plans_profile_idx on public.performance_improvement_plans (profile_id);

alter table public.performance_improvement_plans enable row level security;

create policy "performance_improvement_plans: read own or admin" on public.performance_improvement_plans
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.performance_improvement_plans to authenticated;
grant select, insert, update on public.performance_improvement_plans to service_role;

create trigger performance_improvement_plans_set_updated_at
  before update on public.performance_improvement_plans
  for each row execute function public.set_updated_at();

create table public.performance_improvement_plan_checkins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  pip_id uuid not null references public.performance_improvement_plans (id),
  reviewed_by uuid not null references public.profiles (id),
  checkin_at timestamptz not null default now(),
  notes text not null,
  created_at timestamptz not null default now()
);

comment on table public.performance_improvement_plan_checkins is
  'Append-only. OS-HR-GH-003 6.3 requires a PIP to record "check-ins" (plural, over time) — each check-in is a new row here, mirroring the same append-only periodic-review shape already proven by suspension_reviews (migration 0089). Never overwritten.';

create index performance_improvement_plan_checkins_pip_idx on public.performance_improvement_plan_checkins (pip_id);

alter table public.performance_improvement_plan_checkins enable row level security;

-- Ownership is derived through the parent PIP (this table has no
-- profile_id column of its own) — the same exists-subquery-to-parent
-- pattern already proven for agreement_releases/agreement_snapshots/
-- agreement_schedules/agreement_amendments (migrations 0069/0071).
create policy "performance_improvement_plan_checkins: read own or admin" on public.performance_improvement_plan_checkins
  for select
  to authenticated
  using (
    exists (
      select 1 from public.performance_improvement_plans pip
      where pip.id = performance_improvement_plan_checkins.pip_id
        and pip.profile_id = (select auth.uid())
    )
    or (select private.is_admin_or_super_admin())
  );

grant select on public.performance_improvement_plan_checkins to authenticated;
grant select, insert on public.performance_improvement_plan_checkins to service_role;

commit;
