-- Ordift Pricing Engine V1 (2026-09-06)
--
-- Foundation for market-based pricing: pricing markets/country mapping,
-- versioned personal-session rates (only Ghana/Qatar approved and
-- active this phase), a subject/group category reference table, and
-- architectural scaffolding (inactive/unseeded) for corporate
-- headshots, production locations, discounts, and RAW-file requests.
--
-- INSPECTION SUMMARY (this same date):
--   - currencies (0024): reused directly for currency_code references
--     below, not duplicated. No new currency table.
--   - payment_obligations.source_type/source_reference (0046): the
--     established polymorphic-reference pattern, reused verbatim for
--     discount_redemptions.reference_type/reference_id and
--     raw_file_requests.reference_type/reference_id, rather than a
--     hard FK to any one booking/enquiry/engagement table.
--   - enquiries.country (0001): a free-text field asking the ENQUIRER's
--     own country — deliberately NOT reused or joined against anywhere
--     in this migration or the application code built on it. Pricing
--     market selection is its own explicit, separate concept (see
--     CORE PRICING PRINCIPLE in the authorizing request): the market
--     the shoot/production takes place in, never inferred from a
--     customer's residence, nationality, or request metadata.
--   - No existing contract/e-signature architecture was found anywhere
--     in this codebase (checked exhaustively) — the future Enquiry ->
--     Quote -> Contract -> Signature -> Booking lifecycle is
--     deliberately NOT represented as new schema here; recorded
--     instead as a documented architectural requirement
--     (TECHNICAL_DEBT_REGISTER.md), per explicit instruction not to
--     fabricate a contract system or legal wording.
--   - Wedding/Event and Commercial/Advertising pricing: represented
--     only as inactive pricing_service_categories rows
--     (requires_custom_quote = true) — no dedicated builder tables are
--     created for either, since no structured field beyond "route to
--     custom quote" was specified or approved this phase. Building
--     empty, speculative schema for either would be scope creep beyond
--     what was actually authorized.
--
-- Every table is purely additive. No existing table's columns, RLS
-- policies, CHECK constraints, or grants are altered by this
-- migration. No destructive statement (DROP/TRUNCATE/DELETE) appears
-- anywhere in this file. Only the eight explicitly approved
-- Ghana/Qatar personal-session rates carry a real monetary value —
-- every other seeded row is either a reference/category record with no
-- price, or is seeded with a null/unapproved monetary field and
-- active = false.

begin;

-- ============================================================
-- PART A — pricing_markets
-- ============================================================
create table public.pricing_markets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  slug text unique not null,
  name text not null,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.pricing_markets is
  'A pricing market/region (e.g. Ghana, Qatar). active=false means architecturally supported but not yet published — no approved rates exist for it. Pricing is determined by the market the shoot/production takes place in, never by customer nationality, residence, IP, or geolocation.';

alter table public.pricing_markets enable row level security;

create policy "pricing_markets: staff read" on public.pricing_markets
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.pricing_markets to authenticated;
grant select, insert, update, delete on public.pricing_markets to service_role;

insert into public.pricing_markets (slug, name, active, sort_order) values
  ('ghana', 'Ghana / West Africa', true, 1),
  ('qatar', 'Qatar / GCC', true, 2),
  ('uk_western_europe', 'UK / Western Europe', false, 3),
  ('north_america', 'North America', false, 4),
  ('asia_pacific', 'Asia-Pacific', false, 5),
  ('other_international_custom', 'Other International / Custom', false, 6);

-- ============================================================
-- PART B — pricing_market_countries (country -> market mapping)
-- ============================================================
create table public.pricing_market_countries (
  id uuid primary key default gen_random_uuid(),
  country_code text unique not null,
  market_id uuid not null references public.pricing_markets (id),
  created_at timestamptz not null default now()
);

comment on table public.pricing_market_countries is
  'ISO 3166-1 alpha-2 country_code -> pricing_markets mapping. A future country-specific override is a new row pointing at a different (or new) market — no code change required. Only GH and QA are mapped this phase; every other country is intentionally unmapped until a market for it is approved and activated.';

alter table public.pricing_market_countries enable row level security;

create policy "pricing_market_countries: staff read" on public.pricing_market_countries
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.pricing_market_countries to authenticated;
grant select, insert, update, delete on public.pricing_market_countries to service_role;

insert into public.pricing_market_countries (country_code, market_id)
select 'GH', id from public.pricing_markets where slug = 'ghana'
union all
select 'QA', id from public.pricing_markets where slug = 'qatar';

-- ============================================================
-- PART C — pricing_service_categories
-- ============================================================
create table public.pricing_service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  active boolean not null default false,
  requires_custom_quote boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.pricing_service_categories is
  'The distinct pricing engines/models this architecture is prepared for. personal_portrait is the only one with approved, active rates this phase. corporate_headshot, wedding_event, and commercial_advertising are architecturally represented but inactive and requires_custom_quote=true — every enquiry in those categories routes to the existing enquiry/custom-quote workflow, never an automatic calculated price.';

alter table public.pricing_service_categories enable row level security;

create policy "pricing_service_categories: staff read" on public.pricing_service_categories
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.pricing_service_categories to authenticated;
grant select, insert, update, delete on public.pricing_service_categories to service_role;

insert into public.pricing_service_categories (slug, name, active, requires_custom_quote) values
  ('personal_portrait', 'Personal Portrait Sessions', true, false),
  ('corporate_headshot', 'Corporate Headshots', false, true),
  ('wedding_event', 'Weddings & Events', false, true),
  ('commercial_advertising', 'Commercial / Advertising', false, true);

-- ============================================================
-- PART D — personal_session_rates
-- ============================================================
-- Append-only versioning, mirroring the existing exchange_rates
-- pattern (0024/currency.ts's insertExchangeRate): a rate change is
-- always a new INSERT with a later effective_from, never an UPDATE of
-- an existing row. Readers always select the most recent
-- effective row per (market, duration) rather than assuming exactly
-- one row exists.
create table public.personal_session_rates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  market_id uuid not null references public.pricing_markets (id),
  duration_hours integer not null check (duration_hours in (1, 2, 3, 4)),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  signature_retouched_images integer not null check (signature_retouched_images >= 0),
  professionally_edited_images integer not null check (professionally_edited_images >= 0),
  currency_code text not null default 'USD' references public.currencies (code),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.personal_session_rates is
  'Versioned, market-specific personal-session pricing tiers (1-4 hours only — assignments beyond 4 hours route to custom quotation, never an extrapolated multiplied rate). Canonical currency is USD. Only Ghana and Qatar rows exist this phase, matching the two approved markets above.';

create index personal_session_rates_market_duration_idx on public.personal_session_rates (market_id, duration_hours, effective_from desc);

alter table public.personal_session_rates enable row level security;

create policy "personal_session_rates: staff read" on public.personal_session_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.personal_session_rates to authenticated;
grant select, insert, update, delete on public.personal_session_rates to service_role;

insert into public.personal_session_rates (market_id, duration_hours, price_usd, signature_retouched_images, professionally_edited_images)
select id, 1, 125.00, 5, 10 from public.pricing_markets where slug = 'ghana'
union all select id, 2, 225.00, 8, 15 from public.pricing_markets where slug = 'ghana'
union all select id, 3, 310.00, 12, 25 from public.pricing_markets where slug = 'ghana'
union all select id, 4, 390.00, 15, 35 from public.pricing_markets where slug = 'ghana'
union all select id, 1, 150.00, 5, 10 from public.pricing_markets where slug = 'qatar'
union all select id, 2, 250.00, 8, 15 from public.pricing_markets where slug = 'qatar'
union all select id, 3, 340.00, 12, 25 from public.pricing_markets where slug = 'qatar'
union all select id, 4, 425.00, 15, 35 from public.pricing_markets where slug = 'qatar';

-- ============================================================
-- PART E — subject_categories (session builder subject/group architecture)
-- ============================================================
create table public.subject_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  min_subjects integer not null,
  max_subjects integer,
  supplement_usd numeric(10, 2),
  active boolean not null default false,
  requires_custom_quote boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.subject_categories is
  'Subject/group pricing categories for the personal session builder. individual is the only active, zero-supplement category (1 subject is what the base personal_session_rates price already covers — not an invented price, the absence of an upcharge). couple/family_small_group/large_group/limited_guest_appearance are architecturally represented with supplement_usd left null (unapproved) and requires_custom_quote=true until real monetary supplements are approved.';

alter table public.subject_categories enable row level security;

create policy "subject_categories: staff read" on public.subject_categories
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.subject_categories to authenticated;
grant select, insert, update, delete on public.subject_categories to service_role;

insert into public.subject_categories (slug, name, min_subjects, max_subjects, supplement_usd, active, requires_custom_quote) values
  ('individual', 'Individual', 1, 1, 0.00, true, false),
  ('couple', 'Couple', 2, 2, null, false, true),
  ('family_small_group', 'Family / Small Group', 3, 5, null, false, true),
  ('large_group', 'Large Group', 6, null, null, false, true),
  ('limited_guest_appearance', 'Limited Guest Appearance', 1, null, null, false, true);

-- ============================================================
-- PART F — discount_codes
-- ============================================================
create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  code text unique not null,
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed')),
  value numeric(10, 2) not null check (value > 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  applicable_service_category_ids uuid[],
  applicable_market_ids uuid[],
  max_uses integer,
  max_uses_per_client integer,
  active boolean not null default false,
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.discount_codes is
  'Promotional discount codes. applicable_service_category_ids/applicable_market_ids null = applies to all. No codes are seeded by this migration (e.g. no FIRST5) — every real code is a deliberate future creation by an authorized admin, never invented automatically.';

alter table public.discount_codes enable row level security;

create policy "discount_codes: super admin read" on public.discount_codes
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.discount_codes to authenticated;
grant select, insert, update, delete on public.discount_codes to service_role;

-- ============================================================
-- PART G — discount_redemptions (audit trail)
-- ============================================================
create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid references public.discount_codes (id),
  reference_type text not null,
  reference_id text,
  original_amount_usd numeric(10, 2) not null,
  discount_type text not null,
  discount_value numeric(10, 2) not null,
  discount_amount_usd numeric(10, 2) not null,
  final_amount_usd numeric(10, 2) not null,
  actor_user_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.discount_redemptions is
  'Immutable audit record of every discount actually applied — either a self-service discount_codes redemption (discount_code_id set) or an authorized manual discount (discount_code_id null, actor_user_id + reason required by application logic). Preserves original/discount/final amounts, matching the authorizing business requirement exactly. reference_type/reference_id mirror payment_obligations.source_type/source_reference — the same established polymorphic-reference pattern, not a hard FK to any one booking/enquiry table.';

alter table public.discount_redemptions enable row level security;

create policy "discount_redemptions: super admin read" on public.discount_redemptions
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.discount_redemptions to authenticated;
grant select, insert on public.discount_redemptions to service_role;

-- ============================================================
-- PART H — production_locations (internal studio/location directory)
-- ============================================================
create table public.production_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  name text not null,
  country_code text,
  city text,
  currency_code text not null default 'USD' references public.currencies (code),
  internal_supplier_cost_amount numeric(10, 2),
  internal_supplier_cost_currency text references public.currencies (code),
  rate_hourly numeric(10, 2),
  rate_half_day numeric(10, 2),
  rate_full_day numeric(10, 2),
  suitable_production_types text[],
  facilities_notes text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'expired')),
  last_verified_date date,
  active boolean not null default false,
  client_facing_fee_amount numeric(10, 2),
  client_facing_fee_currency text references public.currencies (code),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.production_locations is
  'Internal studio/production-location directory. internal_supplier_cost_* is strictly internal — never exposed client-side; client_facing_fee_* (a deliberately separate column, not derived from cost) is the only field any future client-facing display may read. No rows are seeded by this migration, per explicit instruction not to invent supplier relationships or rates.';

alter table public.production_locations enable row level security;

create policy "production_locations: super admin read" on public.production_locations
  for select
  to authenticated
  using ((select private.is_super_admin()));

grant select on public.production_locations to authenticated;
grant select, insert, update, delete on public.production_locations to service_role;

-- ============================================================
-- PART I — raw_file_requests
-- ============================================================
create table public.raw_file_requests (
  id uuid primary key default gen_random_uuid(),
  reference_type text not null,
  reference_id text,
  status text not null default 'not_included' check (status in ('not_included', 'requested', 'pending_approval', 'approved', 'rejected')),
  fee_amount numeric(10, 2),
  fee_currency text references public.currencies (code),
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.raw_file_requests is
  'RAW/source-file request lifecycle. status defaults to not_included, matching the standing business rule that RAW files are never part of a normal personal-session deliverable and are never auto-promised. No fee is set anywhere by this migration — commercial RAW/source-file delivery remains a separate, explicitly-contracted decision, never inherited automatically from personal-session pricing.';

alter table public.raw_file_requests enable row level security;

create policy "raw_file_requests: staff read" on public.raw_file_requests
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.raw_file_requests to authenticated;
grant select, insert, update, delete on public.raw_file_requests to service_role;

-- ============================================================
-- PART J — corporate_headshot_config (architecture placeholder, inactive)
-- ============================================================
create table public.corporate_headshot_config (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.pricing_markets (id),
  production_setup_fee_usd numeric(10, 2),
  per_person_rate_tiers jsonb,
  images_per_employee integer,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.corporate_headshot_config is
  'Architectural placeholder for a future Corporate Headshot Builder (staff/executive headshots, volume/per-person pricing with a diminishing rate for larger teams). No rows are seeded and active defaults false — no corporate monetary rate is approved this phase. Corporate photography must never be calculated via the personal_session_rates engine.';

alter table public.corporate_headshot_config enable row level security;

create policy "corporate_headshot_config: staff read" on public.corporate_headshot_config
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.corporate_headshot_config to authenticated;
grant select, insert, update, delete on public.corporate_headshot_config to service_role;

commit;
