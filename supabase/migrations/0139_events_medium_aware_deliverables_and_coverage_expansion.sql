-- Events medium-aware deliverables + coverage-level expansion (2026-09-28)
--
-- INSPECTION SUMMARY:
--   - Root cause of the reported "Edit Focused rate shows the wrong
--     medium's value" defect was NOT in this table layer — it was a
--     stale-`defaultValue` React reconciliation bug in
--     src/app/admin/pricing/page.tsx (an under-keyed <details>/<input>
--     block). Fixed in application code; no schema change was needed
--     for that part.
--   - wedding_event_tier_rates already has BOTH market_id and
--     service_mode (correctly medium/market-specific) — confirmed by
--     inspection of 0056. Not touched structurally here, only
--     extended with new tier-slug values and new rows (see PART A).
--   - wedding_event_tier_deliverables has NEITHER service_mode NOR
--     market_id — confirmed as the genuine data-model gap: every
--     service mode (Photography / Film / Photography+Film) currently
--     reads the SAME deliverable row per (category, tier_slug), so a
--     Photography-only booking incorrectly displays film deliverables
--     (highlight film length, "documentary included") that were never
--     purchased. PART B adds service_mode (additively, same pattern as
--     0056 PART F's scope_slug addition to corporate_priority_delivery_
--     rates) and versions in corrected, medium-split rows. The original
--     8 rows are left completely untouched (now implicitly reflecting
--     service_mode='photography_film', which is factually what they
--     always described — 1 photographer AND 1 filmmaker, a highlight
--     film length, etc.) — no historical value is mutated or deleted.
--   - Event coverage hours (approved correction): Focused 2h->1h, Half
--     Day 4h->2h, Full Day 8h->4h, Extended 12h->8h. coverage_hours
--     lives on wedding_event_tier_deliverables (confirmed a GLOBAL
--     column, not market-scoped), so this is one corrected value per
--     tier, not per-market. The four existing category='event' PRICES
--     in wedding_event_tier_rates are NOT touched — only the hour count
--     describing what those approved prices buy changes.
--   - Two new Event coverage levels are added: 'full_event' (12h) and
--     'round_the_clock' (24h) — chosen to read naturally after Focused
--     / Half Day / Full Day / Extended without overpromising. All three
--     service modes share the SAME coverage-hour ladder (1/2/4/8/12/24)
--     per tier: coverage hours describe booked wall-clock production
--     time, a scheduling dimension independent of which discipline(s)
--     are being shot, whereas price and deliverables genuinely do
--     differ by medium (Part 8 finding — documented further in
--     RATE_CARD_MEDIUM_PRICING.md).
--   - New tier prices (12h/24h, all 6 markets x 3 modes) were computed
--     programmatically from Ordift's own existing approved price
--     ladder (diminishing-but-floored per-hour rate for 12h, a real
--     second-shift/overnight premium for 24h). A pre-existing "Focused
--     + cheap extra hours undercuts Half Day" gap in the approved
--     ladder was found and closed architecturally, not by inflating
--     the Additional-Hour rate: application code (weddingEventEstimate.
--     ts's checkTierUpgrade()) now recommends the correct higher tier
--     whenever planned coverage (tier + planned Additional Hours)
--     reaches or exceeds that tier's own coverage hours, so Additional
--     Hours can stay a moderate, genuinely commercial overtime rate
--     (+30% across the board — see below). Full methodology, computed
--     values and market research sources are recorded in
--     RATE_CARD_MEDIUM_PRICING.md — not reproduced in full here to keep
--     this migration reviewable.
--   - No client-purchasable, booking, quotation, or commercial-document
--     table reads these prices/deliverables directly — the single
--     shared calculation path (calculateEventEstimate /
--     calculateWeddingEstimate in weddingEventEstimate.ts) is the only
--     consumer, confirmed by repo-wide search. No duplicate pricing
--     engine exists, so no other table needs updating.
--   - Every statement below is additive (new column, new constraint
--     values, new versioned rows) or a narrow ALTER of a CHECK
--     constraint to admit two new tier-slug values. No DROP/TRUNCATE/
--     DELETE/UPDATE of any existing data row appears anywhere in this
--     file.

begin;

-- ============================================================
-- PART A — wedding_event_tier_rates: admit the two new Event tiers,
-- add their prices for every market x service mode. The four existing
-- approved Event prices (all tiers, all modes, all markets) are
-- unchanged — only new rows are inserted.
-- ============================================================
alter table public.wedding_event_tier_rates
  drop constraint wedding_event_tier_rates_tier_slug_check;

alter table public.wedding_event_tier_rates
  add constraint wedding_event_tier_rates_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended', 'full_event', 'round_the_clock'))
  );

insert into public.wedding_event_tier_rates (market_id, category, service_mode, tier_slug, price_usd)
-- Event — photography — Full Event (12h) & Round-the-Clock (24h)
select id, 'event', 'photography', 'full_event', 1075.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'round_the_clock', 2360.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography', 'full_event', 2010.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'round_the_clock', 4345.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography', 'full_event', 2440.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'round_the_clock', 5245.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography', 'full_event', 2825.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'round_the_clock', 6095.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography', 'full_event', 2200.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'round_the_clock', 4770.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography', 'full_event', 2060.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography', 'round_the_clock', 4395.00 from public.pricing_markets where slug = 'other_international_custom'
-- Event — film — Full Event (12h) & Round-the-Clock (24h)
union all select id, 'event', 'film', 'full_event', 1335.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'round_the_clock', 2970.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'film', 'full_event', 2535.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'round_the_clock', 5575.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'film', 'full_event', 3015.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'round_the_clock', 6520.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'film', 'full_event', 3445.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'round_the_clock', 7420.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'film', 'full_event', 2635.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'round_the_clock', 5675.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'film', 'full_event', 2490.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'film', 'round_the_clock', 5295.00 from public.pricing_markets where slug = 'other_international_custom'
-- Event — photography_film — Full Event (12h) & Round-the-Clock (24h)
union all select id, 'event', 'photography_film', 'full_event', 2010.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'round_the_clock', 4345.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'event', 'photography_film', 'full_event', 3970.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'round_the_clock', 8645.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'event', 'photography_film', 'full_event', 4785.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'round_the_clock', 10395.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'event', 'photography_film', 'full_event', 5455.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'round_the_clock', 11765.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'event', 'photography_film', 'full_event', 4210.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'round_the_clock', 9120.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'event', 'photography_film', 'full_event', 4020.00 from public.pricing_markets where slug = 'other_international_custom'
union all select id, 'event', 'photography_film', 'round_the_clock', 8695.00 from public.pricing_markets where slug = 'other_international_custom';

-- ============================================================
-- PART B — wedding_event_tier_deliverables: add service_mode
-- (additive, same pattern as 0056 PART F's scope_slug addition to
-- corporate_priority_delivery_rates), admit the two new Event tiers,
-- and insert corrected/medium-split versions. The original 8 rows are
-- untouched and simply become historical (superseded by later-
-- effective_from rows for the same category/tier_slug/service_mode
-- key, per the existing dedupe-by-most-recent read pattern).
-- ============================================================
alter table public.wedding_event_tier_deliverables
  add column service_mode text not null default 'photography_film';

alter table public.wedding_event_tier_deliverables
  add constraint wedding_event_tier_deliverables_service_mode_check
  check (service_mode in ('photography', 'film', 'photography_film'));

alter table public.wedding_event_tier_deliverables
  alter column service_mode drop default;

comment on column public.wedding_event_tier_deliverables.service_mode is
  'Added 2026-09-28 to fix Photography-only bookings incorrectly showing Film deliverables (and vice versa) — every row before this migration is backfilled as photography_film, which is what that single shared row always actually described (photographer AND filmmaker counts, a highlight-film length). New photography-only and film-only rows are versioned in alongside it.';

alter table public.wedding_event_tier_deliverables
  drop constraint wedding_event_tier_deliverables_tier_slug_check;

alter table public.wedding_event_tier_deliverables
  add constraint wedding_event_tier_deliverables_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended', 'full_event', 'round_the_clock'))
  );

drop index public.wedding_event_tier_deliverables_lookup_idx;
create index wedding_event_tier_deliverables_lookup_idx on public.wedding_event_tier_deliverables (category, tier_slug, service_mode, effective_from desc);

-- Wedding — Photography-only and Film-only variants of the four
-- existing collections (Photography+Film keeps its original,
-- untouched row — no hour/price change applies to Wedding).
insert into public.wedding_event_tier_deliverables
  (category, tier_slug, service_mode, event_days, coverage_hours, photographers, filmmakers, professionally_edited_images_min, signature_retouched_images, highlight_film_min_minutes, highlight_film_max_minutes, includes_documentary, online_gallery, planning_consultation, priority_sneak_peek)
values
  ('wedding', 'chapter', 'photography', 1, 4, 1, 0, 150, 10, null, null, false, true, true, false),
  ('wedding', 'chapter', 'film', 1, 4, 0, 1, 0, 0, 3, 4, false, true, true, false),
  ('wedding', 'narrative', 'photography', 1, 8, 1, 0, 350, 20, null, null, false, true, true, true),
  ('wedding', 'narrative', 'film', 1, 8, 0, 1, 0, 0, 5, 7, false, true, true, true),
  ('wedding', 'chronicle', 'photography', 1, 12, 2, 0, 550, 30, null, null, false, true, true, true),
  ('wedding', 'chronicle', 'film', 1, 12, 0, 2, 0, 0, 8, 12, true, true, true, true),
  ('wedding', 'archive', 'photography', 2, 16, 2, 0, 750, 40, null, null, false, true, true, true),
  ('wedding', 'archive', 'film', 2, 16, 0, 2, 0, 0, 10, 15, true, true, true, true);

-- Event — all three modes, corrected coverage_hours (Focused 2->1,
-- Half Day 4->2, Full Day 8->4, Extended 12->8), plus the two new
-- tiers (Full Event 12h, Round-the-Clock 24h). Photography-only and
-- Film-only rows reuse the combined row's own discipline-specific
-- figures (no invented numbers); Round-the-Clock is the only Event
-- tier that bundles Full Event/Documentary Recording, mirroring
-- Wedding's top-tier pattern.
insert into public.wedding_event_tier_deliverables
  (category, tier_slug, service_mode, event_days, coverage_hours, photographers, filmmakers, professionally_edited_images_min, signature_retouched_images, highlight_film_min_minutes, highlight_film_max_minutes, includes_documentary, online_gallery, planning_consultation, priority_sneak_peek)
values
  ('event', 'focused', 'photography_film', 1, 1, 1, 1, 75, 5, 1, 2, false, true, false, false),
  ('event', 'focused', 'photography', 1, 1, 1, 0, 75, 5, null, null, false, true, false, false),
  ('event', 'focused', 'film', 1, 1, 0, 1, 0, 0, 1, 2, false, true, false, false),
  ('event', 'half_day', 'photography_film', 1, 2, 1, 1, 150, 8, 2, 3, false, true, false, false),
  ('event', 'half_day', 'photography', 1, 2, 1, 0, 150, 8, null, null, false, true, false, false),
  ('event', 'half_day', 'film', 1, 2, 0, 1, 0, 0, 2, 3, false, true, false, false),
  ('event', 'full_day', 'photography_film', 1, 4, 1, 1, 300, 12, 3, 5, false, true, false, false),
  ('event', 'full_day', 'photography', 1, 4, 1, 0, 300, 12, null, null, false, true, false, false),
  ('event', 'full_day', 'film', 1, 4, 0, 1, 0, 0, 3, 5, false, true, false, false),
  ('event', 'extended', 'photography_film', 1, 8, 2, 2, 450, 18, 5, 7, false, true, false, false),
  ('event', 'extended', 'photography', 1, 8, 2, 0, 450, 18, null, null, false, true, false, false),
  ('event', 'extended', 'film', 1, 8, 0, 2, 0, 0, 5, 7, false, true, false, false),
  ('event', 'full_event', 'photography_film', 1, 12, 2, 2, 650, 25, 8, 12, false, true, false, false),
  ('event', 'full_event', 'photography', 1, 12, 2, 0, 650, 25, null, null, false, true, false, false),
  ('event', 'full_event', 'film', 1, 12, 0, 2, 0, 0, 8, 12, false, true, false, false),
  ('event', 'round_the_clock', 'photography_film', 2, 24, 3, 3, 1100, 40, 15, 20, true, true, true, true),
  ('event', 'round_the_clock', 'photography', 2, 24, 3, 0, 1100, 40, null, null, false, true, true, true),
  ('event', 'round_the_clock', 'film', 2, 24, 0, 3, 0, 0, 15, 20, true, true, true, true);

-- ============================================================
-- PART C — wedding_event_priority_delivery_rates: admit the two new
-- Event tiers, continue the existing "longer coverage -> a smaller
-- rush-fee percentage" trend (35/35/30/30 -> 28/25) — still a larger
-- absolute rush fee on a larger subtotal, not a smaller one.
-- ============================================================
alter table public.wedding_event_priority_delivery_rates
  drop constraint wedding_event_priority_delivery_rates_tier_slug_check;

alter table public.wedding_event_priority_delivery_rates
  add constraint wedding_event_priority_delivery_rates_tier_slug_check check (
    (category = 'wedding' and tier_slug in ('chapter', 'narrative', 'chronicle', 'archive'))
    or (category = 'event' and tier_slug in ('focused', 'half_day', 'full_day', 'extended', 'full_event', 'round_the_clock'))
  );

insert into public.wedding_event_priority_delivery_rates (category, tier_slug, multiplier_percentage) values
  ('event', 'full_event', 28.00),
  ('event', 'round_the_clock', 25.00);

-- ============================================================
-- PART D — wedding_event_addon_rates: revised additional-hour rates
-- (Part 7, Founder-redesigned architecture). A first pass priced the
-- anti-exploit problem away with steep per-hour rates (>= the steepest
-- adjacent marginal tier-price rate); the Founder rejected that as too
-- aggressive for what should function as genuine overtime pricing and
-- asked for the exploit to be closed structurally instead — see the
-- package-upgrade check in weddingEventEstimate.ts
-- (checkTierUpgrade()/EVENT_TIER_ORDER/WEDDING_TIER_ORDER): when
-- planned coverage (tier + planned Additional Hours) reaches or
-- exceeds the next tier's own coverage hours, the estimator now
-- recommends that tier directly instead of pricing "lower tier +
-- hours" at all, so the ladder is protected without an inflated hourly
-- rate. With that protection in place, Additional Hours reverts to a
-- moderate, genuinely commercial overtime rate: a flat +30% over the
-- previous rate in every market/mode (Ghana Photography lands at
-- exactly +USD 25, the bottom of the Founder's own +25-30 reference;
-- every other cell lands in the +28% to +31% band around that same
-- anchor — a percentage increase, not a flat dollar amount, so each
-- market's existing proportional relationship to the others is
-- preserved rather than distorted). Full A/B/C/D working in
-- RATE_CARD_MEDIUM_PRICING.md.
-- ============================================================
insert into public.wedding_event_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_photo_hour', 115.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_photo_hour', 230.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_photo_hour', 295.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_photo_hour', 325.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_photo_hour', 260.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_photo_hour', 245.00 from public.pricing_markets where slug = 'other_international_custom';

insert into public.wedding_event_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_film_hour', 130.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_film_hour', 260.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_film_hour', 325.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_film_hour', 360.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_film_hour', 295.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_film_hour', 275.00 from public.pricing_markets where slug = 'other_international_custom';

insert into public.wedding_event_addon_rates (market_id, addon_slug, price_usd)
select id, 'additional_photofilm_hour', 210.00 from public.pricing_markets where slug = 'ghana'
union all select id, 'additional_photofilm_hour', 415.00 from public.pricing_markets where slug = 'qatar'
union all select id, 'additional_photofilm_hour', 520.00 from public.pricing_markets where slug = 'uk_western_europe'
union all select id, 'additional_photofilm_hour', 585.00 from public.pricing_markets where slug = 'north_america'
union all select id, 'additional_photofilm_hour', 470.00 from public.pricing_markets where slug = 'asia_pacific'
union all select id, 'additional_photofilm_hour', 440.00 from public.pricing_markets where slug = 'other_international_custom';

commit;
