-- Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08).
-- Business-line-inactive foundation only — additive schema, no public
-- launch, no real talent onboarded, no default commission/rate values
-- anywhere in this migration. Extends the EXISTING model_profiles/
-- `model` role/External Workforce classification (Phase H.1/H.2,
-- 2026-09-04 — see src/lib/portal/externalWorkforce.ts) rather than
-- creating a rival parallel "talent_profiles" table: model_profiles
-- was deliberately built thin ("Talent Management's full booking/
-- application/portfolio platform remains out of scope"), and this
-- migration is that platform's real foundation. Zero rows exist in
-- model_profiles in Production as of this migration (confirmed via a
-- read-only count immediately before writing it), so every additive
-- column below is risk-free.
--
-- Booking/compensation continues to reuse public.engagements/
-- payment_obligations/payee_profiles (Universal Payables, migration
-- 0049) — no parallel booking table is created here, per the master
-- prompt's own "booking architecture reuse" instruction.

begin;

-- ============================================================
-- model_profiles: representation-state extension
-- ============================================================
alter table public.model_profiles
  add column representation_status text not null default 'unrepresented',
  add column representation_status_changed_at timestamptz,
  add column representation_status_changed_by uuid references public.profiles (id);

comment on column public.model_profiles.representation_status is
  'See REPRESENTATION_STATUSES in src/lib/talent/talentRepresentation.ts — unrepresented/exclusive/non_exclusive/lapsed. Orthogonal to the existing status column (pending/active/inactive, account-standing) — this tracks the representation RELATIONSHIP, never account access.';

-- ============================================================
-- talent_categories — admin-configurable lookup, mirrors
-- operational_titles' exact shape (migration 0009). Seeded with ZERO
-- rows — no taxonomy is invented here; real categories are added by
-- an administrator against real business classification.
-- ============================================================
create table public.talent_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

alter table public.talent_categories enable row level security;

create policy "talent_categories: admin read" on public.talent_categories
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.talent_categories to authenticated;
grant select, insert, update, delete on public.talent_categories to service_role;

-- ============================================================
-- talent_profile_categories — many-to-many
-- ============================================================
create table public.talent_profile_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.talent_categories (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (profile_id, category_id)
);

alter table public.talent_profile_categories enable row level security;

create policy "talent_profile_categories: admin or own read" on public.talent_profile_categories
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()) or profile_id = (select auth.uid()));

grant select on public.talent_profile_categories to authenticated;
grant select, insert, update, delete on public.talent_profile_categories to service_role;

-- ============================================================
-- talent_commercial_terms — configurable commission/fee structure.
-- ONE row per talent. commission_value is NEVER defaulted to a
-- nonzero value anywhere (column default is null; app-layer
-- validateCommercialTerms() in src/lib/talent/talentCommercialTerms.ts
-- refuses a non-"none" commission_type with a null value) — every real
-- value here reflects an explicit, real, negotiated term. Admin-tier
-- only (narrowest safe default for financial terms — no Client/Talent
-- Portal read policy yet, matching payment_obligations' own general
-- admin-scoped precedent).
-- ============================================================
create table public.talent_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  commission_type text not null default 'none',
  commission_value numeric(10, 2),
  currency text,
  notes text,
  set_at timestamptz,
  set_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

comment on table public.talent_commercial_terms is
  'commission_type: none | flat_fee | percentage (TALENT_COMMISSION_TYPES, src/lib/talent/talentCommercialTerms.ts). commission_value is null by default and stays null for "none" — never a fabricated default rate.';

alter table public.talent_commercial_terms enable row level security;

create policy "talent_commercial_terms: admin read" on public.talent_commercial_terms
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.talent_commercial_terms to authenticated;
grant select, insert, update, delete on public.talent_commercial_terms to service_role;

create trigger talent_commercial_terms_set_updated_at
  before update on public.talent_commercial_terms
  for each row execute function public.set_updated_at();

-- ============================================================
-- talent_opportunities — internal casting/opportunity foundation.
-- Never publicly listed (Part: "no public launch") — admin-tier read
-- only, no anon/authenticated-broad grant.
-- ============================================================
create table public.talent_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  title text not null,
  description text,
  category_id uuid references public.talent_categories (id),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.talent_opportunities is
  'status: see TALENT_OPPORTUNITY_STATUSES in src/lib/talent/talentOpportunityLifecycle.ts — draft/open/closed/filled/cancelled. Internal-only foundation — no public listing surface, no application/casting-submission workflow exists yet.';

alter table public.talent_opportunities enable row level security;

create policy "talent_opportunities: admin read" on public.talent_opportunities
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()));

grant select on public.talent_opportunities to authenticated;
grant select, insert, update, delete on public.talent_opportunities to service_role;

create trigger talent_opportunities_set_updated_at
  before update on public.talent_opportunities
  for each row execute function public.set_updated_at();

-- ============================================================
-- talent_media_assets — private media relationships. References
-- objects in the new talent-media Storage bucket below; this table
-- and the bucket exist as architecture only — no real upload UI is
-- wired in this phase (same "foundation ready, UI deferred" precedent
-- already established for Portfolio's Photographer upload path).
-- ============================================================
create table public.talent_media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  media_type text not null,
  caption text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

comment on table public.talent_media_assets is
  'media_type: see TALENT_MEDIA_TYPES in src/lib/talent/talentMediaCatalogue.ts — portfolio_image/portfolio_video/comp_card/other.';

alter table public.talent_media_assets enable row level security;

create policy "talent_media_assets: admin or own read" on public.talent_media_assets
  for select
  to authenticated
  using ((select private.is_admin_or_super_admin()) or profile_id = (select auth.uid()));

grant select on public.talent_media_assets to authenticated;
grant select, insert, update, delete on public.talent_media_assets to service_role;

-- ============================================================
-- talent-media private Storage bucket — same pattern as
-- legal-masters (migration 0068): public:false, admin-tier RLS only.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-media',
  'talent-media',
  false,
  26214400, -- 25MB — headroom for portfolio images/short video, well under Supabase's hard cap
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
);

create policy "talent-media: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'talent-media' and (select private.is_admin_or_super_admin()));

create policy "talent-media: admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'talent-media' and (select private.is_admin_or_super_admin()));

commit;
