-- Ordift Pricing Engine V1.1 (2026-09-06)
--
-- Activates subject/group multiplier pricing, all six pricing markets
-- (Ghana/Qatar unchanged, UK/North America/Asia-Pacific/Other
-- International newly approved), and per-market additional Signature
-- Retouched Image pricing.
--
-- INSPECTION SUMMARY (this same date):
--   - subject_categories (0053): its supplement_usd column modeled an
--     ADDITIVE supplement; the newly approved business rule is
--     MULTIPLICATIVE (rate × 1.20, not rate + $X). Rather than
--     repurpose supplement_usd's meaning in place (which would make
--     the column's own name and its existing V1 comment actively
--     wrong), a new, purpose-named, versioned
--     subject_category_multiplier_rates table is added instead — the
--     smallest additive/reversible change, mirroring
--     personal_session_rates' own proven append-only versioning
--     pattern exactly. subject_category_rates itself
--     (min_subjects/max_subjects/slug/name) is untouched structurally;
--     only its active/requires_custom_quote flags are updated to
--     reflect the newly approved categories (data activation, not a
--     destructive change — no row is deleted, no historical row exists
--     yet for any of these categories since none has ever been used in
--     a real quote or booking).
--   - pricing_markets/personal_session_rates (0053): Ghana/Qatar rows
--     are completely untouched — no UPDATE, no re-insert. The four
--     other markets are activated (active=true) and given their first
--     real rate rows, via the exact same append-only INSERT pattern
--     0053 already established for Ghana/Qatar.
--   - A new additional_retouch_rates table (versioned, one active row
--     per market) is added for the newly approved additional Signature
--     Retouched Image per-image pricing — deliberately separate from
--     personal_session_rates (a different priced concept, per-image
--     rather than per-session) rather than overloading that table's
--     shape.
--   - discount_codes/discount_redemptions (0053): completely untouched
--     — the existing discount architecture is reused as-is per
--     explicit instruction, not duplicated.
--
-- Every change below is additive or a data-activation UPDATE of
-- previously-inactive/unapproved reference rows that have never been
-- used in a real quote or booking. No destructive statement (DROP/
-- TRUNCATE/DELETE) appears anywhere in this file. No existing table's
-- columns, RLS policies, or grants are altered.

begin;

-- ============================================================
-- PART A — activate the four remaining pricing markets
-- ============================================================
update public.pricing_markets
set active = true
where slug in ('uk_western_europe', 'north_america', 'asia_pacific', 'other_international_custom');

-- ============================================================
-- PART B — personal_session_rates for the four newly activated markets
-- ============================================================
-- Ghana/Qatar rows from 0053 are untouched — not re-inserted, not
-- updated. Same append-only pattern: these are the FIRST rate rows
-- for these four markets, not a version replacing anything.
insert into public.personal_session_rates (market_id, duration_hours, price_usd, signature_retouched_images, professionally_edited_images)
select id, 1, 225.00, 5, 10 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 2, 375.00, 8, 15 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 3, 500.00, 12, 25 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 4, 625.00, 15, 35 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 1, 250.00, 5, 10 from public.pricing_markets where slug = 'north_america'
union all select id, 2, 425.00, 8, 15 from public.pricing_markets where slug = 'north_america'
union all select id, 3, 575.00, 12, 25 from public.pricing_markets where slug = 'north_america'
union all select id, 4, 700.00, 15, 35 from public.pricing_markets where slug = 'north_america'
union all select id, 1, 200.00, 5, 10 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 2, 340.00, 8, 15 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 3, 460.00, 12, 25 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 4, 575.00, 15, 35 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 1, 200.00, 5, 10 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 2, 350.00, 8, 15 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 3, 475.00, 12, 25 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 4, 600.00, 15, 35 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART C — activate the newly approved subject/group categories
-- ============================================================
-- Data-activation UPDATE only (active/requires_custom_quote flags) —
-- min_subjects/max_subjects/slug/name are untouched. large_group is
-- deliberately left as-is (active=false, requires_custom_quote=true —
-- no automatic rate approved this phase, still routes to custom quote).
update public.subject_categories
set active = true, requires_custom_quote = false
where slug in ('couple', 'family_small_group', 'limited_guest_appearance');

-- ============================================================
-- PART D — subject_category_multiplier_rates (versioned)
-- ============================================================
create table public.subject_category_multiplier_rates (
  id uuid primary key default gen_random_uuid(),
  subject_category_id uuid not null references public.subject_categories (id),
  price_multiplier numeric(4, 2) check (price_multiplier > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.subject_category_multiplier_rates is
  'Versioned price multiplier applied to the base personal_session_rates price for a given subject/group category (e.g. Couple = 1.20x). Append-only, mirroring personal_session_rates own pattern: a rate change is always a new INSERT with a later effective_from, never an UPDATE, so an existing quote/booking''s meaning is never silently rewritten by a future rate change. price_multiplier is nullable (and no row need exist at all) for a category with no approved rate yet — e.g. large_group, which has no row here and remains custom-quote-only.';

create index subject_category_multiplier_rates_category_idx on public.subject_category_multiplier_rates (subject_category_id, effective_from desc);

alter table public.subject_category_multiplier_rates enable row level security;

create policy "subject_category_multiplier_rates: staff read" on public.subject_category_multiplier_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.subject_category_multiplier_rates to authenticated;
grant select, insert, update, delete on public.subject_category_multiplier_rates to service_role;

insert into public.subject_category_multiplier_rates (subject_category_id, price_multiplier)
select id, 1.00 from public.subject_categories where slug = 'individual'
union all select id, 1.20 from public.subject_categories where slug = 'couple'
union all select id, 1.40 from public.subject_categories where slug = 'family_small_group'
union all select id, 1.00 from public.subject_categories where slug = 'limited_guest_appearance';
-- large_group: deliberately no row — remains custom-quote-only, no automatic rate approved this phase.

-- ============================================================
-- PART E — additional_retouch_rates (versioned, per market)
-- ============================================================
create table public.additional_retouch_rates (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.pricing_markets (id),
  price_per_image_usd numeric(10, 2) not null check (price_per_image_usd > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.additional_retouch_rates is
  'Versioned per-image price for an ADDITIONAL Signature Retouched Image beyond what a session''s base package already includes, by market. Deliberately separate from personal_session_rates (a different priced concept — per-image, not per-session). Does NOT apply to Professionally Edited Images — no additional-Professionally-Edited-Image pricing is approved or represented anywhere in this schema.';

create index additional_retouch_rates_market_idx on public.additional_retouch_rates (market_id, effective_from desc);

alter table public.additional_retouch_rates enable row level security;

create policy "additional_retouch_rates: staff read" on public.additional_retouch_rates
  for select
  to authenticated
  using ((select private.is_staff_or_admin()));

grant select on public.additional_retouch_rates to authenticated;
grant select, insert, update, delete on public.additional_retouch_rates to service_role;

insert into public.additional_retouch_rates (market_id, price_per_image_usd)
select id, 12.00 from public.pricing_markets where slug = 'ghana'
union all select id, 18.00 from public.pricing_markets where slug = 'qatar'
union all select id, 25.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 30.00 from public.pricing_markets where slug = 'north_america'
union all select id, 22.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 22.00 from public.pricing_markets where slug = 'other_international_custom';

commit;
