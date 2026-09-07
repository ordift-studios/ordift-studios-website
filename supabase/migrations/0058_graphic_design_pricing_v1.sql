-- Ordift Graphic Design Pricing V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - pricing_markets (0053/0054): all six markets reused directly.
--   - pricing_service_categories (0053): unlike corporate_headshot/
--     wedding_event/commercial_advertising, NO 'graphic_design' row was
--     originally seeded in 0053 — the four original placeholders were
--     personal_portrait, corporate_headshot, wedding_event, and
--     commercial_advertising only. This migration therefore INSERTs a
--     new 'graphic_design' row (active=true) rather than activating an
--     existing one — additive, not a correction of a prior omission.
--   - Deliverable rates and addon rates (additional page/slide,
--     revision/source-file minimums) are market-scoped (six markets,
--     matching every prior family). Complexity factors and the four
--     global percentages (priority/urgent/additional-revision/
--     editable-source-file) are deliberately global, matching the
--     approved spec's single figures.
--   - Printing/production and Packaging have NO seeded rates by design
--     — the approved spec explicitly forbids inventing them; both
--     remain Custom/Request Estimate in the application layer, with no
--     corresponding table row at all.
--   - Cross-service recommendations (Part L/M of the authorization) are
--     a static, code-level configuration (src/lib/services/
--     crossServiceRecommendations.ts) — no database table, since they
--     carry no price and require no versioning.
--   - Cross-service discounts (Part N) are NOT implemented — no table,
--     no new discount_codes column. See that module's own doc comment
--     for the documented, unbuilt extension point.
--   - discount_codes/discount_redemptions (0053): completely untouched.
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is — no new
--     capability.
--
-- 0053-0057 are not modified. Every statement below is additive (new
-- tables, one new reference-category row). No destructive statement
-- appears anywhere in this file.

begin;

insert into public.pricing_service_categories (slug, name, active, requires_custom_quote)
values ('graphic_design', 'Graphic Design', true, false)
on conflict (slug) do update set active = true;

-- ============================================================
-- PART A — graphic_design_deliverable_rates (versioned, per market)
-- ============================================================
create table public.graphic_design_deliverable_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  deliverable_slug text not null check (deliverable_slug in (
    'flyer_poster', 'digital_ad', 'social_single', 'social_set_5', 'social_set_10', 'presentation', 'brochure'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.graphic_design_deliverable_rates is
  'Base Graphic Design deliverable price by market. Brochure includes up to 8 pages, Presentation up to 10 slides — additional pages/slides are priced separately via graphic_design_addon_rates, never a new package row per count. social_set_10 is its own approved package rate, never derived as 10 x social_single.';

create index graphic_design_deliverable_rates_lookup_idx on public.graphic_design_deliverable_rates (market_id, deliverable_slug, effective_from desc);

alter table public.graphic_design_deliverable_rates enable row level security;

create policy "graphic_design_deliverable_rates: staff read" on public.graphic_design_deliverable_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.graphic_design_deliverable_rates to authenticated;
grant select, insert, update, delete on public.graphic_design_deliverable_rates to service_role;

insert into public.graphic_design_deliverable_rates (market_id, deliverable_slug, price_usd)
select id, 'flyer_poster', 45.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'flyer_poster', 125.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'flyer_poster', 175.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'flyer_poster', 200.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'flyer_poster', 150.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'flyer_poster', 145.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'digital_ad', 40.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'digital_ad', 110.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'digital_ad', 150.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'digital_ad', 175.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'digital_ad', 135.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'digital_ad', 130.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'social_single', 30.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'social_single', 75.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'social_single', 100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'social_single', 120.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'social_single', 90.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'social_single', 85.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'social_set_5', 125.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'social_set_5', 300.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'social_set_5', 400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'social_set_5', 475.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'social_set_5', 350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'social_set_5', 340.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'social_set_10', 225.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'social_set_10', 525.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'social_set_10', 700.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'social_set_10', 825.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'social_set_10', 625.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'social_set_10', 600.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'presentation', 175.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'presentation', 400.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'presentation', 550.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'presentation', 650.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'presentation', 500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'presentation', 475.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'brochure', 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'brochure', 550.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'brochure', 750.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'brochure', 900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'brochure', 675.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'brochure', 650.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — graphic_design_complexity_factors (global, versioned)
-- ============================================================
create table public.graphic_design_complexity_factors (
  id uuid primary key default gen_random_uuid(),
  complexity text not null check (complexity in ('standard', 'enhanced', 'bespoke')),
  factor numeric(4, 2) not null check (factor > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.graphic_design_complexity_factors is
  'Standard 1.00x / Enhanced 1.30x / Bespoke-Art-Directed 1.65x. Bespoke additionally always flags requiresCreativeReview in the calculator — this factor is an indicative multiplier, not a substitute for that review.';

alter table public.graphic_design_complexity_factors enable row level security;

create policy "graphic_design_complexity_factors: staff read" on public.graphic_design_complexity_factors
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.graphic_design_complexity_factors to authenticated;
grant select, insert, update, delete on public.graphic_design_complexity_factors to service_role;

insert into public.graphic_design_complexity_factors (complexity, factor) values
  ('standard', 1.00),
  ('enhanced', 1.30),
  ('bespoke', 1.65);

-- ============================================================
-- PART C — graphic_design_addon_rates (versioned, per market)
-- ============================================================
create table public.graphic_design_addon_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  addon_slug text not null check (addon_slug in (
    'additional_brochure_page', 'additional_presentation_slide', 'additional_revision_minimum', 'editable_source_file_minimum'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.graphic_design_addon_rates is
  'Market-scoped Graphic Design add-on rates: per-unit brochure/presentation scaling, and the dollar minimums for additional revision rounds and editable source file release (the percentages themselves live in graphic_design_percentage_rates, applied against the applicable design fee, then floored at these minimums).';

create index graphic_design_addon_rates_lookup_idx on public.graphic_design_addon_rates (market_id, addon_slug, effective_from desc);

alter table public.graphic_design_addon_rates enable row level security;

create policy "graphic_design_addon_rates: staff read" on public.graphic_design_addon_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.graphic_design_addon_rates to authenticated;
grant select, insert, update, delete on public.graphic_design_addon_rates to service_role;

insert into public.graphic_design_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_brochure_page', 20.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_brochure_page', 45.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_brochure_page', 60.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_brochure_page', 70.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_brochure_page', 55.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_brochure_page', 50.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_presentation_slide', 12.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_presentation_slide', 25.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_presentation_slide', 35.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_presentation_slide', 40.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_presentation_slide', 30.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_presentation_slide', 30.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_revision_minimum', 20.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_revision_minimum', 50.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_revision_minimum', 70.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_revision_minimum', 80.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_revision_minimum', 60.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_revision_minimum', 60.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'editable_source_file_minimum', 30.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'editable_source_file_minimum', 75.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'editable_source_file_minimum', 100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'editable_source_file_minimum', 125.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'editable_source_file_minimum', 90.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'editable_source_file_minimum', 90.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART D — graphic_design_percentage_rates (global, versioned)
-- ============================================================
create table public.graphic_design_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in ('priority', 'urgent', 'additional_revision', 'editable_source_file')),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.graphic_design_percentage_rates is
  'Global Graphic Design percentages: priority +30%, urgent (<48h) +40% (both applied to the applicable design fee; same-day/emergency has no automatic percentage and always requires Custom Confirmation), additional_revision +15% (per additional round, floored at the market minimum), editable_source_file +25% (floored at the market minimum).';

alter table public.graphic_design_percentage_rates enable row level security;

create policy "graphic_design_percentage_rates: staff read" on public.graphic_design_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.graphic_design_percentage_rates to authenticated;
grant select, insert, update, delete on public.graphic_design_percentage_rates to service_role;

insert into public.graphic_design_percentage_rates (percentage_slug, percentage) values
  ('priority', 30.00),
  ('urgent', 40.00),
  ('additional_revision', 15.00),
  ('editable_source_file', 25.00);

commit;
