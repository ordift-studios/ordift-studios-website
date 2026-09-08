-- Ordift Studios Legal Suite — LEGAL-SYS-1, Phase G (2026-09-08).
-- Releases/Rights foundation for OS-LGL-004 (Model/Talent), OS-LGL-005
-- (Property/Location), and OS-LGL-006 (RAW/Source Files) — additive
-- schema only. One row per agreement whose master is one of those
-- three codes. usage_rights/ai_synthetic_rights are stored as jsonb
-- (application-validated against src/lib/legal/rightsCatalogue.ts's
-- fixed category lists — the same "unconstrained column, app-level
-- enforcement" precedent already used throughout this Legal Suite).
--
-- AI/synthetic rights DEFAULT TO NOT GRANTED (continuation
-- authorization message) — the column default below is the database-
-- level backstop for that rule; the real enforcement is
-- createDefaultReleaseRights() (rightsCatalogue.ts), which every
-- insert path in rightsEngine.ts starts from.

begin;

create table public.agreement_releases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  master_code text not null,
  usage_rights jsonb not null default '{"portfolio":false,"organic_social":false,"paid_advertising":false,"website":false,"print":false,"third_party_transfer":false}',
  ai_synthetic_rights jsonb not null default '{"ai_training":false,"digital_replica":false,"synthetic_identity":false,"synthetic_voice":false,"face_replacement":false}',
  territory text,
  territory_detail text,
  duration text,
  duration_end_date date,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agreement_id)
);

comment on table public.agreement_releases is
  'One rights-grant row per release/licence agreement (OS-LGL-004/005/006). ai_synthetic_rights categories default to NOT GRANTED at every level (column default here, createDefaultReleaseRights() in application code) — a category is only ever true because an authorized administrator explicitly selected it against a real agreed release. Freely editable via setAgreementReleaseRights() only while the parent agreement is pre-issue (agreementLifecycle.ts); once issued, a change is recorded as an agreement_amendments row instead, never a silent UPDATE here.';

create index agreement_releases_agreement_id_idx on public.agreement_releases (agreement_id);
create index agreement_releases_master_code_idx on public.agreement_releases (master_code);

alter table public.agreement_releases enable row level security;

create policy "agreement_releases: admin or party read" on public.agreement_releases
  for select
  to authenticated
  using (
    (select private.is_admin_or_super_admin())
    or exists (select 1 from public.agreement_parties ap where ap.agreement_id = agreement_releases.agreement_id and ap.profile_id = (select auth.uid()))
  );

grant select on public.agreement_releases to authenticated;
grant select, insert, update, delete on public.agreement_releases to service_role;

create trigger agreement_releases_set_updated_at
  before update on public.agreement_releases
  for each row execute function public.set_updated_at();

commit;
