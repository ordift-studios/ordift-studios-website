import { describe, expect, it } from "vitest";
import {
  calculateContentCreationEstimate,
  calculateContentCreationRetainerEstimate,
  type ContentCreationPackageRate,
  type ContentCreationRetainerRate,
  type ContentCreationAddonSlug,
  type ContentCreationPercentageSlug,
} from "./contentCreationEstimate";

// Ordift Content Creation Pricing V1 (2026-09-07) —
// calculateContentCreationEstimate()/calculateContentCreationRetainerEstimate()
// are pure (take already-fetched rates rather than querying themselves),
// so the actual pricing decision logic is directly unit-testable without
// a live Supabase session — same established pure/impure split as every
// other pricing family.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;

const SINGLE_RATES: Record<string, number> = { ghana: 125, qatar: 250, uk_western_europe: 325, north_america: 375, asia_pacific: 300, other_international_custom: 285 };
const PACK_3_RATES: Record<string, number> = { ghana: 325, qatar: 650, uk_western_europe: 850, north_america: 975, asia_pacific: 775, other_international_custom: 750 };
const PACK_5_RATES: Record<string, number> = { ghana: 500, qatar: 1000, uk_western_europe: 1300, north_america: 1500, asia_pacific: 1200, other_international_custom: 1150 };
const CONTENT_DAY_HALF_RATES: Record<string, number> = { ghana: 450, qatar: 900, uk_western_europe: 1200, north_america: 1350, asia_pacific: 1050, other_international_custom: 1000 };
const CONTENT_DAY_FULL_RATES: Record<string, number> = { ghana: 750, qatar: 1500, uk_western_europe: 2000, north_america: 2250, asia_pacific: 1750, other_international_custom: 1650 };
const EVENT_CONTENT_4H_RATES: Record<string, number> = { ghana: 400, qatar: 800, uk_western_europe: 1050, north_america: 1200, asia_pacific: 950, other_international_custom: 900 };
const PERSONAL_BRAND_2H_RATES: Record<string, number> = { ghana: 300, qatar: 600, uk_western_europe: 800, north_america: 900, asia_pacific: 700, other_international_custom: 675 };

const RETAINER_ESSENTIAL_RATES: Record<string, number> = { ghana: 405, qatar: 810, uk_western_europe: 1080, north_america: 1215, asia_pacific: 945, other_international_custom: 900 };
const RETAINER_GROWTH_RATES: Record<string, number> = { ghana: 675, qatar: 1350, uk_western_europe: 1800, north_america: 2025, asia_pacific: 1575, other_international_custom: 1485 };
const RETAINER_MOMENTUM_RATES: Record<string, number> = { ghana: 1350, qatar: 2700, uk_western_europe: 3600, north_america: 4050, asia_pacific: 3150, other_international_custom: 2970 };

const ADDITIONAL_VIDEO_RATES: Record<string, number> = { ghana: 100, qatar: 200, uk_western_europe: 260, north_america: 300, asia_pacific: 240, other_international_custom: 225 };
const ADDITIONAL_10_PHOTOS_RATES: Record<string, number> = { ghana: 75, qatar: 150, uk_western_europe: 200, north_america: 225, asia_pacific: 175, other_international_custom: 165 };
const ADDITIONAL_HOUR_RATES: Record<string, number> = { ghana: 90, qatar: 175, uk_western_europe: 225, north_america: 250, asia_pacific: 200, other_international_custom: 190 };
const SAME_NEXT_DAY_EDIT_RATES: Record<string, number> = { ghana: 75, qatar: 150, uk_western_europe: 200, north_america: 225, asia_pacific: 175, other_international_custom: 165 };
const ASPECT_RATIO_RATES: Record<string, number> = { ghana: 20, qatar: 40, uk_western_europe: 50, north_america: 60, asia_pacific: 45, other_international_custom: 45 };
const CAPTIONED_MASTER_RATES: Record<string, number> = { ghana: 25, qatar: 50, uk_western_europe: 65, north_america: 75, asia_pacific: 60, other_international_custom: 55 };
const REVISION_MINIMUMS: Record<string, number> = { ghana: 25, qatar: 50, uk_western_europe: 70, north_america: 80, asia_pacific: 60, other_international_custom: 60 };

const PERCENTAGES: Partial<Record<ContentCreationPercentageSlug, number>> = { priority: 30, additional_revision: 15 };

function packageRates(market: string): ContentCreationPackageRate[] {
  return [
    { marketId: market, packageSlug: "short_form_single", priceUsd: SINGLE_RATES[market] },
    { marketId: market, packageSlug: "short_form_pack_3", priceUsd: PACK_3_RATES[market] },
    { marketId: market, packageSlug: "short_form_pack_5", priceUsd: PACK_5_RATES[market] },
    { marketId: market, packageSlug: "content_day_half", priceUsd: CONTENT_DAY_HALF_RATES[market] },
    { marketId: market, packageSlug: "content_day_full", priceUsd: CONTENT_DAY_FULL_RATES[market] },
    { marketId: market, packageSlug: "event_content_4h", priceUsd: EVENT_CONTENT_4H_RATES[market] },
    { marketId: market, packageSlug: "personal_brand_2h", priceUsd: PERSONAL_BRAND_2H_RATES[market] },
  ];
}

function retainerRates(market: string): ContentCreationRetainerRate[] {
  return [
    { marketId: market, retainerSlug: "retainer_essential", priceUsd: RETAINER_ESSENTIAL_RATES[market] },
    { marketId: market, retainerSlug: "retainer_growth", priceUsd: RETAINER_GROWTH_RATES[market] },
    { marketId: market, retainerSlug: "retainer_momentum", priceUsd: RETAINER_MOMENTUM_RATES[market] },
  ];
}

function addonRates(market: string): Partial<Record<ContentCreationAddonSlug, number>> {
  return {
    additional_short_form_video: ADDITIONAL_VIDEO_RATES[market],
    additional_10_edited_photos: ADDITIONAL_10_PHOTOS_RATES[market],
    additional_content_capture_hour: ADDITIONAL_HOUR_RATES[market],
    same_next_day_edit_per_video: SAME_NEXT_DAY_EDIT_RATES[market],
    additional_aspect_ratio_adaptation: ASPECT_RATIO_RATES[market],
    captioned_subtitled_master: CAPTIONED_MASTER_RATES[market],
    additional_revision_minimum: REVISION_MINIMUMS[market],
  };
}

function baseParams(market: string) {
  return { packageRates: packageRates(market), addonRates: addonRates(market), percentages: PERCENTAGES };
}

// ============================================================
// LOCKED RATES — all six markets, all seven packages
// ============================================================
describe("calculateContentCreationEstimate — locked package rates, all six markets", () => {
  const cases: [string, Record<string, number>][] = [
    ["short_form_single", SINGLE_RATES],
    ["short_form_pack_3", PACK_3_RATES],
    ["short_form_pack_5", PACK_5_RATES],
    ["content_day_half", CONTENT_DAY_HALF_RATES],
    ["content_day_full", CONTENT_DAY_FULL_RATES],
    ["event_content_4h", EVENT_CONTENT_4H_RATES],
    ["personal_brand_2h", PERSONAL_BRAND_2H_RATES],
  ];
  for (const [slug, rates] of cases) {
    for (const market of MARKETS) {
      it(`${slug} — ${market}`, () => {
        const result = calculateContentCreationEstimate({ packageSlug: slug as ContentCreationPackageRate["packageSlug"], ...baseParams(market) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.basePackageUsd).toBe(rates[market]);
        expect(result.estimatedTotalUsd).toBe(rates[market]);
      });
    }
  }
});

describe("calculateContentCreationRetainerEstimate — locked retainer rates, all six markets", () => {
  const cases: [string, Record<string, number>][] = [
    ["retainer_essential", RETAINER_ESSENTIAL_RATES],
    ["retainer_growth", RETAINER_GROWTH_RATES],
    ["retainer_momentum", RETAINER_MOMENTUM_RATES],
  ];
  for (const [slug, rates] of cases) {
    for (const market of MARKETS) {
      it(`${slug} — ${market}`, () => {
        const result = calculateContentCreationRetainerEstimate({ retainerSlug: slug as ContentCreationRetainerRate["retainerSlug"], retainerRates: retainerRates(market) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.monthlyFeeUsd).toBe(rates[market]);
      });
    }
  }
});

// ============================================================
// EXACT WORKED TEST TARGETS (spec Part X)
// ============================================================
describe("exact worked test targets", () => {
  it("1. Ghana single short-form = $125", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(125);
  });

  it("2. Qatar 3-pack = $650, NOT 3 x $250 (=$750)", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_pack_3", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimatedTotalUsd).toBe(650);
      expect(result.estimatedTotalUsd).not.toBe(3 * SINGLE_RATES.qatar);
    }
  });

  it("3. North America 5-pack = $1,500", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_pack_5", ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(1500);
  });

  it("4. Ghana Half Content Day = $450", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_half", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(450);
  });

  it("5. Qatar Full Content Day = $1,500", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_full", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(1500);
  });

  it("6. UK Full Content Day = $2,000", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_full", ...baseParams("uk_western_europe") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(2000);
  });

  it("7. APAC Event Content 4h = $950", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "event_content_4h", ...baseParams("asia_pacific") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(950);
  });

  it("8. Other Personal Brand 2h = $675", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "personal_brand_2h", ...baseParams("other_international_custom") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(675);
  });

  it("9. Ghana Essential retainer = $405", () => {
    const result = calculateContentCreationRetainerEstimate({ retainerSlug: "retainer_essential", retainerRates: retainerRates("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monthlyFeeUsd).toBe(405);
  });

  it("10. Qatar Growth retainer = $1,350", () => {
    const result = calculateContentCreationRetainerEstimate({ retainerSlug: "retainer_growth", retainerRates: retainerRates("qatar") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monthlyFeeUsd).toBe(1350);
  });

  it("11. North America Momentum = $4,050", () => {
    const result = calculateContentCreationRetainerEstimate({ retainerSlug: "retainer_momentum", retainerRates: retainerRates("north_america") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monthlyFeeUsd).toBe(4050);
  });

  it("12. Retainer does not receive another automatic 10% bundle discount — the retainer function accepts no discount input and returns exactly the locked flat rate", () => {
    const result = calculateContentCreationRetainerEstimate({ retainerSlug: "retainer_essential", retainerRates: retainerRates("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.monthlyFeeUsd).toBe(405);
      // Not 90% of 405, not a further-discounted figure — no second discount layer exists.
      expect(result.monthlyFeeUsd).not.toBeCloseTo(405 * 0.9, 2);
    }
  });

  it("13. Additional video uses the correct market rate (UK)", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", additionalVideos: 2, ...baseParams("uk_western_europe") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scalingAdditionsUsd).toBe(2 * ADDITIONAL_VIDEO_RATES.uk_western_europe);
      expect(result.estimatedTotalUsd).toBe(SINGLE_RATES.uk_western_europe + 2 * ADDITIONAL_VIDEO_RATES.uk_western_europe);
    }
  });

  it("14. Additional 10 photos uses the correct market rate (Qatar)", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_half", additionalPhotoSets: 1, ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(CONTENT_DAY_HALF_RATES.qatar + ADDITIONAL_10_PHOTOS_RATES.qatar);
  });

  it("15. Additional hour uses the correct market rate (North America)", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "personal_brand_2h", additionalCaptureHours: 1, ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.estimatedTotalUsd).toBe(PERSONAL_BRAND_2H_RATES.north_america + ADDITIONAL_HOUR_RATES.north_america);
  });

  it("16. Same/next-day edit uses the correct per-video rate (Ghana) and is added AFTER priority/revision, not compounded into them", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", sameNextDayEditVideoCount: 1, turnaround: "priority", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sameNextDayEditUsd).toBe(SAME_NEXT_DAY_EDIT_RATES.ghana);
      // Priority is computed off applicableProductionFeeUsd only — not off applicableProductionFeeUsd + sameNextDayEditUsd.
      expect(result.priorityAmountUsd).toBe(Math.round(result.applicableProductionFeeUsd * 0.3 * 100) / 100);
      expect(result.estimatedTotalUsd).toBe(Math.round((result.applicableProductionFeeUsd + result.priorityAmountUsd + result.sameNextDayEditUsd) * 100) / 100);
    }
  });

  it("17. Captioned master does not imply translation — no translation field/param exists, and the line item label never mentions translation", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", captionedMasterCount: 1, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const captionLine = result.lineItems.find((l) => l.label.toLowerCase().includes("captioned"));
      expect(captionLine).toBeDefined();
      expect(captionLine?.label.toLowerCase()).not.toContain("translat");
      expect(result.estimatedTotalUsd).toBe(SINGLE_RATES.ghana + CAPTIONED_MASTER_RATES.ghana);
    }
  });

  it("18. Paid advertising / broader usage routes to Commercial licensing assessment — structurally impossible to buy paid-ad usage rights through this calculator (no licensing param/field exists anywhere on the params or result)", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result).not.toHaveProperty("licensingUsd");
      expect(result).not.toHaveProperty("usageUsd");
      expect(result).not.toHaveProperty("paidAdvertisingUsd");
    }
  });

  it("19. Social Media Management does not get silently included — no package/addon/percentage slug anywhere relates to posting, community management, or paid-media", () => {
    const allSlugs = [
      ...packageRates("ghana").map((r) => r.packageSlug),
      ...Object.keys(addonRates("ghana")),
      ...Object.keys(PERCENTAGES),
    ].join(" ").toLowerCase();
    expect(allSlugs).not.toContain("social_media_management");
    expect(allSlugs).not.toContain("posting");
    expect(allSlugs).not.toContain("community_management");
    expect(allSlugs).not.toContain("paid_media");
  });

  it("20. RAW/source remains request/assessment — no addon/package slug offers to sell raw footage/images automatically", () => {
    const allSlugs = [...packageRates("ghana").map((r) => r.packageSlug), ...Object.keys(addonRates("ghana"))].join(" ").toLowerCase();
    expect(allSlugs).not.toContain("raw");
  });
});

// ============================================================
// Additional revision & priority mechanics
// ============================================================
describe("additional revision rounds", () => {
  it("applies +15% of the applicable production fee per round, floored at the market minimum", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", additionalRevisionRounds: 1, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 15% of 125 = 18.75, below the $25 Ghana minimum -> floored to 25.
      expect(result.additionalRevisionUsd).toBe(25);
      expect(result.estimatedTotalUsd).toBe(150);
    }
  });

  it("does not apply the percentage to unrelated supplier/talent/travel costs — the calculator never models those fields at all", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_full", additionalRevisionRounds: 2, ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const pct = 15 / 100;
      const perRound = Math.max(Math.round(CONTENT_DAY_FULL_RATES.north_america * pct * 100) / 100, REVISION_MINIMUMS.north_america);
      expect(result.additionalRevisionUsd).toBe(Math.round(2 * perRound * 100) / 100);
    }
  });

  it("refuses (requiresCustomQuote) when revision pricing is not published for the market", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", additionalRevisionRounds: 1, packageRates: packageRates("ghana"), addonRates: {}, percentages: PERCENTAGES });
    expect(result.ok).toBe(false);
  });
});

describe("priority turnaround", () => {
  it("applies +30% of the applicable production fee, never to production/talent/travel/licensing", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "content_day_half", turnaround: "priority", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.priorityAmountUsd).toBe(Math.round(CONTENT_DAY_HALF_RATES.qatar * 0.3 * 100) / 100);
      expect(result.estimatedTotalUsd).toBe(Math.round((CONTENT_DAY_HALF_RATES.qatar + result.priorityAmountUsd) * 100) / 100);
    }
  });

  it("emergency_custom always requires Custom Confirmation", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", turnaround: "emergency_custom", ...baseParams("ghana") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.requiresCustomQuote).toBe(true);
  });
});

describe("refusal behavior — missing published rates", () => {
  it("refuses when the package itself isn't published for the market", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", packageRates: [], addonRates: {}, percentages: PERCENTAGES });
    expect(result.ok).toBe(false);
  });

  it("refuses when an addon is requested but not published", () => {
    const result = calculateContentCreationEstimate({ packageSlug: "short_form_single", additionalVideos: 1, packageRates: packageRates("ghana"), addonRates: {}, percentages: PERCENTAGES });
    expect(result.ok).toBe(false);
  });

  it("retainer refuses when the tier isn't published for the market", () => {
    const result = calculateContentCreationRetainerEstimate({ retainerSlug: "retainer_essential", retainerRates: [] });
    expect(result.ok).toBe(false);
  });
});
