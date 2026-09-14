-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 13 (2026-09-14) —
-- BUSINESS TRAVEL, DRIVING AND PRODUCTION SAFETY (Ghana), OS-HR-GH-005
-- section 5.
--
-- 5.3/5.4 name two genuinely different real workflows (an accident's
-- stages center on responsibility/fault; a workplace injury's stages
-- center on absence/pay classification and return-to-work) — kept as
-- two separate tables rather than merged into one generic "incident"
-- concept, per the standing instruction not to merge conceptually
-- different workflows simply because they look similar. Both
-- optionally link to the existing investigations table (migration
-- 0089) rather than inventing a parallel investigation concept.
-- "Ordift-owned, rented or otherwise authorized vehicles" (5.2) are
-- represented as company_assets rows (category='vehicle', migration
-- 0094) — no separate vehicle-fleet table is created here;
-- driver_authorizations is the person-side "who may drive" gate,
-- distinct from asset assignment.

begin;

create table public.business_travel_authorizations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  requested_by uuid not null references public.profiles (id),
  destination_country text not null,
  purpose text not null,
  travel_start_date date,
  travel_end_date date,
  immigration_reviewed boolean not null default false,
  work_authorization_reviewed boolean not null default false,
  safety_reviewed boolean not null default false,
  jurisdiction_reviewed boolean not null default false,
  status text not null default 'requested',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_travel_authorizations is
  'OS-HR-GH-005 5.1: "International travel/assignment requires immigration, work-authorization, safety and jurisdiction review as applicable." The four *_reviewed booleans are the real, explicit gate — approveBusinessTravelAuthorization() (src/lib/organization/businessTravel.ts) requires all four to be true, as explicit caller-supplied confirmations, never defaulted, before status can become approved. status: requested | approved | declined. "Travel does not silently change employing entity or governing law" (5.1) — nothing in this table or its accompanying code writes to employment_terms_history.employing_entity_id; approving travel is never wired to any employing-entity change.';

create index business_travel_authorizations_profile_idx on public.business_travel_authorizations (profile_id);

alter table public.business_travel_authorizations enable row level security;

create policy "business_travel_authorizations: read own or admin" on public.business_travel_authorizations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.business_travel_authorizations to authenticated;
grant select, insert, update on public.business_travel_authorizations to service_role;

create trigger business_travel_authorizations_set_updated_at
  before update on public.business_travel_authorizations
  for each row execute function public.set_updated_at();

create table public.driver_authorizations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  license_number text,
  license_class text,
  license_expiry_date date,
  authorized_vehicle_types text,
  status text not null default 'active',
  authorized_by uuid not null references public.profiles (id),
  authorized_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.driver_authorizations is
  'OS-HR-GH-005 5.2: "Only appropriately licensed and authorized employees may drive Ordift-owned, rented or otherwise authorized vehicles for work. License details/expiry may be recorded where legitimately required for the role." status: active | expired | revoked. license_number/license_class/license_expiry_date are nullable — 5.2''s "where legitimately required for the role" means not every authorization needs full license detail recorded.';

create index driver_authorizations_profile_idx on public.driver_authorizations (profile_id);

alter table public.driver_authorizations enable row level security;

create policy "driver_authorizations: read own or admin" on public.driver_authorizations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.driver_authorizations to authenticated;
grant select, insert, update on public.driver_authorizations to service_role;

create trigger driver_authorizations_set_updated_at
  before update on public.driver_authorizations
  for each row execute function public.set_updated_at();

create table public.vehicle_incident_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  asset_id uuid references public.company_assets (id),
  description text not null,
  occurred_at timestamptz not null default now(),
  stage text not null default 'safety_medical_response',
  investigation_id uuid references public.investigations (id),
  responsibility_determination text,
  responsibility_notes text,
  financial_disciplinary_treatment_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vehicle_incident_reports is
  'stage follows OS-HR-GH-005 5.3''s exact real 6-stage sequence: safety_medical_response -> incident_report -> insurance_authority_requirements -> investigation -> responsibility_determination -> lawful_financial_disciplinary_treatment (enforced by computeNextVehicleIncidentStage(), src/lib/organization/businessTravel.ts). responsibility_determination is always an explicit human decision (employee_responsible | not_employee_responsible | shared | undetermined, unconstrained text) — never inferred automatically. "An accident does not automatically make the employee financially liable" (5.3): nothing in this table or its accompanying code writes to salary_advances, final_settlement_deductions, or disciplinary_actions — any actual financial or disciplinary consequence is a separate, later, explicit human action through those already-existing mechanisms. investigation_id optionally links to the existing investigations table (migration 0089) rather than a new parallel concept. asset_id optionally links to the company_assets row for the vehicle involved (migration 0094).';

create index vehicle_incident_reports_profile_idx on public.vehicle_incident_reports (profile_id);

alter table public.vehicle_incident_reports enable row level security;

create policy "vehicle_incident_reports: read own or admin" on public.vehicle_incident_reports
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.vehicle_incident_reports to authenticated;
grant select, insert, update on public.vehicle_incident_reports to service_role;

create trigger vehicle_incident_reports_set_updated_at
  before update on public.vehicle_incident_reports
  for each row execute function public.set_updated_at();

create table public.workplace_injury_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  description text not null,
  occurred_at timestamptz not null default now(),
  stage text not null default 'safety_medical_response',
  investigation_id uuid references public.investigations (id),
  absence_pay_classification text,
  return_to_work_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workplace_injury_reports is
  'stage follows OS-HR-GH-005 5.4''s exact real 5-stage sequence: safety_medical_response -> incident_investigation -> statutory_insurance_processing -> absence_pay_classification -> return_to_work (enforced by computeNextWorkplaceInjuryStage(), src/lib/organization/businessTravel.ts) — deliberately a DIFFERENT sequence from vehicle_incident_reports'' 5.3 stages (this table centers on absence/pay classification and return-to-work, not responsibility/fault), kept as a genuinely separate workflow rather than merged with vehicle incidents. absence_pay_classification is always an explicit human decision recorded as free text (e.g. paid_sick_leave, workers_compensation) — never auto-derived from leave_types. investigation_id optionally links to the existing investigations table (migration 0089).';

create index workplace_injury_reports_profile_idx on public.workplace_injury_reports (profile_id);

alter table public.workplace_injury_reports enable row level security;

create policy "workplace_injury_reports: read own or admin" on public.workplace_injury_reports
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.workplace_injury_reports to authenticated;
grant select, insert, update on public.workplace_injury_reports to service_role;

create trigger workplace_injury_reports_set_updated_at
  before update on public.workplace_injury_reports
  for each row execute function public.set_updated_at();

commit;
