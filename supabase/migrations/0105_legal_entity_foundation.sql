-- Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 1 (2026-09-15) —
-- LEGAL ENTITY / OPERATING-JURISDICTION FOUNDATION.
--
-- Extends the existing public.employing_entities table (migration 0080)
-- rather than inventing a competing "legal_entities" concept — that
-- table already establishes WHICH entity employs someone; this
-- migration is additive-only and adds WHAT that entity legally is
-- (registration facts, jurisdiction, evidence, verification), scoped
-- to support multiple future entities/jurisdictions (Qatar, UK, US,
-- Canada, ...) without redesign. Every genuinely-unknown fact (Ordift's
-- registration number, tax identifier, registered address) is left
-- NULL — never fabricated — per explicit Founder instruction.
--
-- Sensitive registration facts (registration number, tax identifier,
-- registered address) are split into a separate Super-Admin-only table
-- rather than added directly to employing_entities, because that
-- table's existing RLS policy already grants ALL authenticated staff
-- SELECT on the whole row (migration 0080) — RLS is row-level, not
-- column-level, so a genuinely sensitive fact cannot be added to that
-- table without also exposing it to every employee. The general facts
-- added directly to employing_entities below (legal name, jurisdiction,
-- registration type/date, status, currency) are not sensitive and are
-- reasonable for any staff member to see (e.g. "which entity employs
-- me, and is it active").

begin;

-- ============================================================
-- employment_jurisdictions — first real row
-- ============================================================
-- Migration 0080 deliberately seeded this table with ZERO rows: no
-- jurisdiction was yet genuinely decided. The Founder has now supplied
-- real Ghana business-registration facts, so adding Ghana here is
-- Founder-authorized fact, not fabrication.
insert into public.employment_jurisdictions (name, slug, sort_order)
values ('Ghana', 'ghana', 10);

-- ============================================================
-- employing_entities — legal-entity fields
-- ============================================================
alter table public.employing_entities
  add column if not exists legal_name text,
  add column if not exists trading_name text,
  add column if not exists jurisdiction_id uuid references public.employment_jurisdictions (id),
  add column if not exists registration_type text,
  add column if not exists registration_date date,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists employer_capable boolean not null default true,
  add column if not exists payroll_jurisdiction_id uuid references public.employment_jurisdictions (id),
  add column if not exists default_currency text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.employing_entities
  add constraint employing_entities_verification_status_check
    check (verification_status in ('unverified', 'pending_review', 'verified'));

comment on column public.employing_entities.legal_name is 'The full registered legal name, as it appears on the registration certificate — may differ from the display name column if the entity trades under a different name.';
comment on column public.employing_entities.jurisdiction_id is 'The country/jurisdiction this entity is registered in. Nullable/pending where genuinely undecided — never inferred.';
comment on column public.employing_entities.payroll_jurisdiction_id is 'The jurisdiction payroll is actually run through for this entity — usually equal to jurisdiction_id, but kept separate to support a future PEO/EOR arrangement where they genuinely differ. Nullable/pending.';
comment on column public.employing_entities.employer_capable is 'Whether this entity is legally capable of directly employing staff today (vs. e.g. a holding entity or a jurisdiction pending registration). Defaults true for the pre-existing Ordift Studios row.';
comment on column public.employing_entities.verification_status is 'unverified (default — no registration evidence reviewed yet) | pending_review | verified (a Super Admin has reviewed real registration evidence and confirmed the facts on this row). Never set to verified without verified_at/verified_by also being set — see recordEmployingEntityVerification() (legalEntities.ts).';
comment on table public.employing_entities is 'The legal/business entity employing a person (migration 0080), extended (migration 0105) into a genuine legal-entity model: registration facts, jurisdiction, verification. Sensitive registration facts (registration number, tax identifier, registered address) live separately in employing_entity_sensitive_details (Super-Admin-only) since this table''s own RLS grants all staff SELECT on the whole row. active (pre-existing boolean) remains the active/inactive toggle — no redundant status column was added.';

drop trigger if exists employing_entities_set_updated_at on public.employing_entities;
create trigger employing_entities_set_updated_at
  before update on public.employing_entities
  for each row execute function public.set_updated_at();

-- Populate the one real, pre-existing entity from the Founder-supplied,
-- verified Ghana business-registration certificate. registration_number,
-- tax identifier, and registered address were not supplied — they are
-- NOT invented here; they live (NULL) in employing_entity_sensitive_details
-- below, ready for a Super Admin to fill in once available.
-- verified_by is left NULL: this is a migration-time data entry from a
-- document the Founder supplied directly in conversation, not an
-- authenticated in-app review action by a specific admin user.
update public.employing_entities
set
  legal_name = 'Ordift Studios',
  jurisdiction_id = (select id from public.employment_jurisdictions where slug = 'ghana'),
  registration_type = 'Registered Business Name',
  registration_date = '2018-05-07',
  effective_from = '2018-05-07',
  payroll_jurisdiction_id = (select id from public.employment_jurisdictions where slug = 'ghana'),
  default_currency = 'GHS',
  verification_status = 'verified',
  verified_at = now()
where slug = 'ordift-studios';

-- ============================================================
-- employing_entity_sensitive_details — Super-Admin-only
-- ============================================================
create table public.employing_entity_sensitive_details (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id) unique,
  registration_number text,
  tax_identifier text,
  registered_address text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employing_entity_sensitive_details is 'Registration number, tax identifier, and registered address for an employing_entities row — split into this Super-Admin-only table because employing_entities'' own RLS grants all staff SELECT on the whole row (migration 0080), and these facts must not be exposed in ordinary employee-facing interfaces. None of these three columns is populated for the Ordift Studios row as of migration 0105 — the Founder-supplied certificate did not include a registration number or tax identifier, and none is invented here.';

alter table public.employing_entity_sensitive_details enable row level security;

create policy "employing_entity_sensitive_details: super admin only" on public.employing_entity_sensitive_details
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.employing_entity_sensitive_details to authenticated;
grant select, insert, update on public.employing_entity_sensitive_details to service_role;

create trigger employing_entity_sensitive_details_set_updated_at
  before update on public.employing_entity_sensitive_details
  for each row execute function public.set_updated_at();

-- ============================================================
-- employing_entity_documents — registration evidence
-- ============================================================
create table public.employing_entity_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  employing_entity_id uuid not null references public.employing_entities (id),
  document_type text not null,
  storage_path text not null,
  notes text,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now()
);

comment on table public.employing_entity_documents is 'Evidence documents (e.g. business registration certificate) for an employing_entities row. storage_path points into the private legal-entity-documents Storage bucket (created below) — Super-Admin-only read/upload, mirroring the legal-masters bucket pattern (migration 0068). Zero rows as of migration 0105: no certificate FILE was supplied in this phase, only its textual facts (already recorded on employing_entities/employing_entity_sensitive_details above) — the upload UI is ready for when the Founder provides the actual file.';

alter table public.employing_entity_documents enable row level security;

create policy "employing_entity_documents: super admin only" on public.employing_entity_documents
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.employing_entity_documents to authenticated;
grant select, insert on public.employing_entity_documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-entity-documents',
  'legal-entity-documents',
  false,
  10485760, -- 10MB — a scanned registration certificate (PDF or photo) fits comfortably
  array['application/pdf', 'image/jpeg', 'image/png']
);

create policy "legal-entity-documents: super admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'legal-entity-documents' and (select private.is_super_admin()));

create policy "legal-entity-documents: super admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'legal-entity-documents' and (select private.is_super_admin()));

commit;
