-- Ordift Branding & Creative Strategy Pricing V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0060 is the latest applied migration (local=remote=0060,
--     the Discount Lifecycle Refinement) before writing this file —
--     this migration is 0061.
--   - pricing_markets (0053/0054): all six markets reused directly.
--   - pricing_service_categories (0053): like graphic_design (0058) and
--     content_creation (0059), NO 'branding' row was seeded in 0053 —
--     the four original placeholders were personal_portrait,
--     corporate_headshot, wedding_event, and commercial_advertising
--     only. This migration therefore INSERTs a new 'branding' row
--     (active=true) rather than activating an existing one.
--   - Minimum coherent schema — THREE tables, not the four the
--     authorization's suggested-but-optional domain list implied,
--     because Branding has no per-unit quantity scaling at all (no
--     additional pages/slides/videos the way Graphic Design or Content
--     Creation do — every tier is a single flat rate) and no market-
--     scoped add-on catalogue beyond the one revision-round dollar
--     minimum:
--       * branding_tier_rates — the six priced service-ladder tiers
--         (Logo Development, Brand Foundations/Strategy, Essential
--         Identity, Complete Identity System, Strategy + Complete
--         Identity, Strategic Rebrand), market-scoped. Strategy +
--         Complete Identity is its OWN locked row here — never derived
--         by summing Brand Foundations' and Complete Identity's rows
--         (confirmed distinct from that sum in every market except
--         Ghana, where it happens to also differ: 1200+1500=2700 vs the
--         locked 2800 — the application layer never performs that
--         addition regardless).
--       * branding_revision_minimums — one dollar-minimum-per-market
--         row, mirroring the minimum-floor role graphic_design_addon_rates
--         and content_creation_addon_rates play for their families, but
--         collapsed to its own small table rather than a generic addon
--         table, since Branding has exactly one such minimum and no
--         other per-market add-on figure at all.
--       * branding_percentage_rates — global: priority (+25%, Branding
--         is strategic work and is deliberately NOT marketed as an
--         emergency commodity, hence the lower rate than Graphic
--         Design's/Content Creation's +30%) and additional_revision
--         (+15%). No "urgent" percentage exists — an extremely
--         compressed/unsafe timeline always requires Custom
--         Confirmation with no automatic surcharge at all, and same-day
--         Branding is never promised.
--   - Custom / Enterprise Brand Programme has NO seeded rate by design
--     — the approved spec explicitly forbids inventing automatic
--     enterprise pricing; it remains Creative Review/Custom Proposal at
--     the application layer, with no corresponding table row.
--   - Naming, multilingual/Arabic identity development, extensive
--     copywriting/verbal identity, website/digital implementation,
--     physical rollout/implementation, and trademark/legal clearance
--     all have NO table and NO rate anywhere in this migration — each
--     remains explicitly Custom Proposal / Available by Quote / a
--     Creative Review trigger at the application layer, per the
--     approved spec's explicit boundaries.
--   - Project-scale/review safeguards (many stakeholder groups,
--     multiple business units, many markets, regulated/high-risk
--     industry, extensive research, numerous applications, complex
--     brand architecture, multilingual complexity) are pure, code-level
--     Creative Review triggers (src/lib/pricing/brandingEstimate.ts) —
--     no database table, since none of them carries a price or needs
--     versioning.
--   - Cross-service recommendations reuse the existing static, code-
--     level registry (src/lib/services/crossServiceRecommendations.ts)
--     — no database table.
--   - discount_codes/discount_redemptions: completely untouched by this
--     migration (the Discount Lifecycle Refinement's schema change was
--     0060, applied separately before this one).
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is — no new
--     capability.
--
-- 0001-0060 are not modified. Every statement below is additive (new
-- tables, one new reference-category row). No destructive statement
-- appears anywhere in this file.

begin;

insert into public.pricing_service_categories (slug, name, active, requires_custom_quote)
values ('branding', 'Branding & Creative Strategy', true, false)
on conflict (slug) do update set active = true;

-- ============================================================
-- PART A — branding_tier_rates (versioned, per market)
-- ============================================================
create table public.branding_tier_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  tier_slug text not null check (tier_slug in (
    'logo_development', 'brand_foundations', 'essential_identity', 'complete_identity', 'strategy_complete_identity', 'strategic_rebrand'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.branding_tier_rates is
  'Base Branding & Creative Strategy service-level price by market. strategy_complete_identity is its own approved package rate, never derived by adding brand_foundations + complete_identity. Custom / Enterprise Brand Programme has no row here by design — always Creative Review / Custom Proposal at the application layer.';

create index branding_tier_rates_lookup_idx on public.branding_tier_rates (market_id, tier_slug, effective_from desc);

alter table public.branding_tier_rates enable row level security;

create policy "branding_tier_rates: staff read" on public.branding_tier_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.branding_tier_rates to authenticated;
grant select, insert, update, delete on public.branding_tier_rates to service_role;

insert into public.branding_tier_rates (market_id, tier_slug, price_usd)
select id, 'logo_development', 300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'logo_development', 750.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'logo_development', 1000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'logo_development', 1200.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'logo_development', 900.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'logo_development', 850.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'brand_foundations', 1200.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'brand_foundations', 3000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'brand_foundations', 4000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'brand_foundations', 5000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'brand_foundations', 3500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'brand_foundations', 3300.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'essential_identity', 750.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'essential_identity', 1800.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'essential_identity', 2500.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'essential_identity', 3000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'essential_identity', 2200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'essential_identity', 2100.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'complete_identity', 1500.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'complete_identity', 3500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'complete_identity', 5000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'complete_identity', 6000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'complete_identity', 4500.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'complete_identity', 4200.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'strategy_complete_identity', 2800.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'strategy_complete_identity', 6500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'strategy_complete_identity', 9000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'strategy_complete_identity', 11000.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'strategy_complete_identity', 8000.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'strategy_complete_identity', 7500.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'strategic_rebrand', 3500.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'strategic_rebrand', 8000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'strategic_rebrand', 11000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'strategic_rebrand', 13500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'strategic_rebrand', 10000.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'strategic_rebrand', 9000.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — branding_revision_minimums (versioned, per market)
-- ============================================================
create table public.branding_revision_minimums (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  minimum_usd numeric(10, 2) not null check (minimum_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.branding_revision_minimums is
  'The dollar floor for an additional Branding revision round by market — the percentage itself (+15% of the base tier fee per round) lives in branding_percentage_rates; this is only the minimum it is floored at, one row per market, mirroring the minimum-floor role graphic_design_addon_rates/content_creation_addon_rates play for their families.';

create index branding_revision_minimums_lookup_idx on public.branding_revision_minimums (market_id, effective_from desc);

alter table public.branding_revision_minimums enable row level security;

create policy "branding_revision_minimums: staff read" on public.branding_revision_minimums
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.branding_revision_minimums to authenticated;
grant select, insert, update, delete on public.branding_revision_minimums to service_role;

insert into public.branding_revision_minimums (market_id, minimum_usd)
select id, 50.00 from public.pricing_markets where slug = 'ghana'
union all select id, 125.00 from public.pricing_markets where slug = 'qatar'
union all select id, 175.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 200.00 from public.pricing_markets where slug = 'north_america'
union all select id, 150.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 150.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART C — branding_percentage_rates (global, versioned)
-- ============================================================
create table public.branding_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in ('priority', 'additional_revision')),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.branding_percentage_rates is
  'Global Branding percentages: priority +25% of the eligible Ordift creative/strategy fee only (never third-party/legal/supplier costs, and subject to actual availability — Branding is strategic work, not marketed as an emergency commodity), additional_revision +15% (per additional round beyond the 2 included, floored at the market minimum). No automatic percentage exists for an extremely compressed/unsafe timeline — that always requires Custom Confirmation.';

alter table public.branding_percentage_rates enable row level security;

create policy "branding_percentage_rates: staff read" on public.branding_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.branding_percentage_rates to authenticated;
grant select, insert, update, delete on public.branding_percentage_rates to service_role;

insert into public.branding_percentage_rates (percentage_slug, percentage) values
  ('priority', 25.00),
  ('additional_revision', 15.00);

commit;
