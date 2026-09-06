-- Ordift Commercial / Advertising Pricing V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - pricing_markets (0053/0054): all six markets reused directly.
--   - pricing_service_categories (0053): the existing
--     'commercial_advertising' row is activated (active=true) for
--     reference-tracking consistency with the other families —
--     cosmetic only, not a functional dependency of the calculator.
--   - Creative Fee rates and Catalogue base/minimum rates and Review
--     thresholds are market-scoped (six markets), matching every prior
--     family. Licensing factors (usage/duration/territory/exclusivity),
--     catalogue volume/complexity factors, post-production reference
--     rates, and the two global percentages (Commercial Priority +35%,
--     Licensing Floor 15%) are deliberately NOT market-scoped — the
--     approved spec gives these as single global figures, and usage
--     territory is an explicitly different concept from production
--     market (never inferred from shoot location).
--   - Talent Fee / Talent Usage Fee and general Production Budget are
--     NOT represented as rate tables at all, per explicit instruction
--     not to hardcode global supplier/talent prices in V1 — they are
--     Admin/known-amount numeric inputs the calculator accepts, never
--     values looked up from a public price list.
--   - discount_codes/discount_redemptions (0053): untouched.
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is — no new
--     capability.
--
-- 0053-0056 are not modified. Every statement below is additive (new
-- tables) or a narrow, non-destructive activation UPDATE of a single
-- pre-existing reference row. No destructive statement appears
-- anywhere in this file.

begin;

update public.pricing_service_categories
set active = true
where slug = 'commercial_advertising';

-- ============================================================
-- PART A — commercial_creative_fee_rates (versioned, per market/mode/scope)
-- ============================================================
create table public.commercial_creative_fee_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  service_mode text not null check (service_mode in ('photography', 'film', 'photography_film')),
  scope_slug text not null check (scope_slug in ('focused', 'full_day', 'extended')),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_creative_fee_rates is
  'Ordift''s Commercial creative/production leadership fee — the licensing basis and the "creative fee" input to calculateCommercialProductionEstimate(). Does NOT include supplier-dependent production expenses or any commercial usage rights. Photography+Film is its own approved figure, never derived by summing Photography and Film.';

create index commercial_creative_fee_rates_lookup_idx on public.commercial_creative_fee_rates (market_id, service_mode, scope_slug, effective_from desc);

alter table public.commercial_creative_fee_rates enable row level security;

create policy "commercial_creative_fee_rates: staff read" on public.commercial_creative_fee_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_creative_fee_rates to authenticated;
grant select, insert, update, delete on public.commercial_creative_fee_rates to service_role;

insert into public.commercial_creative_fee_rates (market_id, service_mode, scope_slug, price_usd)
select id, 'photography', 'focused', 450.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography', 'full_day', 800.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography', 'extended', 1150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography', 'focused', 900.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography', 'full_day', 1600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography', 'extended', 2300.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography', 'focused', 1250.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography', 'full_day', 2200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography', 'extended', 3200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography', 'focused', 1400.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography', 'full_day', 2500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography', 'extended', 3600.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography', 'focused', 1100.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography', 'full_day', 1900.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography', 'extended', 2750.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography', 'focused', 1000.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'photography', 'full_day', 1800.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'photography', 'extended', 2600.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'film', 'focused', 600.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'film', 'full_day', 1050.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'film', 'extended', 1500.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'film', 'focused', 1200.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'film', 'full_day', 2100.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'film', 'extended', 3000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'film', 'focused', 1600.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'film', 'full_day', 2800.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'film', 'extended', 4000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'film', 'focused', 1800.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'film', 'full_day', 3100.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'film', 'extended', 4500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'film', 'focused', 1400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'film', 'full_day', 2450.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'film', 'extended', 3500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'film', 'focused', 1300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'film', 'full_day', 2300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'film', 'extended', 3300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'photography_film', 'focused', 900.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography_film', 'full_day', 1600.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography_film', 'extended', 2300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'photography_film', 'focused', 1800.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography_film', 'full_day', 3200.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography_film', 'extended', 4600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'photography_film', 'focused', 2400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography_film', 'full_day', 4200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography_film', 'extended', 6100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'photography_film', 'focused', 2700.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography_film', 'full_day', 4700.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography_film', 'extended', 6800.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'photography_film', 'focused', 2100.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography_film', 'full_day', 3700.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography_film', 'extended', 5350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'photography_film', 'focused', 1950.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'photography_film', 'full_day', 3450.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'photography_film', 'extended', 5000.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — commercial_catalogue_base_rates / minimum rates (versioned, per market)
-- ============================================================
create table public.commercial_catalogue_base_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_catalogue_base_rates is
  'Product/E-Commerce catalogue base rate per finished image (1-10 image tier), by market. catalogueSubtotal = quantity x this rate x complexityFactor x volumeFactor, then MAX against commercial_catalogue_minimum_rates.';

create index commercial_catalogue_base_rates_market_idx on public.commercial_catalogue_base_rates (market_id, effective_from desc);

alter table public.commercial_catalogue_base_rates enable row level security;

create policy "commercial_catalogue_base_rates: staff read" on public.commercial_catalogue_base_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_catalogue_base_rates to authenticated;
grant select, insert, update, delete on public.commercial_catalogue_base_rates to service_role;

insert into public.commercial_catalogue_base_rates (market_id, price_usd)
select id, 25.00 from public.pricing_markets where slug = 'ghana'
union all select id, 40.00 from public.pricing_markets where slug = 'qatar'
union all select id, 45.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 55.00 from public.pricing_markets where slug = 'north_america'
union all select id, 45.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 40.00 from public.pricing_markets where slug = 'other_international_custom';

create table public.commercial_catalogue_minimum_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  minimum_usd numeric(10, 2) not null check (minimum_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_catalogue_minimum_rates is
  'Minimum catalogue production fee floor, by market. Final catalogue fee = MAX(catalogueSubtotal, this value).';

create index commercial_catalogue_minimum_rates_market_idx on public.commercial_catalogue_minimum_rates (market_id, effective_from desc);

alter table public.commercial_catalogue_minimum_rates enable row level security;

create policy "commercial_catalogue_minimum_rates: staff read" on public.commercial_catalogue_minimum_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_catalogue_minimum_rates to authenticated;
grant select, insert, update, delete on public.commercial_catalogue_minimum_rates to service_role;

insert into public.commercial_catalogue_minimum_rates (market_id, minimum_usd)
select id, 200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 450.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 400.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 400.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART C — commercial_catalogue_volume_factors / complexity_factors
-- (global, versioned — not market-scoped)
-- ============================================================
create table public.commercial_catalogue_volume_factors (
  id uuid primary key default gen_random_uuid(),
  tier_slug text not null check (tier_slug in ('1-10', '11-25', '26-50', '51-100')),
  min_quantity integer not null,
  max_quantity integer not null,
  factor numeric(4, 2) not null check (factor > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_catalogue_volume_factors is
  'Catalogue volume discount factor by quantity tier. 101+ has no row by design — always routes to a Custom Volume Proposal, never auto-priced.';

alter table public.commercial_catalogue_volume_factors enable row level security;

create policy "commercial_catalogue_volume_factors: staff read" on public.commercial_catalogue_volume_factors
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_catalogue_volume_factors to authenticated;
grant select, insert, update, delete on public.commercial_catalogue_volume_factors to service_role;

insert into public.commercial_catalogue_volume_factors (tier_slug, min_quantity, max_quantity, factor) values
  ('1-10', 1, 10, 1.00),
  ('11-25', 11, 25, 0.90),
  ('26-50', 26, 50, 0.80),
  ('51-100', 51, 100, 0.70);

create table public.commercial_catalogue_complexity_factors (
  id uuid primary key default gen_random_uuid(),
  complexity text not null check (complexity in ('clean', 'premium')),
  factor numeric(4, 2) not null check (factor > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_catalogue_complexity_factors is
  'Catalogue complexity multiplier. Styled/Creative Product is NOT a valid catalogue complexity at all — it has no row here and always routes to the normal Commercial Production calculator instead.';

alter table public.commercial_catalogue_complexity_factors enable row level security;

create policy "commercial_catalogue_complexity_factors: staff read" on public.commercial_catalogue_complexity_factors
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_catalogue_complexity_factors to authenticated;
grant select, insert, update, delete on public.commercial_catalogue_complexity_factors to service_role;

insert into public.commercial_catalogue_complexity_factors (complexity, factor) values
  ('clean', 1.00),
  ('premium', 1.75);

-- ============================================================
-- PART D — commercial_postproduction_rates (global, versioned)
-- ============================================================
create table public.commercial_postproduction_rates (
  id uuid primary key default gen_random_uuid(),
  item_slug text not null check (item_slug in (
    'additional_finished_image', 'advanced_retouch', 'high_end_retouch', 'creative_composite',
    'cutdown_15s', 'cutdown_30s', 'alternate_edit_60s', 'vertical_adaptation',
    'aspect_ratio_adaptation', 'caption_master', 'motion_graphics_basic', 'revision_round'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  is_from_price boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_postproduction_rates is
  'Admin-editable Commercial still-image and film post-production reference rates — deliberately global (the approved spec gives single figures, not per-market). is_from_price=true (Creative Composite, Basic Motion Graphics) marks an indicative minimum only; Advanced Motion Graphics/VFX has no row and always routes to Custom Proposal.';

alter table public.commercial_postproduction_rates enable row level security;

create policy "commercial_postproduction_rates: staff read" on public.commercial_postproduction_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_postproduction_rates to authenticated;
grant select, insert, update, delete on public.commercial_postproduction_rates to service_role;

insert into public.commercial_postproduction_rates (item_slug, price_usd, is_from_price) values
  ('additional_finished_image', 25.00, false),
  ('advanced_retouch', 60.00, false),
  ('high_end_retouch', 100.00, false),
  ('creative_composite', 150.00, true),
  ('cutdown_15s', 150.00, false),
  ('cutdown_30s', 225.00, false),
  ('alternate_edit_60s', 350.00, false),
  ('vertical_adaptation', 100.00, false),
  ('aspect_ratio_adaptation', 50.00, false),
  ('caption_master', 75.00, false),
  ('motion_graphics_basic', 250.00, true),
  ('revision_round', 150.00, false);

-- ============================================================
-- PART E — commercial_percentage_rates (global, versioned)
-- ============================================================
create table public.commercial_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in ('priority_postproduction', 'licensing_floor')),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_percentage_rates is
  'Global Commercial percentages: priority_postproduction (+35%, applied only to the eligible post-production subtotal — never Creative Fee, licence, or any production/talent line) and licensing_floor (15% of the applicable Creative Fee, the minimum Ordift Usage Licence).';

alter table public.commercial_percentage_rates enable row level security;

create policy "commercial_percentage_rates: staff read" on public.commercial_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_percentage_rates to authenticated;
grant select, insert, update, delete on public.commercial_percentage_rates to service_role;

insert into public.commercial_percentage_rates (percentage_slug, percentage) values
  ('priority_postproduction', 35.00),
  ('licensing_floor', 15.00);

-- ============================================================
-- PART F — commercial_licensing_factors (global, versioned)
-- ============================================================
create table public.commercial_licensing_factors (
  id uuid primary key default gen_random_uuid(),
  factor_type text not null check (factor_type in ('usage', 'duration', 'territory', 'exclusivity')),
  factor_slug text not null,
  factor_value numeric(5, 2) not null check (factor_value > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint commercial_licensing_factors_slug_check check (
    (factor_type = 'usage' and factor_slug in ('internal_trade_presentation', 'website_organic_social', 'pr_editorial_earned_media', 'paid_digital_advertising', 'print_advertising', 'paid_digital_print_campaign', 'packaging_pos', 'ooh_billboard', 'broadcast_streaming_advertising', 'integrated_multimedia_campaign'))
    or (factor_type = 'duration' and factor_slug in ('3_months', '6_months', '12_months', '24_months', '36_months', '5_years'))
    or (factor_type = 'territory' and factor_slug in ('local_city', 'national', 'regional_multicountry', 'international', 'worldwide'))
    or (factor_type = 'exclusivity' and factor_slug in ('non_exclusive', 'category_exclusive', 'full_exclusive'))
  )
);

comment on table public.commercial_licensing_factors is
  'Usage/Duration/Territory/Exclusivity multipliers for rawUsageLicence = creativeFee x usage x duration x territory x exclusivity. Deliberately global (usage territory is a different concept from production market and is never inferred from shoot location). Perpetual duration has no row by design — always a Custom Proposal. Full-exclusive safeguard logic (broad territory/usage/duration combinations routing to Custom) lives in the pure calculator, not as a DB flag here.';

alter table public.commercial_licensing_factors enable row level security;

create policy "commercial_licensing_factors: staff read" on public.commercial_licensing_factors
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_licensing_factors to authenticated;
grant select, insert, update, delete on public.commercial_licensing_factors to service_role;

insert into public.commercial_licensing_factors (factor_type, factor_slug, factor_value) values
  ('usage', 'internal_trade_presentation', 0.15),
  ('usage', 'website_organic_social', 0.25),
  ('usage', 'pr_editorial_earned_media', 0.30),
  ('usage', 'paid_digital_advertising', 0.75),
  ('usage', 'print_advertising', 1.00),
  ('usage', 'paid_digital_print_campaign', 1.25),
  ('usage', 'packaging_pos', 1.50),
  ('usage', 'ooh_billboard', 1.75),
  ('usage', 'broadcast_streaming_advertising', 2.00),
  ('usage', 'integrated_multimedia_campaign', 2.50),
  ('duration', '3_months', 0.60),
  ('duration', '6_months', 0.75),
  ('duration', '12_months', 1.00),
  ('duration', '24_months', 1.50),
  ('duration', '36_months', 1.85),
  ('duration', '5_years', 2.25),
  ('territory', 'local_city', 0.75),
  ('territory', 'national', 1.00),
  ('territory', 'regional_multicountry', 1.35),
  ('territory', 'international', 1.75),
  ('territory', 'worldwide', 2.00),
  ('exclusivity', 'non_exclusive', 1.00),
  ('exclusivity', 'category_exclusive', 1.50),
  ('exclusivity', 'full_exclusive', 2.00);

-- ============================================================
-- PART G — commercial_review_thresholds (versioned, per market)
-- ============================================================
create table public.commercial_review_thresholds (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  review_threshold_usd numeric(10, 2) not null check (review_threshold_usd > 0),
  mandatory_threshold_usd numeric(10, 2) not null check (mandatory_threshold_usd > review_threshold_usd),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.commercial_review_thresholds is
  'Per-market indicative-estimate thresholds. Below review_threshold_usd: normal estimate. At/above review but below mandatory: "Subject to Commercial Review". At/above mandatory_threshold_usd: "Custom Commercial Proposal Required". Always-Custom conditions (copyright assignment, perpetual rights, etc.) override this purely dollar-based state regardless of the total.';

create index commercial_review_thresholds_market_idx on public.commercial_review_thresholds (market_id, effective_from desc);

alter table public.commercial_review_thresholds enable row level security;

create policy "commercial_review_thresholds: staff read" on public.commercial_review_thresholds
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.commercial_review_thresholds to authenticated;
grant select, insert, update, delete on public.commercial_review_thresholds to service_role;

insert into public.commercial_review_thresholds (market_id, review_threshold_usd, mandatory_threshold_usd)
select id, 3000.00, 7500.00 from public.pricing_markets where slug = 'ghana'
union all select id, 5000.00, 12500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 6000.00, 15000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 7500.00, 20000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 5000.00, 15000.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 5000.00, 12500.00 from public.pricing_markets where slug = 'other_international_custom';

commit;
