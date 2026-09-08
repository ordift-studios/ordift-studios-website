-- Ordift Talent — TALENT-SYS-2B, Phase 1 (2026-09-08).
-- Data model foundation for the approved consolidated design (Atelier
-- influence for public entry, Grid for roster/profile architecture,
-- Dossier for shortlist/compare). Additive only. Zero model_profiles
-- rows exist in Production as of this migration.

begin;

-- ============================================================
-- model_profiles: publication state
-- ============================================================
-- Mirrors portfolioProject's own status vocabulary exactly (Sanity
-- schema, src/sanity/schemaTypes/documents/portfolioProject.ts) for a
-- consistent lifecycle language across the whole site: draft ->
-- pending_review -> approved -> published -> archived. Creating a
-- talent record NEVER publishes it (Part 28) — publication_status
-- starts at 'draft' and only a deliberate admin transition can move it
-- to 'published', which is the only status the public roster query
-- will ever read.
alter table public.model_profiles
  add column publication_status text not null default 'draft',
  add column publication_status_changed_at timestamptz,
  add column publication_status_changed_by uuid references public.profiles (id);

comment on column public.model_profiles.publication_status is
  'See TALENT_PUBLICATION_STATUSES in src/lib/talent/talentPublicationLifecycle.ts. Orthogonal to representation_status (TALENT-SYS-1) and to the base status column (account standing) — three independent facts, never collapsed into one field (Part 20).';

-- ============================================================
-- talent_measurements — Info tab data. 1:1 with model_profiles.
-- Casting-relevant facts only — never financial/legal/internal data
-- (Part 12/29). Admin-tier read + the talent's own read (Part 3 of the
-- design brief: a talent may see their own measurements).
-- ============================================================
create table public.talent_measurements (
  id uuid primary key references public.model_profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  height_cm numeric(5, 1),
  bust_cm numeric(5, 1),
  waist_cm numeric(5, 1),
  hip_cm numeric(5, 1),
  shoe_eu numeric(4, 1),
  hair_color text,
  eye_color text,
  languages text[] not null default '{}',
  travel_ready boolean,
  location text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

comment on table public.talent_measurements is
  'Casting-relevant Info-tab facts (height/measurements/hair/eyes/languages/travel/location). Never includes contact details, banking/payment destinations, internal notes, or anything else Part 29 lists as never-public — those stay on their existing private tables.';

alter table public.talent_measurements enable row level security;

create policy "talent_measurements: admin or own read" on public.talent_measurements
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()) or id = (select auth.uid()));

grant select on public.talent_measurements to authenticated;
grant select, insert, update, delete on public.talent_measurements to service_role;

create trigger talent_measurements_set_updated_at
  before update on public.talent_measurements
  for each row execute function public.set_updated_at();

commit;
