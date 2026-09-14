-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 8 (2026-09-14) —
-- TRAINING AND PROFESSIONAL DEVELOPMENT (Ghana), OS-HR-GH-003 section 7.
--
-- Deliberately THREE separate tables rather than one, because 7.1's
-- guarantee ("does not create a repayment obligation") is enforced
-- structurally: training_records has no repayment column of any kind —
-- repayment can only ever exist on sponsored_development_agreements, a
-- genuinely different table for a genuinely different (7.3) category.
--
-- 7.3: "Exact thresholds/formulas are configured before use." No
-- declining-repayment formula or threshold is invented anywhere in this
-- migration or its accompanying code — repayment_terms_text and
-- repayment_time_limit_months are always explicit, human-authored,
-- per-agreement values, pre-agreed in writing before funding, never a
-- company-wide computed schedule.

begin;

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  training_type text not null,
  title text not null,
  provider text,
  funded_by_ordift boolean not null default true,
  treated_as_working_time boolean not null default false,
  scheduled_date date,
  completed_date date,
  hours numeric,
  cost numeric,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.training_records is
  'training_type: mandatory_role_required | onboarding | internal | safety | compliance | other (unconstrained text, application-validated) — OS-HR-GH-003 7.1''s real categories. treated_as_working_time reflects 7.1: "ordinarily treated as working time where applicable" — a per-record fact, not a blanket rule, since applicability varies. This table deliberately carries NO repayment column of any kind — 7.1: "does not create a repayment obligation." Any repayment obligation can only ever exist on sponsored_development_agreements, a structurally separate table for a genuinely different (7.3) category of development.';

create index training_records_profile_idx on public.training_records (profile_id);

alter table public.training_records enable row level security;

create policy "training_records: read own or admin" on public.training_records
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.training_records to authenticated;
grant select, insert, update on public.training_records to service_role;

create trigger training_records_set_updated_at
  before update on public.training_records
  for each row execute function public.set_updated_at();

create table public.development_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  requested_by uuid not null references public.profiles (id),
  request_type text not null,
  description text not null,
  estimated_cost numeric,
  status text not null default 'requested',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.development_requests is
  'request_type: funding | study_time | other_support (unconstrained text) — OS-HR-GH-003 7.2''s real categories ("discretionary funding, study time or other development support"). status: requested | approved | declined. Approval depends on role relevance, budget and business needs (7.2) — narrative judgment recorded in decision_notes, never a computed eligibility score.';

create index development_requests_profile_idx on public.development_requests (profile_id);

alter table public.development_requests enable row level security;

create policy "development_requests: read own or admin" on public.development_requests
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.development_requests to authenticated;
grant select, insert, update on public.development_requests to service_role;

create trigger development_requests_set_updated_at
  before update on public.development_requests
  for each row execute function public.set_updated_at();

create table public.sponsored_development_agreements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  development_request_id uuid references public.development_requests (id),
  description text not null,
  total_cost numeric not null check (total_cost > 0),
  externally_transferable boolean not null,
  repayment_required boolean not null default false,
  repayment_terms_text text,
  repayment_time_limit_months integer,
  written_agreement_signed_at timestamptz,
  funded_at timestamptz,
  status text not null default 'proposed',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sponsored_development_agreements is
  'OS-HR-GH-003 7.3: "Only substantial optional externally transferable development may carry a separate pre-agreed written repayment obligation." externally_transferable is a required, explicit human judgment recorded per agreement, never inferred. repayment_terms_text/repayment_time_limit_months are always human-authored per this specific agreement — 7.3: "Exact thresholds/formulas are configured before use," so no company-wide repayment formula is computed anywhere in this system. written_agreement_signed_at must be set (fundSponsoredDevelopmentAgreement() in developmentTraining.ts enforces this as an actual precondition) BEFORE status can move to funded — "pre-agreed" is enforced by ordering, not merely a field name. status: proposed | written_agreement_signed | funded | completed. Nothing in this table or its accompanying code is ever automatically triggered by a separations row (migration 0092) — 7.3: "Repayment is not mechanically applied on redundancy or other circumstances where recovery is unlawful or inappropriate" — any waiver or non-application of repayment on separation is a human decision recorded via decision_notes-style fields elsewhere, never an automatic join or trigger from this table to separations.';

create index sponsored_development_agreements_profile_idx on public.sponsored_development_agreements (profile_id);

alter table public.sponsored_development_agreements enable row level security;

create policy "sponsored_development_agreements: read own or admin" on public.sponsored_development_agreements
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.sponsored_development_agreements to authenticated;
grant select, insert, update on public.sponsored_development_agreements to service_role;

create trigger sponsored_development_agreements_set_updated_at
  before update on public.sponsored_development_agreements
  for each row execute function public.set_updated_at();

commit;
