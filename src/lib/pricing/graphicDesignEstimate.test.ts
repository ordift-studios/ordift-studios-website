import { describe, expect, it } from "vitest";
import {
  calculateGraphicDesignEstimate,
  type GraphicDesignDeliverableRate,
  type GraphicDesignComplexityFactor,
  type GraphicDesignAddonSlug,
  type GraphicDesignPercentageSlug,
} from "./graphicDesignEstimate";

// Ordift Graphic Design Pricing V1 (2026-09-07) —
// calculateGraphicDesignEstimate() is pure (takes already-fetched
// rates rather than querying itself), so the actual pricing decision
// logic is directly unit-testable without a live Supabase session —
// same established pure/impure split as every other pricing family.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;

const FLYER_RATES: Record<string, number> = { ghana: 45, qatar: 125, uk_western_europe: 175, north_america: 200, asia_pacific: 150, other_international_custom: 145 };
const DIGITAL_AD_RATES: Record<string, number> = { ghana: 40, qatar: 110, uk_western_europe: 150, north_america: 175, asia_pacific: 135, other_international_custom: 130 };
const SOCIAL_SINGLE_RATES: Record<string, number> = { ghana: 30, qatar: 75, uk_western_europe: 100, north_america: 120, asia_pacific: 90, other_international_custom: 85 };
const SOCIAL_SET_5_RATES: Record<string, number> = { ghana: 125, qatar: 300, uk_western_europe: 400, north_america: 475, asia_pacific: 350, other_international_custom: 340 };
const SOCIAL_SET_10_RATES: Record<string, number> = { ghana: 225, qatar: 525, uk_western_europe: 700, north_america: 825, asia_pacific: 625, other_international_custom: 600 };
const PRESENTATION_RATES: Record<string, number> = { ghana: 175, qatar: 400, uk_western_europe: 550, north_america: 650, asia_pacific: 500, other_international_custom: 475 };
const BROCHURE_RATES: Record<string, number> = { ghana: 200, qatar: 550, uk_western_europe: 750, north_america: 900, asia_pacific: 675, other_international_custom: 650 };

const ADDITIONAL_PAGE_RATES: Record<string, number> = { ghana: 20, qatar: 45, uk_western_europe: 60, north_america: 70, asia_pacific: 55, other_international_custom: 50 };
const ADDITIONAL_SLIDE_RATES: Record<string, number> = { ghana: 12, qatar: 25, uk_western_europe: 35, north_america: 40, asia_pacific: 30, other_international_custom: 30 };
const REVISION_MINIMUMS: Record<string, number> = { ghana: 20, qatar: 50, uk_western_europe: 70, north_america: 80, asia_pacific: 60, other_international_custom: 60 };
const SOURCE_FILE_MINIMUMS: Record<string, number> = { ghana: 30, qatar: 75, uk_western_europe: 100, north_america: 125, asia_pacific: 90, other_international_custom: 90 };

const COMPLEXITY_FACTORS: GraphicDesignComplexityFactor[] = [
  { complexity: "standard", factor: 1.0 },
  { complexity: "enhanced", factor: 1.3 },
  { complexity: "bespoke", factor: 1.65 },
];

const PERCENTAGES: Partial<Record<GraphicDesignPercentageSlug, number>> = {
  priority: 30,
  urgent: 40,
  additional_revision: 15,
  editable_source_file: 25,
};

function deliverableRates(market: string): GraphicDesignDeliverableRate[] {
  return [
    { marketId: market, deliverableSlug: "flyer_poster", priceUsd: FLYER_RATES[market] },
    { marketId: market, deliverableSlug: "digital_ad", priceUsd: DIGITAL_AD_RATES[market] },
    { marketId: market, deliverableSlug: "social_single", priceUsd: SOCIAL_SINGLE_RATES[market] },
    { marketId: market, deliverableSlug: "social_set_5", priceUsd: SOCIAL_SET_5_RATES[market] },
    { marketId: market, deliverableSlug: "social_set_10", priceUsd: SOCIAL_SET_10_RATES[market] },
    { marketId: market, deliverableSlug: "presentation", priceUsd: PRESENTATION_RATES[market] },
    { marketId: market, deliverableSlug: "brochure", priceUsd: BROCHURE_RATES[market] },
  ];
}

function addonRates(market: string): Partial<Record<GraphicDesignAddonSlug, number>> {
  return {
    additional_brochure_page: ADDITIONAL_PAGE_RATES[market],
    additional_presentation_slide: ADDITIONAL_SLIDE_RATES[market],
    additional_revision_minimum: REVISION_MINIMUMS[market],
    editable_source_file_minimum: SOURCE_FILE_MINIMUMS[market],
  };
}

function baseParams(market: string) {
  return { deliverableRates: deliverableRates(market), complexityFactors: COMPLEXITY_FACTORS, addonRates: addonRates(market), percentages: PERCENTAGES };
}

// ============================================================
// LOCKED RATES — all six markets, all seven deliverables
// ============================================================
describe("calculateGraphicDesignEstimate — locked deliverable rates, all six markets", () => {
  const cases: [string, Record<string, number>][] = [
    ["flyer_poster", FLYER_RATES],
    ["digital_ad", DIGITAL_AD_RATES],
    ["social_single", SOCIAL_SINGLE_RATES],
    ["social_set_5", SOCIAL_SET_5_RATES],
    ["social_set_10", SOCIAL_SET_10_RATES],
    ["presentation", PRESENTATION_RATES],
    ["brochure", BROCHURE_RATES],
  ];
  for (const [slug, rates] of cases) {
    for (const market of MARKETS) {
      it(`${slug} — ${market}`, () => {
        const result = calculateGraphicDesignEstimate({ deliverableSlug: slug as GraphicDesignDeliverableRate["deliverableSlug"], complexity: "standard", ...baseParams(market) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.baseDeliverableUsd).toBe(rates[market]);
        expect(result.estimatedTotalUsd).toBe(rates[market]);
      });
    }
  }
});

// ============================================================
// WORKED TEST TARGETS (V section, exact)
// ============================================================
describe("Business scenario — worked test targets", () => {
  it("1. Ghana Flyer Standard = $45", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(45);
  });
  it("2. Qatar Flyer Standard = $125", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(125);
  });
  it("3. North America Flyer Enhanced: $200 x 1.30 = $260", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "enhanced", ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(260);
  });
  it("4. Ghana 8-page Brochure Standard = $200", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalPages: 0, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(200);
  });
  it("5. Ghana 12-page Brochure Standard: $200 + (4 x $20) = $280", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalPages: 4, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(280);
  });
  it("6. Qatar 12-page Brochure Standard: $550 + (4 x $45) = $730", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalPages: 4, ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(730);
  });
  it("7. UK 15-slide Presentation Standard: $550 + (5 x $35) = $725", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "presentation", complexity: "standard", additionalSlides: 5, ...baseParams("uk_western_europe") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimatedTotalUsd).toBe(725);
  });
  it("8. Social Set 10 uses its own approved package rate, not 10x the single-design price", () => {
    for (const market of MARKETS) {
      const result = calculateGraphicDesignEstimate({ deliverableSlug: "social_set_10", complexity: "standard", ...baseParams(market) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.estimatedTotalUsd).toBe(SOCIAL_SET_10_RATES[market]);
      expect(result.estimatedTotalUsd).not.toBe(SOCIAL_SINGLE_RATES[market] * 10);
    }
  });
  it("9. Priority applies +30% correctly", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", turnaround: "priority", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityAmountUsd).toBe(Math.round(45 * 0.3 * 100) / 100);
    expect(result.estimatedTotalUsd).toBe(45 + result.priorityAmountUsd);
  });
  it("10. Urgent applies +40% correctly", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", turnaround: "urgent", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.urgentAmountUsd).toBe(Math.round(45 * 0.4 * 100) / 100);
    expect(result.estimatedTotalUsd).toBe(45 + result.urgentAmountUsd);
  });
  it("11. Additional revision uses +15% with market minimum", () => {
    // Ghana flyer base $45 x 15% = $6.75, below the $20 minimum -> minimum applies
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", additionalRevisionRounds: 1, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additionalRevisionUsd).toBe(20);
    expect(result.estimatedTotalUsd).toBe(65);
  });
  it("11b. Additional revision above the minimum uses the percentage, not the floor", () => {
    // NA brochure base $900 x 15% = $135, above the $80 minimum
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalRevisionRounds: 1, ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additionalRevisionUsd).toBe(135);
  });
  it("11c. Multiple additional revision rounds multiply the per-round charge", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", additionalRevisionRounds: 3, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additionalRevisionUsd).toBe(60); // 3 x $20 minimum
  });
  it("12. Editable Source File uses +25% with market minimum", () => {
    // Ghana flyer base $45 x 25% = $11.25, below the $30 minimum -> minimum applies
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", editableSourceFileRequested: true, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.editableSourceFileUsd).toBe(30);
  });
  it("12b. Editable Source File above the minimum uses the percentage", () => {
    // NA brochure base $900 x 25% = $225, above the $125 minimum
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", editableSourceFileRequested: true, ...baseParams("north_america") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.editableSourceFileUsd).toBe(225);
  });
  it("13. Packaging without an approved automatic rate is never called through this calculator — no deliverable slug exists for it", () => {
    // Packaging has deliberately no deliverable_slug at all; calling with an
    // unpublished/unknown slug proves the calculator refuses rather than
    // inventing a price.
    const result = calculateGraphicDesignEstimate({
      // @ts-expect-error deliberately not a real deliverable slug — proves no auto price is invented
      deliverableSlug: "packaging",
      complexity: "standard",
      ...baseParams("ghana"),
    });
    expect(result.ok).toBe(false);
  });
  it("14. Same-day routes to Custom Confirmation", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", turnaround: "same_day", ...baseParams("ghana") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresCustomQuote).toBe(true);
    expect(result.reason).toMatch(/custom confirmation/i);
  });
});

describe("calculateGraphicDesignEstimate — complexity factors, all three tiers", () => {
  it("Standard = 1.00x", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "digital_ad", complexity: "standard", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applicableDesignFeeUsd).toBe(110);
  });
  it("Enhanced = 1.30x", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "digital_ad", complexity: "enhanced", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applicableDesignFeeUsd).toBe(Math.round(110 * 1.3 * 100) / 100);
  });
  it("Bespoke = 1.65x and always flags Creative Review", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "digital_ad", complexity: "bespoke", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applicableDesignFeeUsd).toBe(Math.round(110 * 1.65 * 100) / 100);
    expect(result.requiresCreativeReview).toBe(true);
  });
  it("does not silently classify Bespoke as Standard — the factor is genuinely applied, never ignored", () => {
    const standard = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", ...baseParams("ghana") });
    const bespoke = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "bespoke", ...baseParams("ghana") });
    expect(standard.ok && bespoke.ok).toBe(true);
    if (!standard.ok || !bespoke.ok) return;
    expect(bespoke.estimatedTotalUsd).toBeGreaterThan(standard.estimatedTotalUsd);
  });
});

describe("calculateGraphicDesignEstimate — radical re-concept flag", () => {
  it("is surfaced for reassessment, not silently priced as a normal revision", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", radicalReConceptRequested: true, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiresCreativeReview).toBe(true);
    expect(result.creativeReviewReasons.some((r) => r.toLowerCase().includes("re-scope"))).toBe(true);
    // No revision charge was silently applied for it
    expect(result.additionalRevisionUsd).toBe(0);
  });
});

describe("calculateGraphicDesignEstimate — multi-page/slide scaling boundaries", () => {
  it("0 additional pages leaves the brochure at its base rate", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalPages: 0, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scaledSubtotalUsd).toBe(200);
  });
  it("scales cleanly for an arbitrary large page count", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", additionalPages: 20, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scaledSubtotalUsd).toBe(200 + 20 * 20);
  });
  it("scales cleanly for an arbitrary large slide count", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "presentation", complexity: "standard", additionalSlides: 25, ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scaledSubtotalUsd).toBe(400 + 25 * 25);
  });
});

describe("calculateGraphicDesignEstimate — no customer-nationality pricing signal", () => {
  it("accepts only an explicit market's already-fetched rates — no nationality/IP/geolocation parameter exists", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "flyer_poster", complexity: "standard", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
  });
});

describe("calculateGraphicDesignEstimate — missing/unpublished rates never silently default", () => {
  it("an unpublished deliverable rate requires a Custom Proposal rather than $0", () => {
    const result = calculateGraphicDesignEstimate({ deliverableSlug: "brochure", complexity: "standard", deliverableRates: [], complexityFactors: COMPLEXITY_FACTORS, addonRates: {}, percentages: PERCENTAGES });
    expect(result.ok).toBe(false);
  });
  it("requesting additional pages with no published per-page rate requires a Custom Proposal", () => {
    const result = calculateGraphicDesignEstimate({
      deliverableSlug: "brochure",
      complexity: "standard",
      additionalPages: 2,
      deliverableRates: deliverableRates("ghana"),
      complexityFactors: COMPLEXITY_FACTORS,
      addonRates: {},
      percentages: PERCENTAGES,
    });
    expect(result.ok).toBe(false);
  });
});
