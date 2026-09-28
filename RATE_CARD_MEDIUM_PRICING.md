# Rate Card — Medium-Aware Pricing, Deliverables & Event Coverage Expansion

**Date:** 2026-09-28
**Related:** `TECHNICAL_DECISION_RECORDS.md` TDR-019, migration `0139_events_medium_aware_deliverables_and_coverage_expansion.sql`

This is the research/methodology record for the Rate Card work described in TDR-019 — the root-cause fix, architecture change, and QA are documented there. This file records only: (1) the Film-deliverable-progression research used for Event Film packages, (2) the pricing methodology for the two new Event coverage levels, and (3) the additional-hour repricing methodology. Nothing here is copied verbatim from any competitor or source — each finding informed an Ordift-specific structure, worded and priced independently.

## 1. Film deliverable-progression research (Part 3)

**Question:** for professional, non-wedding event videography, what is a commercially reasonable, realistic deliverable progression by coverage length — without assuming raw footage, drone, multicam, same-day edit, or a fixed runtime unless the package genuinely supports it?

**Findings, by observed convention:**
- Short coverage (roughly 1–2 hours booked): a single short-form deliverable (a 1–3 minute recap/highlight) is standard across event-videography price lists observed; full/raw footage delivery is consistently an add-on or explicitly out of scope at this tier, not a default inclusion.
- Half-day coverage (roughly 2–4 hours): the highlight length grows modestly (2–4 minutes is typical); some studios begin offering a short secondary cut (e.g. a vertical/social cut) as a differentiator, but this is inconsistent enough across sources that it reads as a studio-specific upsell, not a norm — not adopted here as a default inclusion.
- Full-day coverage (4–8 hours): highlight length in the 3–6 minute range is common; turnaround commitments (not runtime) start appearing as a stated deliverable at this tier in several observed price lists.
- Multi-day or extended (8+ hours) coverage: this is where a genuine two-deliverable pattern becomes common — a short highlight (3–7 min) plus a longer "recap" or "documentary edit" (10–20+ min) as a separate, second video. This is a real and recurring pattern, not a one-off.
- Raw/full footage, drone, and live multicam switching are consistently treated as add-ons or bespoke inclusions across every tier observed — never a default "every coverage level gets this" inclusion.

**How this informed Ordift's structure:** the six-tier Event Film ladder (1h/2h/4h/8h/12h/24h) uses a single, monotonically growing highlight-film range (1–2 → 2–3 → 3–5 → 5–7 → 8–12 → 15–20 minutes) rather than a fixed runtime, consistent with "runtime is a floor, not a cap" (matching the existing `_min`/`_max` column design and comment). Raw footage, drone, and livestreaming remain add-ons at every tier, matching the observed universal pattern.

**Deliberately deferred, not implemented:** the two-deliverable (short highlight + longer recap) pattern observed at the longest coverage levels was considered for Full Event (12h) and Round-the-Clock (24h). It was NOT implemented in this pass — `wedding_event_tier_deliverables` has no admin-editable write path at all today (confirmed by inspection: no `createWeddingEventTierDeliverableVersion` function exists, unlike every other rate table in this schema), so adding a second nullable min/max column pair now would extend a table nobody can currently maintain through the UI, for a distinction the estimator/admin table cannot yet display meaningfully. Recorded as a genuine, well-evidenced future enhancement rather than implemented speculatively — see the Final Report's "remaining issues" item.

## 2. New coverage-level pricing methodology (Full Event / 12h, Round-the-Clock / 24h) — Parts 5/6

The four existing Event tier prices (Focused/Half Day/Full Day/Extended) are approved and were never touched — Part 4 only relabels the hours they describe (2h→1h, 4h→2h, 8h→4h, 12h→8h). The two new tiers' prices were derived **from Ordift's own existing ladder**, per market and per service mode, using a programmatic (not hand-typed) method to keep 108 new figures (6 markets × 3 modes × 2 tiers, plus 18 revised add-on rates) internally consistent:

1. For each market/mode, compute the marginal $/hour rate between each pair of adjacent existing tiers (Focused→Half Day, Half Day→Full Day, Full Day→Extended). This ladder already shows a diminishing marginal rate as coverage grows (bulk-discount behaviour), which is the expected, defensible shape for a package-priced service.
2. **Full Event (12h):** continue that diminishing curve — the marginal rate for the 4 additional hours beyond Extended is set to roughly 82% of the Full Day→Extended marginal rate (a further, smaller easing), floored at $35/hr so it never reads as effectively free. `price(12h) = price(8h) + 4 × rate`.
3. **Round-the-Clock (24h):** modelled as a genuine step change, not a continuation of the same curve. A 24-hour production requires a second crew rotation — no single photographer/filmmaker works a clean 24-hour shift and deliver consistent quality — plus overnight logistics (meals, rest, transport, and typically a second day of post-production intake). The marginal rate for these last 12 hours is set to ~1.9× the 8h→12h marginal rate, reflecting that real second-shift/overnight premium. `price(24h) = price(12h) + 12 × rate`.
4. All results rounded to the nearest $5 for clean, presentable figures.

This produced a per-hour *average* cost that falls from Focused through Full Event (expected economies of scale) and then rises again slightly at Round-the-Clock (expected — a second shift is not a further discount, it is a real added cost), which is the commercially realistic shape for this kind of booking, not a smooth extrapolation that would understate a 24-hour production's real cost.

**Full computed table** (USD):

| Market | Mode | 12h "Full Event" | 24h "Round-the-Clock" |
|---|---|---:|---:|
| Ghana | Photography | 1,075 | 2,360 |
| Ghana | Film | 1,335 | 2,970 |
| Ghana | Photography + Film | 2,010 | 4,345 |
| Qatar/GCC | Photography | 2,010 | 4,345 |
| Qatar/GCC | Film | 2,535 | 5,575 |
| Qatar/GCC | Photography + Film | 3,970 | 8,645 |
| UK/W. Europe | Photography | 2,440 | 5,245 |
| UK/W. Europe | Film | 3,015 | 6,520 |
| UK/W. Europe | Photography + Film | 4,785 | 10,395 |
| North America | Photography | 2,825 | 6,095 |
| North America | Film | 3,445 | 7,420 |
| North America | Photography + Film | 5,455 | 11,765 |
| Asia-Pacific | Photography | 2,200 | 4,770 |
| Asia-Pacific | Film | 2,635 | 5,675 |
| Asia-Pacific | Photography + Film | 4,210 | 9,120 |
| Other Int'l/Custom | Photography | 2,060 | 4,395 |
| Other Int'l/Custom | Film | 2,490 | 5,295 |
| Other Int'l/Custom | Photography + Film | 4,020 | 8,695 |

## 3. Additional-hour pricing & the anti-exploit architecture — Part 7 (Founder-redesigned)

**The Founder's preliminary sense** was roughly +USD 25–30 on the existing `additional_photo_hour` rate. Checking that against the existing tier ladder surfaced a real commercial problem the preliminary figure alone would not have fixed:

**The exploit, precisely stated:** for every market and mode, the existing approved tier ladder's steepest gap (consistently Focused→Half Day) implies a marginal $/hour rate well above the *old* published `additional_photo_hour` rate — e.g. Ghana's Focused→Half Day jump implies $150/hr against an old rate of only $90/hr. That means a client could book Focused and buy 1 extra hour for less than the price of Half Day — **an exploit that already existed today**, independent of this task, and one a flat +$25–30 addon adjustment would not have closed (that only reaches ~$115–120/hr in Ghana, still below the $150/hr needed).

**First proposal (rejected):** close the gap by raising the Additional-Hour rate itself to strictly clear the steepest marginal rate in every market/mode (up to +190% in some cells). The Founder rejected this as too aggressive for what is meant to function as genuine overtime pricing, and asked for the exploit to be closed structurally instead of priced away.

**Approved architecture — package-upgrade, not punitive pricing:** at quotation/estimate time, if the client's planned coverage (selected tier's coverage hours + planned Additional Hours) reaches or exceeds a higher tier's own coverage hours, the estimator no longer computes "lower tier price + hourly add-ons" for that combination — it recommends the appropriate higher tier instead, with that tier's own price and deliverables. Implemented as `checkTierUpgrade()` in `weddingEventEstimate.ts`, driven by `EVENT_TIER_ORDER`/`WEDDING_TIER_ORDER` (so the two new tiers are automatically protected too), returning a new `requiresTierUpgrade` outcome on `calculateEventEstimate`/`calculateWeddingEstimate` — a sibling of the existing `requiresCustomQuote` outcome, not a code path bolted on separately. This picks the *highest* qualifying tier (e.g. Focused + 7 planned hours lands on Extended, not Half Day), so the recommendation never undershoots what was actually planned.

This only inspects hours entered while **planning/quoting** — an optional `bypassTierUpgradeCheck` parameter exists (unused by any current caller) for a future genuine on-the-day-overtime billing tool, where retroactively redirecting an already-commenced booking to a different package makes no sense: the crew and schedule for the originally confirmed tier are already committed. See Principle 3 in the worked examples below.

With the ladder now protected structurally, Additional Hours reverts to a **moderate, genuinely commercial overtime rate**: a flat **+30%** over the previous rate in every market/mode. A percentage, not a flat dollar amount, so each market's existing proportional relationship to the others is preserved rather than distorted (a flat +$25 would be +28% in Ghana but only +14% in Qatar). Ghana Photography lands at exactly +$25 — the bottom of the Founder's own +25–30 reference; every other cell lands in the +28%–31% band around that same anchor.

**Final approved Additional-Hour rates** (USD/hour):

| Market | Photo hour | Film hour | Photo+Film hour |
|---|---:|---:|---:|
| Ghana | 115 (was 90, +27.8%) | 130 (was 100, +30.0%) | 210 (was 160, +31.3%) |
| Qatar/GCC | 230 (was 175, +31.4%) | 260 (was 200, +30.0%) | 415 (was 320, +29.7%) |
| UK/W. Europe | 295 (was 225, +31.1%) | 325 (was 250, +30.0%) | 520 (was 400, +30.0%) |
| North America | 325 (was 250, +30.0%) | 360 (was 275, +30.9%) | 585 (was 450, +30.0%) |
| Asia-Pacific | 260 (was 200, +30.0%) | 295 (was 225, +31.1%) | 470 (was 360, +30.6%) |
| Other Int'l/Custom | 245 (was 190, +28.9%) | 275 (was 210, +31.0%) | 440 (was 340, +29.4%) |

**Worked examples** (Ghana/Photography shown; identical shape in every market/mode):

| Scenario | Total planned hours | Crosses next tier? | Result |
|---|---|---|---|
| Focused (1h) + 1 planned extra hour | 2h | Yes — matches Half Day (2h) | Recommends Half Day ($325), not $175 + $115 = $290 |
| Half Day (2h) + 2 planned extra hours | 4h | Yes — matches Full Day (4h) | Recommends Full Day ($575), not $325 + 2×$115 = $555 |
| Full Day (4h) + 1 extra hour | 5h | No — Extended is 8h | Ordinary add-on: $575 + $115 = $690 (genuine partial extension) |
| Extended (8h) + 2 extra hours | 10h | No — Full Event is 12h | Ordinary add-on: $850 + 2×$115 = $1,080 |
| Genuine overtime requested on the day (event already confirmed/underway at Extended) | — | Rule does not apply (`bypassTierUpgradeCheck`) | Standard Additional-Hour rate, $115/hr, regardless of nominal total — the crew/schedule commitment for Extended was already made before the event started |

Every non-bypass scenario above, across all 6 markets, 3 modes and 6 tiers, is covered by automated regression tests in `weddingEventEstimate.test.ts`.

**Client-facing wording:** the upgrade recommendation is surfaced positively — e.g. *"Package upgrade recommended — your planned coverage reaches the Full Day package. Full Day provides the appropriate coverage and package deliverables."* — via `formatTierUpgradeMessage()`, the single source of that copy for every surface. No internal anti-exploit/arbitrage terminology is ever shown to a client.

## 4. Priority Delivery percentages for the two new tiers

Continuing the existing "longer coverage → a smaller rush-fee percentage" pattern (35% / 35% / 30% / 30% for the four existing tiers): Full Event (12h) = 28%, Round-the-Clock (24h) = 25%. A smaller percentage on a materially larger subtotal is still a larger absolute rush fee — this is not a discount, it avoids compounding an already-large production's rush premium disproportionately.
