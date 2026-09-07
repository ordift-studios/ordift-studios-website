-- Ordift Content Creation Pricing V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0058 is the latest applied migration (local=remote=0058)
--     before writing this file — this migration is 0059.
--   - pricing_markets (0053/0054): all six markets reused directly.
--   - pricing_service_categories (0053): like graphic_design (0058), NO
--     'content_creation' row was seeded in 0053 — the four original
--     placeholders were personal_portrait, corporate_headshot,
--     wedding_event, and commercial_advertising only. This migration
--     therefore INSERTs a new 'content_creation' row (active=true)
--     rather than activating an existing one — additive, not a
--     correction of a prior omission.
--   - Four new tables, chosen to be the minimum coherent schema for the
--     approved spec (not a mechanical copy of the suggestion in the
--     authorization's Part W):
--       * content_creation_package_rates — every flat, deliberately
--         non-multiplicative package rate (short-form single/3-pack/
--         5-pack, Half/Full Content Day, Event Content 4h, Personal
--         Brand 2h) in ONE market-scoped table, since they all share
--         the exact same shape (one price per market per slug) rather
--         than one table per family as the spec's illustrative names
--         implied.
--       * content_creation_retainer_rates — kept separate from package
--         rates because retainers are a distinct monthly-commitment
--         concept (3-month minimum, no add-ons/revisions/priority
--         composed on top in this phase) rather than a one-off project
--         price.
--       * content_creation_addon_rates — market-scoped per-unit add-ons
--         plus the additional-revision dollar minimum, mirroring
--         graphic_design_addon_rates' minimum-floor pattern exactly.
--       * content_creation_percentage_rates — global: priority (+30%,
--         post-production only) and additional_revision (+15%). No
--         "urgent" percentage exists for Content Creation — the spec
--         only ever gives Same/Next-Day Social Edit as a flat per-video
--         add-on, and Exceptional emergency turnaround is always Custom
--         Confirmation with no seeded percentage at all.
--   - Mixed Social Content, Product/Food Social Content, and Custom
--     Content Production have NO seeded package rate by design — the
--     approved spec explicitly forbids inventing a separate universal
--     price matrix for the first two (they configure through the
--     Short-Form/Content Day packages already seeded here) and forbids
--     automatic pricing entirely for the third (always Request
--     Estimate). No corresponding table row exists for any of them.
--   - Social Media Management (posting/community management/paid-media/
--     analytics/etc.) has NO table, NO addon, NO percentage anywhere in
--     this migration — it remains strictly "Available by Custom
--     Proposal" at the application layer, per the approved boundary.
--   - RAW/source material and premium third-party assets (music/stock/
--     templates/fonts) likewise have no automatic price — "Available by
--     Request" copy only, reusing the existing request/assessment
--     posture already established for RAW guidance elsewhere.
--   - Talent/creator appearance fees and usage licensing remain quote/
--     assessment based — no table. Paid-advertising usage routes to the
--     existing Commercial / Advertising licensing engine (0057);  this
--     migration does not touch commercial_licensing_factors or any
--     other 0057 table.
--   - Cross-service recommendations (Part T) reuse the existing static,
--     code-level registry (src/lib/services/crossServiceRecommendations.ts)
--     — no database table, since they carry no price and require no
--     versioning. The 'content_creation' CrossServiceFamily value
--     already existed in that file's type (added in the Graphic Design
--     phase as a documented "may later recommend" destination) — this
--     phase only adds new REGISTRY entries with fromFamily:
--     "content_creation", not a type change.
--   - Cross-service discounts are NOT implemented — no new table, no
--     new discount_codes column, no bundle percentage invented.
--   - discount_codes/discount_redemptions (0053): completely untouched.
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is — no new
--     capability.
--
-- 0001-0058 are not modified. Every statement below is additive (new
-- tables, one new reference-category row). No destructive statement
-- appears anywhere in this file.

begin;

insert into public.pricing_service_categories (slug, name, active, requires_custom_quote)
values ('content_creation', 'Content Creation', true, false)
on conflict (slug) do update set active = true;

-- ============================================================
-- PART A — content_creation_package_rates (versioned, per market)
-- ============================================================
create table public.content_creation_package_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  package_slug text not null check (package_slug in (
    'short_form_single', 'short_form_pack_3', 'short_form_pack_5',
    'content_day_half', 'content_day_full',
    'event_content_4h', 'personal_brand_2h'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.content_creation_package_rates is
  'Flat, deliberately non-multiplicative Content Creation package rates by market. short_form_pack_3 and short_form_pack_5 are their own approved package rates, never derived as 3x/5x short_form_single. content_day_half/full and event_content_4h/personal_brand_2h are likewise each a single flat rate for a defined target-output scope, not a per-hour or per-deliverable calculation.';

create index content_creation_package_rates_lookup_idx on public.content_creation_package_rates (market_id, package_slug, effective_from desc);

alter table public.content_creation_package_rates enable row level security;

create policy "content_creation_package_rates: staff read" on public.content_creation_package_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.content_creation_package_rates to authenticated;
grant select, insert, update, delete on public.content_creation_package_rates to service_role;

insert into public.content_creation_package_rates (market_id, package_slug, price_usd)
select id, 'short_form_single', 125.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'short_form_single', 250.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'short_form_single', 325.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'short_form_single', 375.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'short_form_single', 300.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'short_form_single', 285.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'short_form_pack_3', 325.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'short_form_pack_3', 650.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'short_form_pack_3', 850.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'short_form_pack_3', 975.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'short_form_pack_3', 775.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'short_form_pack_3', 750.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'short_form_pack_5', 500.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'short_form_pack_5', 1000.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'short_form_pack_5', 1300.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'short_form_pack_5', 1500.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'short_form_pack_5', 1200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'short_form_pack_5', 1150.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'content_day_half', 450.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'content_day_half', 900.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'content_day_half', 1200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'content_day_half', 1350.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'content_day_half', 1050.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'content_day_half', 1000.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'content_day_full', 750.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'content_day_full', 1500.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'content_day_full', 2000.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'content_day_full', 2250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'content_day_full', 1750.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'content_day_full', 1650.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event_content_4h', 400.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event_content_4h', 800.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event_content_4h', 1050.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event_content_4h', 1200.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event_content_4h', 950.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event_content_4h', 900.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'personal_brand_2h', 300.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'personal_brand_2h', 600.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'personal_brand_2h', 800.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'personal_brand_2h', 900.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'personal_brand_2h', 700.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'personal_brand_2h', 675.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — content_creation_retainer_rates (versioned, per market)
-- ============================================================
create table public.content_creation_retainer_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  retainer_slug text not null check (retainer_slug in ('retainer_essential', 'retainer_growth', 'retainer_momentum')),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.content_creation_retainer_rates is
  'Monthly Content Production retainer rates by market — 3-month minimum commitment. Essential = 90% of the Half Content Day rate, Growth = 90% of the Full Content Day rate, Momentum = 90% of two Full Content Day rates; already-discounted flat figures, never a live 90%-of-current-rate calculation, and never composed with any further automatic bundle discount. Content Production retainers only — NOT Social Media Management (posting/community management/paid-media/analytics), which has no rate anywhere in this schema and remains Custom Proposal.';

create index content_creation_retainer_rates_lookup_idx on public.content_creation_retainer_rates (market_id, retainer_slug, effective_from desc);

alter table public.content_creation_retainer_rates enable row level security;

create policy "content_creation_retainer_rates: staff read" on public.content_creation_retainer_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.content_creation_retainer_rates to authenticated;
grant select, insert, update, delete on public.content_creation_retainer_rates to service_role;

insert into public.content_creation_retainer_rates (market_id, retainer_slug, price_usd)
select id, 'retainer_essential', 405.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'retainer_essential', 810.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'retainer_essential', 1080.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'retainer_essential', 1215.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'retainer_essential', 945.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'retainer_essential', 900.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'retainer_growth', 675.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'retainer_growth', 1350.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'retainer_growth', 1800.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'retainer_growth', 2025.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'retainer_growth', 1575.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'retainer_growth', 1485.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'retainer_momentum', 1350.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'retainer_momentum', 2700.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'retainer_momentum', 3600.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'retainer_momentum', 4050.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'retainer_momentum', 3150.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'retainer_momentum', 2970.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART C — content_creation_addon_rates (versioned, per market)
-- ============================================================
create table public.content_creation_addon_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  addon_slug text not null check (addon_slug in (
    'additional_short_form_video', 'additional_10_edited_photos', 'additional_content_capture_hour',
    'same_next_day_edit_per_video', 'additional_aspect_ratio_adaptation', 'captioned_subtitled_master',
    'additional_revision_minimum'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.content_creation_addon_rates is
  'Market-scoped Content Creation add-on rates: per-unit scaling additions (video/photos/capture hour/aspect-ratio adaptation/captioned master), the flat per-video Same/Next-Day Social Edit rush charge, and the dollar minimum for additional revision rounds (the percentage itself lives in content_creation_percentage_rates, applied against the applicable production fee, then floored at this minimum). Captioned/subtitled master is an edit/delivery adaptation only — it never includes professional translation, which remains quote-only and has no row here.';

create index content_creation_addon_rates_lookup_idx on public.content_creation_addon_rates (market_id, addon_slug, effective_from desc);

alter table public.content_creation_addon_rates enable row level security;

create policy "content_creation_addon_rates: staff read" on public.content_creation_addon_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.content_creation_addon_rates to authenticated;
grant select, insert, update, delete on public.content_creation_addon_rates to service_role;

insert into public.content_creation_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_short_form_video', 100.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_short_form_video', 200.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_short_form_video', 260.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_short_form_video', 300.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_short_form_video', 240.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_short_form_video', 225.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_10_edited_photos', 75.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_10_edited_photos', 150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_10_edited_photos', 200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_10_edited_photos', 225.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_10_edited_photos', 175.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_10_edited_photos', 165.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_content_capture_hour', 90.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_content_capture_hour', 175.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_content_capture_hour', 225.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_content_capture_hour', 250.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_content_capture_hour', 200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_content_capture_hour', 190.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'same_next_day_edit_per_video', 75.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'same_next_day_edit_per_video', 150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'same_next_day_edit_per_video', 200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'same_next_day_edit_per_video', 225.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'same_next_day_edit_per_video', 175.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'same_next_day_edit_per_video', 165.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_aspect_ratio_adaptation', 20.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_aspect_ratio_adaptation', 40.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_aspect_ratio_adaptation', 50.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_aspect_ratio_adaptation', 60.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_aspect_ratio_adaptation', 45.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_aspect_ratio_adaptation', 45.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'captioned_subtitled_master', 25.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'captioned_subtitled_master', 50.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'captioned_subtitled_master', 65.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'captioned_subtitled_master', 75.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'captioned_subtitled_master', 60.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'captioned_subtitled_master', 55.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'additional_revision_minimum', 25.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_revision_minimum', 50.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_revision_minimum', 70.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_revision_minimum', 80.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_revision_minimum', 60.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_revision_minimum', 60.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART D — content_creation_percentage_rates (global, versioned)
-- ============================================================
create table public.content_creation_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in ('priority', 'additional_revision')),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.content_creation_percentage_rates is
  'Global Content Creation percentages: priority +30% (post-production/deliverable component only — applied to the applicable production fee; never surcharges production, talent, travel or licensing), additional_revision +15% (per additional round beyond the 2 included, floored at the market minimum). No "urgent" percentage exists here by design — Same/Next-Day Social Edit is a flat per-video add-on (content_creation_addon_rates), and Exceptional emergency turnaround always requires Custom Confirmation with no automatic surcharge at all.';

alter table public.content_creation_percentage_rates enable row level security;

create policy "content_creation_percentage_rates: staff read" on public.content_creation_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.content_creation_percentage_rates to authenticated;
grant select, insert, update, delete on public.content_creation_percentage_rates to service_role;

insert into public.content_creation_percentage_rates (percentage_slug, percentage) values
  ('priority', 30.00),
  ('additional_revision', 15.00);

commit;
