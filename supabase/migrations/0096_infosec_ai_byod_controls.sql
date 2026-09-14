-- Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 11 (2026-09-14) —
-- INFORMATION SECURITY / AI / BYOD CONTROLS (Ghana), OS-HR-GH-005
-- section 1.3 (personal-device boundary) and section 2 (Acceptable
-- Use, Cybersecurity and AI).
--
-- INSPECTION SUMMARY: 2.1 (role-based access, MFA/credential
-- protection, "security controls must not be bypassed") names no new
-- workflow to build — it is already the pervasive, existing
-- authority_grants/hasJurisdictionAuthority()/isSuperAdminId()
-- authorization system used throughout this codebase, not a new
-- record type. 2.2 (unauthorized storage/software) names a prohibited
-- act, not a distinct workflow — a suspected 2.2 violation is reported
-- through the same security_incident_reports channel this migration
-- builds for 2.5, rather than a separate registry. Employee-data/
-- privacy sections 1.1/1.2/1.4/1.5 (the controlled Employee Record
-- itself, sensitive-field access control, contact/beneficiary records)
-- are a different topic from "information-security/AI/BYOD" and are
-- out of scope for this step.

begin;

create table public.byod_device_authorizations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  device_description text not null,
  authorized_scope text not null,
  status text not null default 'active',
  authorized_by uuid not null references public.profiles (id),
  authorized_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.byod_device_authorizations is
  'OS-HR-GH-005 1.3: "Where personal devices are authorized for work, Ordift controls only its business accounts, applications, company data and legitimate security configuration. This does not authorize unrestricted surveillance of unrelated personal content." authorized_scope is a required, human-written description of exactly what is controlled on this device — deliberately not a blanket flag, so the boundary in 1.3''s second sentence stays a documented, specific scope every time, never an implicit "everything." status: active | revoked.';

create index byod_device_authorizations_profile_idx on public.byod_device_authorizations (profile_id);

alter table public.byod_device_authorizations enable row level security;

create policy "byod_device_authorizations: read own or admin" on public.byod_device_authorizations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.byod_device_authorizations to authenticated;
grant select, insert, update on public.byod_device_authorizations to service_role;

create trigger byod_device_authorizations_set_updated_at
  before update on public.byod_device_authorizations
  for each row execute function public.set_updated_at();

create table public.authorized_ai_tools (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  tool_name text not null,
  authorized_use_description text not null,
  restrictions text,
  status text not null default 'active',
  authorized_by uuid not null references public.profiles (id),
  authorized_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authorized_ai_tools_tool_name_unique unique (tool_name)
);

comment on table public.authorized_ai_tools is
  'The real authorization registry behind OS-HR-GH-005 2.3: "...unless the specific use/tool is authorized under Ordift security/data rules." A catalog, not personal data — readable by any authenticated staff member (same precedent as leave_types/engagement_types) so employees can check authorization before uploading anything to an AI tool. No row is seeded by this migration — an authorization only exists because an administrator explicitly registered it against a real, specific use, never a default "AI is allowed" assumption.';

alter table public.authorized_ai_tools enable row level security;

create policy "authorized_ai_tools: staff read" on public.authorized_ai_tools
  for select
  to authenticated
  using (true);

grant select on public.authorized_ai_tools to authenticated;
grant select, insert, update on public.authorized_ai_tools to service_role;

create trigger authorized_ai_tools_set_updated_at
  before update on public.authorized_ai_tools
  for each row execute function public.set_updated_at();

create table public.ai_assisted_output_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  submitted_by uuid not null references public.profiles (id),
  category text not null,
  description text not null,
  ai_tool_id uuid references public.authorized_ai_tools (id),
  review_outcome text not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  accountability_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_assisted_output_reviews is
  'category: client | legal_document | financial | hr_decision | published_company_material | other — the exact real categories from OS-HR-GH-005 2.4 ("AI-assisted output affecting clients, legal documents, finances, HR decisions or published company material requires appropriate human review and accountability"). review_outcome: pending | approved | rejected | revised. reviewed_by/accountability_notes are the actual accountable-human-reviewer record 2.4 requires — nothing in this table or its accompanying code treats an AI tool''s own output as self-approving.';

create index ai_assisted_output_reviews_submitted_by_idx on public.ai_assisted_output_reviews (submitted_by);

alter table public.ai_assisted_output_reviews enable row level security;

create policy "ai_assisted_output_reviews: read own or admin" on public.ai_assisted_output_reviews
  for select
  to authenticated
  using ((select auth.uid()) = submitted_by or (select private.is_admin_or_super_admin()));

grant select on public.ai_assisted_output_reviews to authenticated;
grant select, insert, update on public.ai_assisted_output_reviews to service_role;

create trigger ai_assisted_output_reviews_set_updated_at
  before update on public.ai_assisted_output_reviews
  for each row execute function public.set_updated_at();

create table public.security_incident_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  incident_type text not null,
  description text not null,
  reported_at timestamptz not null default now(),
  status text not null default 'reported',
  resolution_notes text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.security_incident_reports is
  'incident_type: lost_device | compromised_credentials | suspicious_login | malware | accidental_sharing | other — OS-HR-GH-005 2.5''s real named categories, plus a suspected 2.2 (unauthorized storage/software) violation is also reported here as "other" with a descriptive account, rather than a separate registry. status: reported | investigating | resolved. 2.5: "Prompt reporting is encouraged even where the employee may have made the initial mistake" — reportSecurityIncident() (src/lib/organization/infosecControls.ts) carries no special authorization requirement for a person reporting their own incident, the same low-friction precedent already established for speak_up_reports (migration 0089): reporting itself must never be gated in a way that discourages prompt reporting.';

create index security_incident_reports_profile_idx on public.security_incident_reports (profile_id);

alter table public.security_incident_reports enable row level security;

create policy "security_incident_reports: read own or admin" on public.security_incident_reports
  for select
  to authenticated
  using ((select auth.uid()) = profile_id or (select private.is_admin_or_super_admin()));

grant select on public.security_incident_reports to authenticated;
grant select, insert, update on public.security_incident_reports to service_role;

create trigger security_incident_reports_set_updated_at
  before update on public.security_incident_reports
  for each row execute function public.set_updated_at();

commit;
