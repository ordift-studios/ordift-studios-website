-- Ordift Weddings & Events Pricing V1 + Corporate Priority Delivery
-- correction (2026-09-06)
--
-- INSPECTION SUMMARY:
--   - pricing_markets (0053/0054): all six markets reused directly, no
--     new market table, no market row touched.
--   - pricing_service_categories (0053): the existing 'wedding_event'
--     row is activated (active=true) for reference-tracking consistency
--     with 'personal_portrait'/'corporate_headshot' — cosmetic only,
--     not a functional dependency of the calculator below (which has
--     its own custom-quote routing).
--   - Table design deliberately avoids one micro-table per rate type.
--     Weddings and Events share an identical rate shape (market,
--     service mode, tier) and an identical add-on vocabulary, so they
--     are represented as two categories inside shared, normalized
--     tables (wedding_event_tier_rates / _tier_deliverables /
--     _priority_delivery_rates / _addon_rates / _percentage_rates)
--     rather than ~15 near-duplicate tables.
--   - corporate_priority_delivery_rates (0055): the approved correction
--     replaces a single global percentage with a per-scope percentage
--     (Individual/Executive/Team tiers). This is done ADDITIVELY — a
--     new nullable scope_slug column plus new versioned rows. The
--     original global row (scope_slug is null) is left completely
--     untouched; it is simply no longer read once the application code
--     always queries by scope_slug. No historical value is mutated.
--     Corporate base rates, team rates, minimum bookings, retouch
--     rates, and deliverables are NOT touched by this migration.
--   - additional_retouch_rates / corporate_retouch_rates / discount_codes
--     / discount_redemptions: completely untouched.
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is for every
--     write below — no new capability, no duplicate admin-role logic.
--
-- 0053, 0054 and 0055 are not modified by this file (0055's table is
-- only ALTERed additively — no existing column/row is changed). Every
-- statement below is additive (new tables, new column, new rows) or a
-- narrow, non-destructive data-activation UPDATE of a single
-- pre-existing reference row. No destructive statement (DROP/TRUNCATE/
-- DELETE) appears anywhere in this file.

begin;

-- Cosmetic/reference-only activation — see inspection summary above.
update public.pricing_service_categories
set active = true
where slug = 'wedding_event';

-- ============================================================
-- PART A — wedding_event_tier_rates (versioned, per market/category/mode/tier)
-- ============================================================
create table public.wedding_event_tier_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  category text not null check (category in ('wedding', 'event')),
  service_mode text not null check (service_mode in ('photography', 'film', 'photography_film')),
  tier_slug text not null,
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint wedding_event_tier_rates_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended'))
  )
);

comment on table public.wedding_event_tier_rates is
  'Versioned Weddings & Events base rates by market/category/service-mode/tier. Photography+Film rates are their own approved figures, never derived by summing Photography and Film — see the seed data below.';

create index wedding_event_tier_rates_lookup_idx on public.wedding_event_tier_rates (market_id, category, service_mode, tier_slug, effective_from desc);

alter table public.wedding_event_tier_rates enable row level security;

create policy "wedding_event_tier_rates: staff read" on public.wedding_event_tier_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.wedding_event_tier_rates to authenticated;
grant select, insert, update, delete on public.wedding_event_tier_rates to service_role;

-- Wedding — Photography (Section 4)
insert into public.wedding_event_tier_rates (market_id, category, service_mode, tier_slug, price_usd)
select id, 'wedding', 'photography', 'chapter', 400.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography', 'narrative', 750.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography', 'chronicle', 1150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography', 'archive', 1650.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography', 'chapter', 850.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography', 'narrative', 1500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography', 'chronicle', 2250.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography', 'archive', 3200.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography', 'chapter', 1100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography', 'narrative', 1850.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography', 'chronicle', 2650.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography', 'archive', 3750.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography', 'chapter', 1250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography', 'narrative', 2100.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography', 'chronicle', 3000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography', 'archive', 4250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography', 'chapter', 950.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography', 'narrative', 1650.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography', 'chronicle', 2400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography', 'archive', 3400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography', 'chapter', 900.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography', 'narrative', 1550.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography', 'chronicle', 2300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography', 'archive', 3300.00 from public.pricing_markets where slug = 'other_international_custom'
-- Wedding — Film (Section 5)
union all select id, 'wedding', 'film', 'chapter', 450.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'film', 'narrative', 850.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'film', 'chronicle', 1300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'film', 'archive', 1850.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'film', 'chapter', 950.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'film', 'narrative', 1700.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'film', 'chronicle', 2500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'film', 'archive', 3550.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'film', 'chapter', 1200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'film', 'narrative', 2000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'film', 'chronicle', 2900.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'film', 'archive', 4100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'film', 'chapter', 1350.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'film', 'narrative', 2300.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'film', 'chronicle', 3300.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'film', 'archive', 4650.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'film', 'chapter', 1050.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'film', 'narrative', 1800.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'film', 'chronicle', 2650.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'film', 'archive', 3750.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'film', 'chapter', 1000.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'film', 'narrative', 1700.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'film', 'chronicle', 2500.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'film', 'archive', 3600.00 from public.pricing_markets where slug = 'other_international_custom'
-- Wedding — Photography + Film (Section 6, own approved rates)
union all select id, 'wedding', 'photography_film', 'chapter', 750.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography_film', 'narrative', 1400.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography_film', 'chronicle', 2100.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography_film', 'archive', 3000.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'wedding', 'photography_film', 'chapter', 1600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography_film', 'narrative', 2850.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography_film', 'chronicle', 4250.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography_film', 'archive', 6000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'wedding', 'photography_film', 'chapter', 2000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography_film', 'narrative', 3400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography_film', 'chronicle', 5000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography_film', 'archive', 7000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'wedding', 'photography_film', 'chapter', 2250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography_film', 'narrative', 3900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography_film', 'chronicle', 5700.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography_film', 'archive', 8000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'wedding', 'photography_film', 'chapter', 1750.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography_film', 'narrative', 3000.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography_film', 'chronicle', 4500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography_film', 'archive', 6300.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'wedding', 'photography_film', 'chapter', 1650.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography_film', 'narrative', 2850.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography_film', 'chronicle', 4300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'wedding', 'photography_film', 'archive', 6100.00 from public.pricing_markets where slug = 'other_international_custom'
-- Event — Photography (Section 9)
union all select id, 'event', 'photography', 'focused', 175.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'half_day', 325.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'full_day', 575.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'extended', 850.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'focused', 350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'half_day', 650.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'full_day', 1100.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'extended', 1600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'focused', 450.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'half_day', 800.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'full_day', 1350.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'extended', 1950.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'focused', 500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'half_day', 900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'full_day', 1550.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'extended', 2250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'focused', 400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'half_day', 725.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'full_day', 1200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'extended', 1750.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'focused', 375.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography', 'half_day', 675.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography', 'full_day', 1150.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography', 'extended', 1650.00 from public.pricing_markets where slug = 'other_international_custom'
-- Event — Film (Section 10)
union all select id, 'event', 'film', 'focused', 225.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'half_day', 400.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'full_day', 700.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'extended', 1050.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'focused', 450.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'half_day', 800.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'full_day', 1350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'extended', 2000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'focused', 550.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'half_day', 950.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'full_day', 1650.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'extended', 2400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'focused', 625.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'half_day', 1100.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'full_day', 1900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'extended', 2750.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'focused', 500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'half_day', 850.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'full_day', 1450.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'extended', 2100.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'focused', 475.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'film', 'half_day', 825.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'film', 'full_day', 1400.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'film', 'extended', 2000.00 from public.pricing_markets where slug = 'other_international_custom'
-- Event — Photography + Film (Section 11, own approved rates)
union all select id, 'event', 'photography_film', 'focused', 350.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'half_day', 625.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'full_day', 1100.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'extended', 1600.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'focused', 700.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'half_day', 1250.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'full_day', 2150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'extended', 3150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'focused', 850.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'half_day', 1500.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'full_day', 2600.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'extended', 3800.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'focused', 975.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'half_day', 1750.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'full_day', 3000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'extended', 4350.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'focused', 775.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'half_day', 1350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'full_day', 2300.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'extended', 3350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'focused', 725.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography_film', 'half_day', 1300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography_film', 'full_day', 2200.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography_film', 'extended', 3200.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — wedding_event_tier_deliverables (global, versioned)
-- ============================================================
create table public.wedding_event_tier_deliverables (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('wedding', 'event')),
  tier_slug text not null,
  event_days integer not null check (event_days > 0),
  coverage_hours integer not null check (coverage_hours > 0),
  photographers integer not null check (photographers >= 0),
  filmmakers integer not null check (filmmakers >= 0),
  professionally_edited_images_min integer not null check (professionally_edited_images_min >= 0),
  signature_retouched_images integer not null check (signature_retouched_images >= 0),
  highlight_film_min_minutes numeric(4, 1),
  highlight_film_max_minutes numeric(4, 1),
  includes_documentary boolean not null default false,
  online_gallery boolean not null default true,
  planning_consultation boolean not null default false,
  priority_sneak_peek boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint wedding_event_tier_deliverables_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended'))
  )
);

comment on table public.wedding_event_tier_deliverables is
  'Minimum expected deliverables per collection/coverage-level — image/duration counts are floors, not caps. includes_documentary=true (Wedding Chronicle/Archive only) means a documentary film/component is already bundled, so the Full Event/Documentary Recording add-on must never be charged on top of it.';

create index wedding_event_tier_deliverables_lookup_idx on public.wedding_event_tier_deliverables (category, tier_slug, effective_from desc);

alter table public.wedding_event_tier_deliverables enable row level security;

create policy "wedding_event_tier_deliverables: staff read" on public.wedding_event_tier_deliverables
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.wedding_event_tier_deliverables to authenticated;
grant select, insert, update, delete on public.wedding_event_tier_deliverables to service_role;

insert into public.wedding_event_tier_deliverables
  (category, tier_slug, event_days, coverage_hours, photographers, filmmakers, professionally_edited_images_min, signature_retouched_images, highlight_film_min_minutes, highlight_film_max_minutes, includes_documentary, online_gallery, planning_consultation, priority_sneak_peek)
values
  ('wedding', 'chapter', 1, 4, 1, 1, 150, 10, 3, 4, false, true, true, false),
  ('wedding', 'narrative', 1, 8, 1, 1, 350, 20, 5, 7, false, true, true, true),
  ('wedding', 'chronicle', 1, 12, 2, 2, 550, 30, 8, 12, true, true, true, true),
  ('wedding', 'archive', 2, 16, 2, 2, 750, 40, 10, 15, true, true, true, true),
  ('event', 'focused', 1, 2, 1, 1, 75, 5, 1, 2, false, true, false, false),
  ('event', 'half_day', 1, 4, 1, 1, 150, 8, 2, 3, false, true, false, false),
  ('event', 'full_day', 1, 8, 1, 1, 300, 12, 3, 5, false, true, false, false),
  ('event', 'extended', 1, 12, 2, 2, 450, 18, 5, 7, false, true, false, false);

-- ============================================================
-- PART C — wedding_event_priority_delivery_rates (global, versioned)
-- ============================================================
create table public.wedding_event_priority_delivery_rates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('wedding', 'event')),
  tier_slug text not null,
  multiplier_percentage numeric(5, 2) not null check (multiplier_percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint wedding_event_priority_delivery_rates_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended'))
  )
);

comment on table public.wedding_event_priority_delivery_rates is
  'Priority Delivery percentage by category/tier — queue priority for finished post-production, never Same-Day Content. Off by default; applied to the eligible service subtotal + eligible post-production add-ons, before Priority itself.';

create index wedding_event_priority_delivery_rates_lookup_idx on public.wedding_event_priority_delivery_rates (category, tier_slug, effective_from desc);

alter table public.wedding_event_priority_delivery_rates enable row level security;

create policy "wedding_event_priority_delivery_rates: staff read" on public.wedding_event_priority_delivery_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.wedding_event_priority_delivery_rates to authenticated;
grant select, insert, update, delete on public.wedding_event_priority_delivery_rates to service_role;

insert into public.wedding_event_priority_delivery_rates (category, tier_slug, multiplier_percentage) values
  ('wedding', 'chapter', 35.00),
  ('wedding', 'narrative', 35.00),
  ('wedding', 'chronicle', 30.00),
  ('wedding', 'archive', 30.00),
  ('event', 'focused', 35.00),
  ('event', 'half_day', 35.00),
  ('event', 'full_day', 30.00),
  ('event', 'extended', 30.00);

-- ============================================================
-- PART D — wedding_event_addon_rates (versioned, per market)
-- ============================================================
create table public.wedding_event_addon_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  addon_slug text not null check (addon_slug in (
    'additional_photo_hour', 'additional_film_hour', 'additional_photofilm_hour',
    'additional_photographer_day', 'additional_filmmaker_day',
    'pre_wedding_session', 'drone',
    'same_day_photo_pack', 'same_day_highlight_film',
    'documentary_recording_minimum',
    'livestream_single_basic', 'livestream_multicam_standard',
    'raw_photo_guidance_minimum', 'raw_video_guidance_minimum',
    'keepsake_album', 'signature_album', 'archive_album', 'companion_album',
    'frame_small', 'frame_medium', 'frame_large', 'frame_statement',
    'presentation_drive'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.wedding_event_addon_rates is
  'A single, normalized table for every flat per-market Weddings & Events add-on (additional coverage/crew, pre-wedding, drone, same-day content, documentary/RAW minimums, livestream, physical products) — same shape, distinguished by addon_slug, instead of ~20 near-identical tables.';

create index wedding_event_addon_rates_lookup_idx on public.wedding_event_addon_rates (market_id, addon_slug, effective_from desc);

alter table public.wedding_event_addon_rates enable row level security;

create policy "wedding_event_addon_rates: staff read" on public.wedding_event_addon_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.wedding_event_addon_rates to authenticated;
grant select, insert, update, delete on public.wedding_event_addon_rates to service_role;

insert into public.wedding_event_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_photo_hour', 90.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_photo_hour', 175.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_photo_hour', 225.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_photo_hour', 250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_photo_hour', 200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_photo_hour', 190.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_film_hour', 100.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_film_hour', 200.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_film_hour', 250.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_film_hour', 275.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_film_hour', 225.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_film_hour', 210.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_photofilm_hour', 160.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_photofilm_hour', 320.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_photofilm_hour', 400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_photofilm_hour', 450.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_photofilm_hour', 360.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_photofilm_hour', 340.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_photographer_day', 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_photographer_day', 400.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_photographer_day', 500.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_photographer_day', 600.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_photographer_day', 450.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_photographer_day', 425.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_filmmaker_day', 225.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_filmmaker_day', 450.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_filmmaker_day', 550.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_filmmaker_day', 650.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_filmmaker_day', 500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_filmmaker_day', 475.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'pre_wedding_session', 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'pre_wedding_session', 350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'pre_wedding_session', 500.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'pre_wedding_session', 550.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'pre_wedding_session', 450.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'pre_wedding_session', 425.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'drone', 150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'drone', 275.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'drone', 350.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'drone', 400.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'drone', 325.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'drone', 300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'same_day_photo_pack', 150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'same_day_photo_pack', 300.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'same_day_photo_pack', 375.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'same_day_photo_pack', 450.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'same_day_photo_pack', 325.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'same_day_photo_pack', 325.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'same_day_highlight_film', 300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'same_day_highlight_film', 600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'same_day_highlight_film', 750.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'same_day_highlight_film', 900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'same_day_highlight_film', 650.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'same_day_highlight_film', 650.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'documentary_recording_minimum', 150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'documentary_recording_minimum', 300.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'documentary_recording_minimum', 400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'documentary_recording_minimum', 450.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'documentary_recording_minimum', 350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'documentary_recording_minimum', 350.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'livestream_single_basic', 400.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'livestream_single_basic', 750.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'livestream_single_basic', 950.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'livestream_single_basic', 1100.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'livestream_single_basic', 850.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'livestream_single_basic', 800.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'livestream_multicam_standard', 750.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'livestream_multicam_standard', 1400.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'livestream_multicam_standard', 1750.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'livestream_multicam_standard', 2000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'livestream_multicam_standard', 1550.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'livestream_multicam_standard', 1500.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'raw_photo_guidance_minimum', 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'raw_photo_guidance_minimum', 350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'raw_photo_guidance_minimum', 450.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'raw_photo_guidance_minimum', 500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'raw_photo_guidance_minimum', 400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'raw_photo_guidance_minimum', 400.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'raw_video_guidance_minimum', 300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'raw_video_guidance_minimum', 500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'raw_video_guidance_minimum', 650.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'raw_video_guidance_minimum', 750.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'raw_video_guidance_minimum', 600.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'raw_video_guidance_minimum', 600.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'keepsake_album', 125.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'keepsake_album', 225.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'keepsake_album', 350.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'keepsake_album', 400.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'keepsake_album', 300.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'keepsake_album', 300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'signature_album', 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'signature_album', 350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'signature_album', 550.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'signature_album', 625.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'signature_album', 475.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'signature_album', 475.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'archive_album', 325.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'archive_album', 550.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'archive_album', 850.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'archive_album', 950.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'archive_album', 725.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'archive_album', 725.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'companion_album', 85.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'companion_album', 150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'companion_album', 225.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'companion_album', 250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'companion_album', 200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'companion_album', 200.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'frame_small', 50.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'frame_small', 90.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'frame_small', 100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'frame_small', 110.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'frame_small', 95.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'frame_small', 95.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'frame_medium', 75.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'frame_medium', 125.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'frame_medium', 150.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'frame_medium', 165.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'frame_medium', 140.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'frame_medium', 140.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'frame_large', 110.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'frame_large', 175.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'frame_large', 225.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'frame_large', 250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'frame_large', 210.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'frame_large', 210.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'frame_statement', 150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'frame_statement', 225.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'frame_statement', 300.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'frame_statement', 325.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'frame_statement', 275.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'frame_statement', 275.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'presentation_drive', 35.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'presentation_drive', 55.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'presentation_drive', 65.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'presentation_drive', 70.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'presentation_drive', 60.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'presentation_drive', 60.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART E — wedding_event_percentage_rates (global, versioned)
-- ============================================================
create table public.wedding_event_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in (
    'corporate_organisational_scope', 'documentary_recording', 'raw_photo_guidance', 'raw_video_guidance'
  )),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.wedding_event_percentage_rates is
  'Global (non-market-scoped) formula percentages: Corporate/Organisational Event production-scope adjustment (+20%, applied only when explicitly requested — never merely because a company is the client), Full Event/Documentary Recording fee (20% of the market/tier''s Film-only rate), and RAW/source-file Admin guidance percentages (25% photo, 35% video). Each formula''s $ minimum lives in wedding_event_addon_rates instead, since minimums are market-specific.';

alter table public.wedding_event_percentage_rates enable row level security;

create policy "wedding_event_percentage_rates: staff read" on public.wedding_event_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.wedding_event_percentage_rates to authenticated;
grant select, insert, update, delete on public.wedding_event_percentage_rates to service_role;

insert into public.wedding_event_percentage_rates (percentage_slug, percentage) values
  ('corporate_organisational_scope', 20.00),
  ('documentary_recording', 20.00),
  ('raw_photo_guidance', 25.00),
  ('raw_video_guidance', 35.00);

-- ============================================================
-- PART F — Corporate Priority Delivery correction (approved,
-- additive-only alteration of the 0055 table)
-- ============================================================
-- Replaces the single global +35% with a per-scope percentage. The
-- original global row (scope_slug is null) is left completely
-- untouched — it simply becomes unused once application code always
-- reads/writes with an explicit scope_slug. No historical value is
-- mutated, and no other Corporate table (base rates, team rates,
-- minimum bookings, retouch rates, deliverables) is touched.
alter table public.corporate_priority_delivery_rates
  add column scope_slug text;

alter table public.corporate_priority_delivery_rates
  add constraint corporate_priority_delivery_rates_scope_slug_check
  check (scope_slug is null or scope_slug in ('individual_headshot', 'executive_portrait', 'team_2_5', 'team_6_10', 'team_11_25', 'team_26_50'));

create index corporate_priority_delivery_rates_scope_idx on public.corporate_priority_delivery_rates (scope_slug, effective_from desc);

comment on column public.corporate_priority_delivery_rates.scope_slug is
  'Approved correction (2026-09-06): Priority Delivery now varies by Corporate product/team-tier rather than a single global percentage. NULL only on the original pre-correction global row, which is no longer read.';

insert into public.corporate_priority_delivery_rates (scope_slug, multiplier_percentage) values
  ('individual_headshot', 40.00),
  ('executive_portrait', 40.00),
  ('team_2_5', 40.00),
  ('team_6_10', 40.00),
  ('team_11_25', 40.00),
  ('team_26_50', 30.00);

commit;
