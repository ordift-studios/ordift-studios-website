-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 9 (2026-09-14) —
-- ASSETS AND EQUIPMENT (Ghana), OS-HR-GH-005 section 4.
--
-- 4.2: "no automatic payroll deduction applies" — nothing in this
-- migration or its accompanying code (src/lib/organization/assets.ts)
-- writes to salary_advances, staff_benefit_transactions, or
-- final_settlement_deductions. Recording an incident determination here
-- never itself creates a deduction — any lawful recovery is a separate,
-- explicit human decision made through those already-existing
-- mechanisms, never an automatic trigger from this table.
--
-- Proven-deliberate-damage/serious-negligence determinations may
-- optionally link to the existing investigations table (migration
-- 0089) rather than inventing a parallel investigation concept —
-- reusing existing infrastructure.

begin;

create table public.company_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  asset_identifier text not null,
  description text not null,
  category text,
  accessories jsonb not null default '[]'::jsonb,
  status text not null default 'in_stock',
  acknowledgement_required boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_assets_identifier_unique unique (asset_identifier)
);

comment on table public.company_assets is
  'The company asset registry — OS-HR-GH-005 4.1: "Significant assets are individually assigned with asset identifier..." status: in_stock | assigned | under_repair | retired | disposed (unconstrained text, application-validated). acknowledgement_required reflects 4.3: "Expensive/sensitive equipment may require digital acknowledgement" — a per-asset default, copied onto each asset_assignments row at issuance so a later change to this flag never retroactively applies to an assignment already made.';

alter table public.company_assets enable row level security;

-- Admin-only read — company asset registry/inventory, not personal
-- employee data.
create policy "company_assets: admin read" on public.company_assets
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.company_assets to authenticated;
grant select, insert, update on public.company_assets to service_role;

create trigger company_assets_set_updated_at
  before update on public.company_assets
  for each row execute function public.set_updated_at();

create table public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  asset_id uuid not null references public.company_assets (id),
  profile_id uuid not null references public.profiles (id),
  issued_by uuid not null references public.profiles (id),
  issued_at timestamptz not null default now(),
  issue_condition text,
  issue_accessories jsonb,
  acknowledgement_required boolean not null default false,
  acknowledged_at timestamptz,
  transfer_from_assignment_id uuid references public.asset_assignments (id),
  returned_at timestamptz,
  return_condition text,
  return_accessories jsonb,
  return_recorded_by uuid references public.profiles (id),
  status text not null default 'issued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asset_assignments is
  'The real 4.1 assignment record: "asset identifier, employee, issue date, condition, accessories, return/transfer record and return condition." status: issued | returned | transferred. transfer_from_assignment_id links a new assignment back to the prior one it continues from (4.1: "transfer record") without inventing a separate transfer-log table. acknowledged_at is set only when acknowledgement_required is true — a lightweight digital sign-off timestamp for equipment issuance, deliberately NOT the Legal Signature Engine (agreements/signature_events), which exists for legal agreements, not equipment hand-off.';

create index asset_assignments_profile_idx on public.asset_assignments (profile_id);
create index asset_assignments_asset_idx on public.asset_assignments (asset_id);

alter table public.asset_assignments enable row level security;

create policy "asset_assignments: read own or admin" on public.asset_assignments
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.asset_assignments to authenticated;
grant select, insert, update on public.asset_assignments to service_role;

create trigger asset_assignments_set_updated_at
  before update on public.asset_assignments
  for each row execute function public.set_updated_at();

create table public.asset_incident_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  asset_assignment_id uuid not null references public.asset_assignments (id),
  profile_id uuid not null references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  incident_type text not null,
  description text not null,
  reported_at timestamptz not null default now(),
  determination text not null default 'pending',
  determination_notes text,
  investigation_id uuid references public.investigations (id),
  recovery_required boolean not null default false,
  recovery_notes text,
  determined_by uuid references public.profiles (id),
  determined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asset_incident_reports is
  'incident_type: loss | damage | unauthorized_disposal | failure_to_return | other (unconstrained text). determination: pending | company_matter | proven_deliberate_or_negligent — OS-HR-GH-005 4.2''s real distinction ("Normal wear, ordinary equipment failure and authorized accidents are company matters" vs "Proven deliberate damage, serious negligence, unauthorized disposal or failure to return may lead to discipline and lawful recovery"). This table never computes or applies that determination automatically — it is always a human decision recorded via determineAssetIncident() (src/lib/organization/assets.ts), optionally linked to an investigations row (migration 0089) rather than a new parallel investigation concept. recovery_required/recovery_notes record only that lawful recovery was determined appropriate — "no automatic payroll deduction applies" (4.2): nothing here creates a deduction; any actual recovery happens through the separate salary_advances/final_settlement_deductions mechanisms as its own explicit human decision.';

create index asset_incident_reports_assignment_idx on public.asset_incident_reports (asset_assignment_id);
create index asset_incident_reports_profile_idx on public.asset_incident_reports (profile_id);

alter table public.asset_incident_reports enable row level security;

create policy "asset_incident_reports: read own or admin" on public.asset_incident_reports
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.asset_incident_reports to authenticated;
grant select, insert, update on public.asset_incident_reports to service_role;

create trigger asset_incident_reports_set_updated_at
  before update on public.asset_incident_reports
  for each row execute function public.set_updated_at();

commit;
