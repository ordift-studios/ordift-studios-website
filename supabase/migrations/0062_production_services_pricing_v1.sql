-- Ordift Production Services Pricing V1 (2026-09-07)
--
-- INSPECTION SUMMARY:
--   - Confirmed 0061 is the latest applied migration (local=remote=0061,
--     Branding & Creative Strategy) before writing this file — this
--     migration is 0062.
--   - pricing_markets (0053/0054): all six markets reused directly.
--   - pricing_service_categories (0053): like every prior new family,
--     NO 'production' row was seeded in 0053. This migration INSERTs a
--     new 'production' row (active=true).
--   - payee_profiles (0049) was inspected before designing
--     production_suppliers: payee_profiles.id is a hard FK to
--     profiles.id (on delete cascade) — every payee MUST be a real
--     platform account. Most production suppliers (a studio, a rental
--     house, a caterer) will never have an Ordift account at all, so
--     production_suppliers is its OWN table, never conflated with
--     payee_profiles — a supplier that IS also a registered payee
--     (e.g. a freelance crew member with a portal account) links via
--     the optional, nullable payee_profile_id column instead.
--   - project_requests (0008) was inspected as a candidate anchor for
--     supplier quotes/budgets, but it is a narrower, specific
--     mechanism (client-initiated requests against an enquiry/
--     workshop_registration via a request_types lookup, with its own
--     staff_decision workflow) — not a general "production engagement"
--     entity. Production Services has no dedicated project entity yet,
--     so production_supplier_quotes/production_budgets instead reuse
--     the polymorphic reference_type/reference_id PATTERN already
--     established twice in this schema (discount_redemptions.reference_type/
--     reference_id; payment_obligations.source_type/source_reference)
--     — typically anchoring to the enquiry an engagement came through,
--     without requiring a schema change if a dedicated project entity
--     is added later.
--   - Minimum coherent schema — SIX tables total, deliberately
--     collapsed from the spec's illustrative "potential domains" list:
--       * production_market_rates — ALL market-scoped Ordift fee
--         dollar figures (management minimum, half/full-day planning,
--         location coordination, equipment/crew coordination minimums)
--         in ONE table distinguished by rate_slug, exactly like
--         graphic_design_deliverable_rates/content_creation_package_rates
--         collapsed multiple would-be tables into one.
--       * production_percentage_rates — global: management_fee (15%),
--         equipment_coordination (10%), crew_coordination (12%),
--         management_overtime (25%).
--       * production_suppliers — internal-only procurement directory
--         (see above). NO public RLS policy at all.
--       * production_supplier_quotes — a supplier's priced offer for a
--         specific engagement. Status lifecycle matches the approved
--         spec exactly (draft/received/under_review/approved_internally/
--         rejected/expired/superseded/committed). A status change is
--         NEVER a payment/booking trigger — see the table comment.
--       * production_budgets — APPEND-ONLY version chain per
--         engagement (supersedes_id self-reference), status lifecycle
--         estimate -> supplier_quoted -> internal_approved ->
--         client_presented -> client_approved -> committed ->
--         actual_final. A budget change is always a new INSERT, never
--         an UPDATE of an existing row's financial figures — every
--         historical version stays queryable/auditable forever.
--       * production_budget_changes — governed change/variation
--         records against an already client-approved-or-later budget
--         version, enforced at the application layer
--         (productionBudgets.ts's createBudgetVersion(): a materially
--         different total on a client_approved/committed/actual_final
--         budget REQUIRES a non-empty changeReason, which is written
--         here atomically alongside the new budget version).
--   - Ordift-owned equipment has NO rate table in V1 — the approved
--     spec explicitly forbids inventing arbitrary owned-equipment
--     prices; only externally rented equipment is priced (via the
--     Equipment Coordination fee, itself never a rental price, only
--     Ordift's coordination fee on top of a supplier-quoted rental).
--   - Crew has NO universal day-rate table in V1 — crew price is
--     supplier-quote-driven (production_supplier_quotes) except for
--     the Ordift-side Standalone Crew Coordination fee, which is
--     percentage/minimum-based, not a per-role rate card.
--   - Tax, currency/FX conversion, deposits, cancellation, overtime for
--     external suppliers, catering, insurance/permits: NONE of these
--     have a universal rate row anywhere in this migration — every one
--     remains project/quote-specific by design, captured as fields on
--     production_supplier_quotes (original_currency_code,
--     supplier_subtotal, tax_amount, deposit_required/amount/
--     percentage, cancellation_terms) rather than a global formula.
--   - Cross-service recommendations reuse the existing static,
--     code-level registry (src/lib/services/crossServiceRecommendations.ts)
--     — no database table.
--   - discount_codes/discount_redemptions/payment_obligations: completely
--     untouched by this migration. WLCMBCK is not referenced anywhere
--     in this file.
--   - Authorization: production_market_rates/production_percentage_rates
--     administration reuses FINANCE_CAPABILITIES.pricingAdminister,
--     identical to every prior pricing family. Supplier/quote/budget
--     administration reuses OPERATIONS_CAPABILITIES.coordinate
--     ("operations.coordinate") — previously DORMANT in the existing
--     taxonomy, wired for the first time here, deliberately NOT
--     finance.payee.administer (a different domain) and NOT a new
--     capability string (the taxonomy already reserved "coordinate"
--     for exactly this kind of duty). No duplicate permission system
--     introduced.
--
-- 0001-0061 are not modified. Every statement below is additive (new
-- tables, one new reference-category row). No destructive statement
-- appears anywhere in this file.

begin;

insert into public.pricing_service_categories (slug, name, active, requires_custom_quote)
values ('production', 'Production Services', true, false)
on conflict (slug) do update set active = true;

-- ============================================================
-- PART A — production_market_rates (versioned, per market)
-- ============================================================
create table public.production_market_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  rate_slug text not null check (rate_slug in (
    'management_minimum', 'half_day_planning', 'full_day_planning', 'location_coordination', 'equipment_coordination_minimum', 'crew_coordination_minimum'
  )),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.production_market_rates is
  'Every market-scoped Ordift-side Production Services fee figure, by rate_slug. management_minimum is the floor for the Production Management fee formula (MAX(minimum, eligibleManagedExternalCost x 15%)); equipment_coordination_minimum/crew_coordination_minimum are the floors for their own standalone percentage formulas. location_coordination is a flat per-confirmed-location Ordift coordination fee — never a studio/location rental price, which remains separately supplier-quoted.';

create index production_market_rates_lookup_idx on public.production_market_rates (market_id, rate_slug, effective_from desc);

alter table public.production_market_rates enable row level security;

create policy "production_market_rates: staff read" on public.production_market_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_market_rates to authenticated;
grant select, insert, update, delete on public.production_market_rates to service_role;

insert into public.production_market_rates (market_id, rate_slug, price_usd)
select id, 'management_minimum', 150.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'management_minimum', 300.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'management_minimum', 400.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'management_minimum', 450.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'management_minimum', 350.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'management_minimum', 350.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'half_day_planning', 125.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'half_day_planning', 250.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'half_day_planning', 325.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'half_day_planning', 375.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'half_day_planning', 300.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'half_day_planning', 285.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'full_day_planning', 225.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'full_day_planning', 450.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'full_day_planning', 600.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'full_day_planning', 675.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'full_day_planning', 525.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'full_day_planning', 500.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'location_coordination', 75.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'location_coordination', 150.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'location_coordination', 200.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'location_coordination', 225.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'location_coordination', 175.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'location_coordination', 175.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'equipment_coordination_minimum', 50.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'equipment_coordination_minimum', 100.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'equipment_coordination_minimum', 125.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'equipment_coordination_minimum', 150.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'equipment_coordination_minimum', 110.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'equipment_coordination_minimum', 110.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'crew_coordination_minimum', 50.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'crew_coordination_minimum', 100.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'crew_coordination_minimum', 125.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'crew_coordination_minimum', 150.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'crew_coordination_minimum', 110.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'crew_coordination_minimum', 110.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — production_percentage_rates (global, versioned)
-- ============================================================
create table public.production_percentage_rates (
  id uuid primary key default gen_random_uuid(),
  percentage_slug text not null check (percentage_slug in ('management_fee', 'equipment_coordination', 'crew_coordination', 'management_overtime')),
  percentage numeric(5, 2) not null check (percentage > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.production_percentage_rates is
  'Global Production Services percentages: management_fee 15% (of eligible managed external production cost, floored at production_market_rates.management_minimum), equipment_coordination 10% and crew_coordination 12% (each floored at their own market minimum, standalone-engagement only — never stacked on costs already inside a Full Production Management scope), management_overtime 25% (of the Ordift Production Management fee itself, not external supplier/crew overtime, which remains supplier-agreement-driven).';

alter table public.production_percentage_rates enable row level security;

create policy "production_percentage_rates: staff read" on public.production_percentage_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_percentage_rates to authenticated;
grant select, insert, update, delete on public.production_percentage_rates to service_role;

insert into public.production_percentage_rates (percentage_slug, percentage) values
  ('management_fee', 15.00),
  ('equipment_coordination', 10.00),
  ('crew_coordination', 12.00),
  ('management_overtime', 25.00);

-- ============================================================
-- PART C — production_suppliers (internal procurement directory)
-- ============================================================
create table public.production_suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  supplier_name text not null,
  supplier_type text not null check (supplier_type in (
    'studio', 'location', 'equipment_rental', 'crew_freelancer', 'transport', 'catering', 'props', 'set_construction', 'styling', 'hair_makeup', 'talent_agency', 'permit_fixer', 'accommodation', 'courier_logistics', 'other'
  )),
  market_id uuid references public.pricing_markets (id),
  location_notes text,
  contact_name text,
  contact_email text,
  contact_phone text,
  currency_code text references public.currencies (code),
  indicative_rate numeric(12, 2),
  rate_unit text,
  last_verified_at timestamptz,
  capabilities text[],
  availability_notes text,
  internal_notes text,
  supporting_reference text,
  payment_terms text,
  -- Deliberately NOT a required link — most suppliers never have an
  -- Ordift platform account. See migration doc comment above.
  payee_profile_id uuid references public.payee_profiles (id),
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.production_suppliers is
  'Internal-only production supplier/procurement directory — NEVER exposed publicly (no public RLS policy exists on this table at all). Distinct from payee_profiles: a supplier is not required to be a platform profile; payee_profile_id is an optional link for the subset of suppliers who are also registered payees. indicative_rate/rate_unit/currency_code are a rough internal reference only, never a client-facing price — an actual engagement is always priced via production_supplier_quotes.';

create index production_suppliers_type_idx on public.production_suppliers (supplier_type);
create index production_suppliers_market_idx on public.production_suppliers (market_id);

alter table public.production_suppliers enable row level security;

create policy "production_suppliers: staff read" on public.production_suppliers
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_suppliers to authenticated;
grant select, insert, update, delete on public.production_suppliers to service_role;

-- ============================================================
-- PART D — production_supplier_quotes
-- ============================================================
create table public.production_supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  supplier_id uuid not null references public.production_suppliers (id),
  -- Polymorphic reference to the production engagement this quote is
  -- for — same established pattern as discount_redemptions.reference_type/
  -- reference_id and payment_obligations.source_type/source_reference.
  -- Typically 'enquiry', but deliberately not a hard FK so a future
  -- dedicated production-project entity can be introduced without a
  -- schema change here.
  reference_type text not null,
  reference_id text not null,
  description text not null,
  original_currency_code text not null references public.currencies (code),
  supplier_subtotal numeric(12, 2) not null check (supplier_subtotal > 0),
  tax_amount numeric(12, 2),
  quote_total numeric(12, 2) not null check (quote_total > 0),
  valid_until timestamptz,
  deposit_required boolean not null default false,
  deposit_amount numeric(12, 2),
  deposit_percentage numeric(5, 2),
  cancellation_terms text,
  source_reference text,
  status text not null default 'draft' check (status in ('draft', 'received', 'under_review', 'approved_internally', 'rejected', 'expired', 'superseded', 'committed')),
  internal_notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.production_supplier_quotes is
  'A supplier''s priced offer for a specific production engagement, in its ORIGINAL currency (never mutated when FX rates later change — historical supplier values are preserved as quoted). A status change here — including to ''committed'' — is a record of a staff decision only. It NEVER creates a payment_obligation, calls payables/payout code, or books/pays the supplier; actually engaging a supplier remains a separate, explicit action outside this table''s scope in V1.';

create index production_supplier_quotes_reference_idx on public.production_supplier_quotes (reference_type, reference_id);
create index production_supplier_quotes_supplier_idx on public.production_supplier_quotes (supplier_id);

alter table public.production_supplier_quotes enable row level security;

create policy "production_supplier_quotes: staff read" on public.production_supplier_quotes
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_supplier_quotes to authenticated;
grant select, insert, update, delete on public.production_supplier_quotes to service_role;

-- ============================================================
-- PART E — production_budgets (APPEND-ONLY version chain)
-- ============================================================
create table public.production_budgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) default public.ordift_studios_business_id(),
  reference_type text not null,
  reference_id text not null,
  status text not null check (status in ('estimate', 'supplier_quoted', 'internal_approved', 'client_presented', 'client_approved', 'committed', 'actual_final')),
  line_items jsonb not null default '[]'::jsonb,
  contingency_enabled boolean not null default false,
  contingency_percentage numeric(5, 2),
  contingency_amount_usd numeric(12, 2),
  total_usd numeric(12, 2),
  -- Self-referencing version chain — a new row's supersedes_id points
  -- at the row it replaces. NEVER updated in place: a budget change is
  -- always a new INSERT. Every historical version remains queryable.
  supersedes_id uuid references public.production_budgets (id),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.production_budgets is
  'Append-only production budget version chain per engagement (reference_type/reference_id, same polymorphic pattern as production_supplier_quotes). A budget change is ALWAYS a new row with supersedes_id set to the row it replaces — never an UPDATE of an existing row''s total_usd/line_items. total_usd may be null while material costs remain To Be Quoted; it must never render as 0/free for an unknown cost at the application layer. Once a reference''s latest version reaches client_approved/committed/actual_final, a new version with a materially different total requires a paired production_budget_changes row (enforced in productionBudgets.ts''s createBudgetVersion(), not by a DB constraint) — see that module''s doc comment.';

create index production_budgets_reference_idx on public.production_budgets (reference_type, reference_id, created_at desc);

alter table public.production_budgets enable row level security;

create policy "production_budgets: staff read" on public.production_budgets
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_budgets to authenticated;
grant select, insert, update, delete on public.production_budgets to service_role;

-- ============================================================
-- PART F — production_budget_changes (governed change/variation)
-- ============================================================
create table public.production_budget_changes (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.production_budgets (id),
  reason text not null,
  previous_amount_usd numeric(12, 2) not null,
  new_amount_usd numeric(12, 2) not null,
  difference_usd numeric(12, 2) not null,
  affected_lines jsonb not null default '[]'::jsonb,
  actor_user_id uuid references public.profiles (id),
  client_approval_status text not null default 'pending' check (client_approval_status in ('pending', 'approved', 'rejected')),
  client_approved_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.production_budget_changes is
  'Governed change/variation record against a budget version that had already reached client_approved/committed/actual_final — written atomically alongside the new production_budgets row that changed the total (see createBudgetVersion() in productionBudgets.ts). Preserves the exact previous/new/difference figures and the reason, so a material post-approval cost change (supplier price rise, added location, extra crew/day, new permit requirement, expanded scope) is never silent.';

create index production_budget_changes_budget_idx on public.production_budget_changes (budget_id);

alter table public.production_budget_changes enable row level security;

create policy "production_budget_changes: staff read" on public.production_budget_changes
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.production_budget_changes to authenticated;
grant select, insert, update, delete on public.production_budget_changes to service_role;

commit;
