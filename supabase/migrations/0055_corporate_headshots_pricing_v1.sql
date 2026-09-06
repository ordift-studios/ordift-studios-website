-- Ordift Corporate & Headshots Pricing V1 (2026-09-06)
--
-- A distinct pricing family, deliberately NOT modeled on the Personal
-- Portrait subject/group multiplier system — Corporate has its own
-- per-product rates, per-team-size volume tiers, a market minimum
-- booking floor, its own additional-retouch rate, and a locked
-- Priority Delivery surcharge.
--
-- INSPECTION SUMMARY (this same date):
--   - pricing_markets (0053/0054): all six markets reused directly —
--     no new market table, no market row touched.
--   - pricing_service_categories (0053): the existing 'corporate_headshot'
--     row is activated (active=true) for reference-tracking consistency
--     with 'personal_portrait' — the new Corporate calculator below does
--     NOT read this table's requires_custom_quote flag at all; it has
--     its own per-product/per-tier custom-quote logic (51+ employees,
--     etc.), so this UPDATE is cosmetic/reference-only, not a
--     functional dependency.
--   - corporate_headshot_config (0053): a pre-existing placeholder table
--     (production_setup_fee_usd/per_person_rate_tiers jsonb/
--     images_per_employee, all nullable, active=false) — its shape
--     doesn't fit the now-approved structure (distinct Individual/
--     Executive rates, four volume tiers with real boundaries, a
--     minimum-booking floor, per-market amounts). Rather than force
--     that shape or destructively alter an existing table, this
--     migration leaves it completely untouched (still empty, still
--     unused, harmless) and adds purpose-built tables instead, mirroring
--     personal_session_rates'/additional_retouch_rates' own proven
--     versioned pattern exactly.
--   - additional_retouch_rates (0054, Personal Portrait family): NOT
--     reused for Corporate's additional-retouch pricing, per explicit
--     instruction ("do not reuse the Personal Portrait retouch price if
--     doing so would destroy the distinction between the two pricing
--     families") — a new corporate_retouch_rates table is added
--     instead, identical shape, separate data.
--   - discount_codes/discount_redemptions (0053): completely untouched
--     — reused as-is for Corporate, no second discount system.
--   - FINANCE_CAPABILITIES.pricingAdminister: reused as-is for every
--     write below — no new capability, no duplicate admin-role logic.
--
-- 0053 and 0054 are not modified by this file. Every statement below is
-- additive (new tables) or a narrow, non-destructive data-activation
-- UPDATE of a single pre-existing reference row. No destructive
-- statement (DROP/TRUNCATE/DELETE) appears anywhere in this file.

begin;

-- Cosmetic/reference-only activation — see inspection summary above.
update public.pricing_service_categories
set active = true
where slug = 'corporate_headshot';

-- ============================================================
-- PART A — corporate_headshot_rates (Individual + Executive, versioned)
-- ============================================================
create table public.corporate_headshot_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  product_slug text not null check (product_slug in ('individual_headshot', 'executive_portrait')),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  signature_retouched_images integer not null check (signature_retouched_images >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.corporate_headshot_rates is
  'Versioned Corporate & Headshots rates for the two fixed-price products (Professional Headshot - Individual, Executive Portrait), by market. Append-only, mirroring personal_session_rates'' own pattern: a rate change is always a new INSERT with a later effective_from, never an UPDATE. Team Headshots pricing lives in corporate_team_tier_rates below instead — a different (per-person, tiered) pricing shape.';

create index corporate_headshot_rates_market_product_idx on public.corporate_headshot_rates (market_id, product_slug, effective_from desc);

alter table public.corporate_headshot_rates enable row level security;

create policy "corporate_headshot_rates: staff read" on public.corporate_headshot_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_headshot_rates to authenticated;
grant select, insert, update, delete on public.corporate_headshot_rates to service_role;

insert into public.corporate_headshot_rates (market_id, product_slug, price_usd, signature_retouched_images)
select id, 'individual_headshot', 100.00, 2 from public.pricing_markets where slug = 'ghana'
union all select id, 'individual_headshot', 175.00, 2 from public.pricing_markets where slug = 'qatar'
union all select id, 'individual_headshot', 225.00, 2 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'individual_headshot', 250.00, 2 from public.pricing_markets where slug = 'north_america'
union all select id, 'individual_headshot', 200.00, 2 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'individual_headshot', 200.00, 2 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'executive_portrait', 200.00, 5 from public.pricing_markets where slug = 'ghana'
union all select id, 'executive_portrait', 300.00, 5 from public.pricing_markets where slug = 'qatar'
union all select id, 'executive_portrait', 400.00, 5 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'executive_portrait', 450.00, 5 from public.pricing_markets where slug = 'north_america'
union all select id, 'executive_portrait', 350.00, 5 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'executive_portrait', 350.00, 5 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — corporate_team_tier_rates (versioned, per-person, per tier)
-- ============================================================
create table public.corporate_team_tier_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  tier_slug text not null check (tier_slug in ('2-5', '6-10', '11-25', '26-50')),
  min_people integer not null,
  max_people integer not null,
  price_per_person_usd numeric(10, 2) not null check (price_per_person_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.corporate_team_tier_rates is
  'Versioned per-person Team Headshots rate for a given team-size tier and market. 51+ employees has no row here by design — always routes to a Custom Corporate Proposal, never an automatic price. teamSubtotal = numberOfPeople x price_per_person_usd for the matching tier; the final team price is MAX(teamSubtotal, the market''s corporate_minimum_booking_rates value).';

create index corporate_team_tier_rates_market_tier_idx on public.corporate_team_tier_rates (market_id, tier_slug, effective_from desc);

alter table public.corporate_team_tier_rates enable row level security;

create policy "corporate_team_tier_rates: staff read" on public.corporate_team_tier_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_team_tier_rates to authenticated;
grant select, insert, update, delete on public.corporate_team_tier_rates to service_role;

insert into public.corporate_team_tier_rates (market_id, tier_slug, min_people, max_people, price_per_person_usd)
select id, '2-5', 2, 5, 75.00 from public.pricing_markets where slug = 'ghana'
union all select id, '6-10', 6, 10, 60.00 from public.pricing_markets where slug = 'ghana'
union all select id, '11-25', 11, 25, 45.00 from public.pricing_markets where slug = 'ghana'
union all select id, '26-50', 26, 50, 35.00 from public.pricing_markets where slug = 'ghana'
union all select id, '2-5', 2, 5, 125.00 from public.pricing_markets where slug = 'qatar'
union all select id, '6-10', 6, 10, 100.00 from public.pricing_markets where slug = 'qatar'
union all select id, '11-25', 11, 25, 80.00 from public.pricing_markets where slug = 'qatar'
union all select id, '26-50', 26, 50, 65.00 from public.pricing_markets where slug = 'qatar'
union all select id, '2-5', 2, 5, 175.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, '6-10', 6, 10, 135.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, '11-25', 11, 25, 100.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, '26-50', 26, 50, 75.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, '2-5', 2, 5, 190.00 from public.pricing_markets where slug = 'north_america'
union all select id, '6-10', 6, 10, 145.00 from public.pricing_markets where slug = 'north_america'
union all select id, '11-25', 11, 25, 110.00 from public.pricing_markets where slug = 'north_america'
union all select id, '26-50', 26, 50, 85.00 from public.pricing_markets where slug = 'north_america'
union all select id, '2-5', 2, 5, 150.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, '6-10', 6, 10, 115.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, '11-25', 11, 25, 85.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, '26-50', 26, 50, 65.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, '2-5', 2, 5, 150.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, '6-10', 6, 10, 115.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, '11-25', 11, 25, 85.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, '26-50', 26, 50, 65.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART C — corporate_minimum_booking_rates (versioned, per market)
-- ============================================================
create table public.corporate_minimum_booking_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  minimum_amount_usd numeric(10, 2) not null check (minimum_amount_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.corporate_minimum_booking_rates is
  'Versioned minimum Team Headshots booking floor, by market. The final team price is MAX(numberOfPeople x tier rate, this value) — never below it, regardless of how few people are in the smallest priced tier (2).';

create index corporate_minimum_booking_rates_market_idx on public.corporate_minimum_booking_rates (market_id, effective_from desc);

alter table public.corporate_minimum_booking_rates enable row level security;

create policy "corporate_minimum_booking_rates: staff read" on public.corporate_minimum_booking_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_minimum_booking_rates to authenticated;
grant select, insert, update, delete on public.corporate_minimum_booking_rates to service_role;

insert into public.corporate_minimum_booking_rates (market_id, minimum_amount_usd)
select id, 250.00 from public.pricing_markets where slug = 'ghana'
union all select id, 400.00 from public.pricing_markets where slug = 'qatar'
union all select id, 550.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 600.00 from public.pricing_markets where slug = 'north_america'
union all select id, 450.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 450.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART D — corporate_retouch_rates (versioned, per market)
-- ============================================================
create table public.corporate_retouch_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  price_per_image_usd numeric(10, 2) not null check (price_per_image_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.corporate_retouch_rates is
  'Versioned per-image price for an ADDITIONAL Signature Retouched Image in the Corporate & Headshots family, by market. Deliberately separate from additional_retouch_rates (the Personal Portrait family''s equivalent table) — same shape, different data, so the two pricing families'' rates can never accidentally cross-apply.';

create index corporate_retouch_rates_market_idx on public.corporate_retouch_rates (market_id, effective_from desc);

alter table public.corporate_retouch_rates enable row level security;

create policy "corporate_retouch_rates: staff read" on public.corporate_retouch_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_retouch_rates to authenticated;
grant select, insert, update, delete on public.corporate_retouch_rates to service_role;

insert into public.corporate_retouch_rates (market_id, price_per_image_usd)
select id, 15.00 from public.pricing_markets where slug = 'ghana'
union all select id, 25.00 from public.pricing_markets where slug = 'qatar'
union all select id, 35.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 40.00 from public.pricing_markets where slug = 'north_america'
union all select id, 30.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 30.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART E — corporate_priority_delivery_rates (versioned, global)
-- ============================================================
-- Deliberately NOT market-scoped — the approved rule is a single
-- locked +35% applying uniformly across all Corporate & Headshots
-- markets, not a per-market figure. Still versioned (own table, own
-- effective_from) rather than a hard-coded constant, so a future change
-- to this percentage is possible without a code change, per instruction
-- to use the existing versioned-rate pattern "where appropriate."
create table public.corporate_priority_delivery_rates (
  id uuid primary key default gen_random_uuid(),
  multiplier_percentage numeric(5, 2) not null check (multiplier_percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.corporate_priority_delivery_rates is
  'Versioned Corporate & Headshots Priority Delivery surcharge percentage (approved V1 value: 35.00). priorityDeliveryAmount = eligibleSubtotal x (multiplier_percentage / 100), where eligibleSubtotal is the base product/team price plus any additional-retouch amount, before Priority Delivery itself. Never applied automatically — the client must deliberately request it, and it remains subject to Ordift availability/confirmation, not a guaranteed turnaround.';

alter table public.corporate_priority_delivery_rates enable row level security;

create policy "corporate_priority_delivery_rates: staff read" on public.corporate_priority_delivery_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_priority_delivery_rates to authenticated;
grant select, insert, update, delete on public.corporate_priority_delivery_rates to service_role;

insert into public.corporate_priority_delivery_rates (multiplier_percentage) values (35.00);

commit;
