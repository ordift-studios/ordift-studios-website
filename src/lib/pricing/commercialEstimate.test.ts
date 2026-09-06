import { describe, expect, it } from "vitest";
import {
  calculateCommercialProductionEstimate,
  calculateCatalogueEstimate,
  type CommercialServiceMode,
  type CommercialCreativeFeeRate,
  type CommercialCatalogueVolumeFactor,
  type CommercialCatalogueComplexityFactor,
  type CommercialPostProductionRate,
  type CommercialLicensingFactors,
} from "./commercialEstimate";

// Ordift Commercial / Advertising Pricing V1 (2026-09-07) —
// calculateCommercialProductionEstimate() / calculateCatalogueEstimate()
// are pure (take already-fetched rates rather than querying
// themselves), so the actual pricing decision logic is directly
// unit-testable without a live Supabase session — same established
// pure/impure split as every other pricing family. Production market
// and usage territory are always independent, explicit inputs; no test
// here exercises nationality/IP/geolocation.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;
const MODES: CommercialServiceMode[] = ["photography", "film", "photography_film"];
const SCOPES = ["focused", "full_day", "extended"] as const;

const CREATIVE_FEES: Record<CommercialServiceMode, Record<string, [number, number, number]>> = {
  photography: {
    ghana: [450, 800, 1150],
    qatar: [900, 1600, 2300],
    uk_western_europe: [1250, 2200, 3200],
    north_america: [1400, 2500, 3600],
    asia_pacific: [1100, 1900, 2750],
    other_international_custom: [1000, 1800, 2600],
  },
  film: {
    ghana: [600, 1050, 1500],
    qatar: [1200, 2100, 3000],
    uk_western_europe: [1600, 2800, 4000],
    north_america: [1800, 3100, 4500],
    asia_pacific: [1400, 2450, 3500],
    other_international_custom: [1300, 2300, 3300],
  },
  photography_film: {
    ghana: [900, 1600, 2300],
    qatar: [1800, 3200, 4600],
    uk_western_europe: [2400, 4200, 6100],
    north_america: [2700, 4700, 6800],
    asia_pacific: [2100, 3700, 5350],
    other_international_custom: [1950, 3450, 5000],
  },
};

function buildCreativeFeeRates(market: string): CommercialCreativeFeeRate[] {
  const rates: CommercialCreativeFeeRate[] = [];
  for (const mode of MODES) {
    SCOPES.forEach((scope, i) => {
      rates.push({ marketId: market, serviceMode: mode, scopeSlug: scope, priceUsd: CREATIVE_FEES[mode][market][i] });
    });
  }
  return rates;
}

const CATALOGUE_BASE_RATES: Record<string, number> = { ghana: 25, qatar: 40, uk_western_europe: 45, north_america: 55, asia_pacific: 45, other_international_custom: 40 };
const CATALOGUE_MINIMUMS: Record<string, number> = { ghana: 200, qatar: 350, uk_western_europe: 450, north_america: 500, asia_pacific: 400, other_international_custom: 400 };
const VOLUME_FACTORS: CommercialCatalogueVolumeFactor[] = [
  { tierSlug: "1-10", minQuantity: 1, maxQuantity: 10, factor: 1.0 },
  { tierSlug: "11-25", minQuantity: 11, maxQuantity: 25, factor: 0.9 },
  { tierSlug: "26-50", minQuantity: 26, maxQuantity: 50, factor: 0.8 },
  { tierSlug: "51-100", minQuantity: 51, maxQuantity: 100, factor: 0.7 },
];
const COMPLEXITY_FACTORS: CommercialCatalogueComplexityFactor[] = [
  { complexity: "clean", factor: 1.0 },
  { complexity: "premium", factor: 1.75 },
];

const POSTPRODUCTION_RATES: CommercialPostProductionRate[] = [
  { itemSlug: "additional_finished_image", priceUsd: 25, isFromPrice: false },
  { itemSlug: "advanced_retouch", priceUsd: 60, isFromPrice: false },
  { itemSlug: "high_end_retouch", priceUsd: 100, isFromPrice: false },
  { itemSlug: "creative_composite", priceUsd: 150, isFromPrice: true },
  { itemSlug: "cutdown_15s", priceUsd: 150, isFromPrice: false },
  { itemSlug: "cutdown_30s", priceUsd: 225, isFromPrice: false },
  { itemSlug: "alternate_edit_60s", priceUsd: 350, isFromPrice: false },
  { itemSlug: "vertical_adaptation", priceUsd: 100, isFromPrice: false },
  { itemSlug: "aspect_ratio_adaptation", priceUsd: 50, isFromPrice: false },
  { itemSlug: "caption_master", priceUsd: 75, isFromPrice: false },
  { itemSlug: "motion_graphics_basic", priceUsd: 250, isFromPrice: true },
  { itemSlug: "revision_round", priceUsd: 150, isFromPrice: false },
];

const LICENSING_FACTORS: CommercialLicensingFactors = {
  usage: {
    internal_trade_presentation: 0.15,
    website_organic_social: 0.25,
    pr_editorial_earned_media: 0.30,
    paid_digital_advertising: 0.75,
    print_advertising: 1.00,
    paid_digital_print_campaign: 1.25,
    packaging_pos: 1.50,
    ooh_billboard: 1.75,
    broadcast_streaming_advertising: 2.00,
    integrated_multimedia_campaign: 2.50,
  },
  duration: { "3_months": 0.60, "6_months": 0.75, "12_months": 1.00, "24_months": 1.50, "36_months": 1.85, "5_years": 2.25 },
  territory: { local_city: 0.75, national: 1.00, regional_multicountry: 1.35, international: 1.75, worldwide: 2.00 },
  exclusivity: { non_exclusive: 1.00, category_exclusive: 1.50, full_exclusive: 2.00 },
};

const REVIEW_THRESHOLDS: Record<string, { reviewUsd: number; mandatoryUsd: number }> = {
  ghana: { reviewUsd: 3000, mandatoryUsd: 7500 },
  qatar: { reviewUsd: 5000, mandatoryUsd: 12500 },
  uk_western_europe: { reviewUsd: 6000, mandatoryUsd: 15000 },
  north_america: { reviewUsd: 7500, mandatoryUsd: 20000 },
  asia_pacific: { reviewUsd: 5000, mandatoryUsd: 15000 },
  other_international_custom: { reviewUsd: 5000, mandatoryUsd: 12500 },
};

// ============================================================
// CREATIVE FEES — exact locked rates, all six markets x three scopes x three modes
// ============================================================
describe("calculateCommercialProductionEstimate — locked creative fees", () => {
  for (const market of MARKETS) {
    for (const mode of MODES) {
      SCOPES.forEach((scope, i) => {
        it(`${market} — ${mode} — ${scope}`, () => {
          const result = calculateCommercialProductionEstimate({
            serviceMode: mode,
            scopeSlug: scope,
            creativeFeeRates: buildCreativeFeeRates(market),
            postProductionRates: POSTPRODUCTION_RATES,
            licensingFactors: LICENSING_FACTORS,
          });
          expect(result.creativeFeeUsd).toBe(CREATIVE_FEES[mode][market][i]);
          expect(result.customProposalRequired).toBe(false);
        });
      });
    }
  }
});

describe("calculateCommercialProductionEstimate — Photography+Film uses its own approved matrix, not a derived sum", () => {
  for (const market of MARKETS) {
    SCOPES.forEach((scope, i) => {
      it(`${market} — ${scope}: combined fee is NOT photography + film`, () => {
        const rates = buildCreativeFeeRates(market);
        const photo = rates.find((r) => r.serviceMode === "photography" && r.scopeSlug === scope)!.priceUsd;
        const film = rates.find((r) => r.serviceMode === "film" && r.scopeSlug === scope)!.priceUsd;
        const combined = rates.find((r) => r.serviceMode === "photography_film" && r.scopeSlug === scope)!.priceUsd;
        expect(combined).not.toBe(photo + film);
        expect(combined).toBe(CREATIVE_FEES.photography_film[market][i]);
      });
    });
  }
});

// ============================================================
// CATALOGUE ENGINE
// ============================================================
describe("calculateCatalogueEstimate — six market base rates and minimums", () => {
  for (const market of MARKETS) {
    it(`${market}: 5 images (1-10 tier, no minimum triggered assuming subtotal exceeds it)`, () => {
      const result = calculateCatalogueEstimate({
        quantity: 5,
        complexity: "clean",
        baseRateUsd: CATALOGUE_BASE_RATES[market],
        minimumBookingUsd: CATALOGUE_MINIMUMS[market],
        volumeFactors: VOLUME_FACTORS,
        complexityFactors: COMPLEXITY_FACTORS,
      });
      const subtotal = 5 * CATALOGUE_BASE_RATES[market] * 1.0 * 1.0;
      expect(result.catalogueFeeUsd).toBe(Math.max(subtotal, CATALOGUE_MINIMUMS[market]));
    });
  }
});

describe("calculateCatalogueEstimate — volume tiers and boundaries", () => {
  const cases: { quantity: number; factor: number }[] = [
    { quantity: 1, factor: 1.0 },
    { quantity: 10, factor: 1.0 },
    { quantity: 11, factor: 0.9 },
    { quantity: 25, factor: 0.9 },
    { quantity: 26, factor: 0.8 },
    { quantity: 50, factor: 0.8 },
    { quantity: 51, factor: 0.7 },
    { quantity: 100, factor: 0.7 },
  ];
  for (const { quantity, factor } of cases) {
    it(`${quantity} images uses factor ${factor}`, () => {
      const result = calculateCatalogueEstimate({
        quantity,
        complexity: "clean",
        baseRateUsd: CATALOGUE_BASE_RATES.ghana,
        minimumBookingUsd: CATALOGUE_MINIMUMS.ghana,
        volumeFactors: VOLUME_FACTORS,
        complexityFactors: COMPLEXITY_FACTORS,
      });
      const subtotal = quantity * CATALOGUE_BASE_RATES.ghana * 1.0 * factor;
      expect(result.catalogueFeeUsd).toBe(Math.round(Math.max(subtotal, CATALOGUE_MINIMUMS.ghana) * 100) / 100);
    });
  }
  it("101 images requires a Custom Volume Proposal", () => {
    const result = calculateCatalogueEstimate({ quantity: 101, complexity: "clean", baseRateUsd: 25, minimumBookingUsd: 200, volumeFactors: VOLUME_FACTORS, complexityFactors: COMPLEXITY_FACTORS });
    expect(result.customProposalRequired).toBe(true);
    expect(result.catalogueFeeUsd).toBeNull();
  });
  it("well beyond 101 also requires Custom Volume Proposal", () => {
    const result = calculateCatalogueEstimate({ quantity: 500, complexity: "clean", baseRateUsd: 25, minimumBookingUsd: 200, volumeFactors: VOLUME_FACTORS, complexityFactors: COMPLEXITY_FACTORS });
    expect(result.customProposalRequired).toBe(true);
  });
});

describe("calculateCatalogueEstimate — complexity factors", () => {
  it("Clean = 1.00x", () => {
    const result = calculateCatalogueEstimate({ quantity: 10, complexity: "clean", baseRateUsd: 40, minimumBookingUsd: 350, volumeFactors: VOLUME_FACTORS, complexityFactors: COMPLEXITY_FACTORS });
    expect(result.catalogueFeeUsd).toBe(Math.max(10 * 40 * 1.0, 350));
  });
  it("Premium = 1.75x", () => {
    const result = calculateCatalogueEstimate({ quantity: 10, complexity: "premium", baseRateUsd: 40, minimumBookingUsd: 350, volumeFactors: VOLUME_FACTORS, complexityFactors: COMPLEXITY_FACTORS });
    expect(result.catalogueFeeUsd).toBe(Math.max(10 * 40 * 1.75, 350));
  });
});

describe("calculateCatalogueEstimate — minimum booking enforcement", () => {
  it("Qatar Clean Catalogue, 50 images: 40 x 50 x 0.80 = $1,600 (worked example)", () => {
    const result = calculateCatalogueEstimate({
      quantity: 50,
      complexity: "clean",
      baseRateUsd: 40,
      minimumBookingUsd: 350,
      volumeFactors: VOLUME_FACTORS,
      complexityFactors: COMPLEXITY_FACTORS,
    });
    expect(result.catalogueFeeUsd).toBe(1600);
  });
  it("a small quantity below the minimum enforces the market minimum", () => {
    const result = calculateCatalogueEstimate({ quantity: 1, complexity: "clean", baseRateUsd: 25, minimumBookingUsd: 200, volumeFactors: VOLUME_FACTORS, complexityFactors: COMPLEXITY_FACTORS });
    expect(result.catalogueFeeUsd).toBe(200); // 1 x 25 = 25, below 200 minimum
  });
});

// ============================================================
// LICENSING ENGINE
// ============================================================
describe("calculateCommercialProductionEstimate — licensing factors", () => {
  it("every usage factor is applied correctly", () => {
    for (const [slug, factor] of Object.entries(LICENSING_FACTORS.usage)) {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "full_day",
        creativeFeeRates: buildCreativeFeeRates("ghana"),
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        usageSlug: slug as keyof typeof LICENSING_FACTORS.usage,
        durationSlug: "12_months",
        territorySlug: "national",
        exclusivitySlug: "non_exclusive",
      });
      const expectedRaw = 800 * factor * 1 * 1 * 1;
      const expectedFloor = 800 * 0.15;
      expect(result.usageLicenceUsd).toBe(Math.round(Math.max(expectedRaw, expectedFloor) * 100) / 100);
    }
  });
  it("every duration factor is applied correctly", () => {
    for (const [slug, factor] of Object.entries(LICENSING_FACTORS.duration)) {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "full_day",
        creativeFeeRates: buildCreativeFeeRates("ghana"),
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        usageSlug: "print_advertising",
        durationSlug: slug as keyof typeof LICENSING_FACTORS.duration,
        territorySlug: "national",
        exclusivitySlug: "non_exclusive",
      });
      const expectedRaw = 800 * 1 * factor * 1 * 1;
      const expectedFloor = 800 * 0.15;
      expect(result.usageLicenceUsd).toBe(Math.round(Math.max(expectedRaw, expectedFloor) * 100) / 100);
    }
  });
  it("every territory factor is applied correctly", () => {
    for (const [slug, factor] of Object.entries(LICENSING_FACTORS.territory)) {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "full_day",
        creativeFeeRates: buildCreativeFeeRates("ghana"),
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        usageSlug: "print_advertising",
        durationSlug: "12_months",
        territorySlug: slug as keyof typeof LICENSING_FACTORS.territory,
        exclusivitySlug: "non_exclusive",
      });
      const expectedRaw = 800 * 1 * 1 * factor * 1;
      const expectedFloor = 800 * 0.15;
      expect(result.usageLicenceUsd).toBe(Math.round(Math.max(expectedRaw, expectedFloor) * 100) / 100);
    }
  });
  it("every exclusivity factor is applied correctly (non-broad combinations, no safeguard trigger)", () => {
    for (const [slug, factor] of Object.entries(LICENSING_FACTORS.exclusivity)) {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "full_day",
        creativeFeeRates: buildCreativeFeeRates("ghana"),
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        usageSlug: "print_advertising",
        durationSlug: "12_months",
        territorySlug: "national",
        exclusivitySlug: slug as keyof typeof LICENSING_FACTORS.exclusivity,
      });
      const expectedRaw = 800 * 1 * 1 * 1 * factor;
      const expectedFloor = 800 * 0.15;
      expect(result.usageLicenceUsd).toBe(Math.round(Math.max(expectedRaw, expectedFloor) * 100) / 100);
    }
  });

  it("the 15% Creative Fee licensing floor applies when the raw formula is smaller", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "internal_trade_presentation", // 0.15, weakest usage factor
      durationSlug: "3_months", // 0.60, weakest duration
      territorySlug: "local_city", // 0.75, weakest territory
      exclusivitySlug: "non_exclusive",
      licensingFloorPercentage: 15,
    });
    const raw = 800 * 0.15 * 0.6 * 0.75 * 1;
    const floor = 800 * 0.15;
    expect(raw).toBeLessThan(floor);
    expect(result.usageLicenceUsd).toBe(120); // floor wins
  });

  it("perpetual duration always requires a Custom Proposal, never an automatic price", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "perpetual",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
    });
    expect(result.customProposalRequired).toBe(true);
    expect(result.usageLicenceUsd).toBeNull();
  });

  it("copyright assignment always requires a Custom Proposal, never an automatic price", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      copyrightAssignmentRequested: true,
    });
    expect(result.customProposalRequired).toBe(true);
    expect(result.usageLicenceUsd).toBeNull();
  });

  it("full exclusivity combined with a broad territory triggers the Custom safeguard while still showing an indicative licence", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "worldwide",
      exclusivitySlug: "full_exclusive",
    });
    expect(result.customProposalRequired).toBe(true);
    expect(result.usageLicenceUsd).not.toBeNull(); // still surfaced as indicative information
  });

  it("full exclusivity with a narrow, non-broad combination does NOT trigger the safeguard", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "internal_trade_presentation",
      durationSlug: "3_months",
      territorySlug: "local_city",
      exclusivitySlug: "full_exclusive",
    });
    expect(result.customProposalRequired).toBe(false);
  });

  it("production/supplier costs are excluded from the licensing basis", () => {
    const withProduction = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 5000,
    });
    const withoutProduction = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
    });
    expect(withProduction.usageLicenceUsd).toBe(withoutProduction.usageLicenceUsd);
  });

  it("production market and usage territory are independent — the same creative fee market can pair with any territory", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"), // shoot in Ghana
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "worldwide", // usage territory entirely independent of shoot market
      exclusivitySlug: "non_exclusive",
    });
    expect(result.usageLicenceUsd).toBe(Math.round(800 * 1 * 1 * 2.0 * 1 * 100) / 100);
  });
});

// ============================================================
// POST-PRODUCTION
// ============================================================
describe("calculateCommercialProductionEstimate — post-production reference rates", () => {
  it("additional finished image $25", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "photography", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { additional_finished_image: 2 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(50);
  });
  it("advanced retouch $60", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "photography", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { advanced_retouch: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(60);
  });
  it("high-end retouch $100", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "photography", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { high_end_retouch: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(100);
  });
  it("creative composite from $150 flags an indicative-minimum custom reason", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "photography", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { creative_composite: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(150);
    expect(result.customReasons.some((r) => r.includes("indicative minimum"))).toBe(true);
  });
  it("15s cutdown $150", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { cutdown_15s: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(150);
  });
  it("30s cutdown $225", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { cutdown_30s: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(225);
  });
  it("60s alternate edit $350", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { alternate_edit_60s: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(350);
  });
  it("vertical adaptation $100", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { vertical_adaptation: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(100);
  });
  it("aspect ratio adaptation $50", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { aspect_ratio_adaptation: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(50);
  });
  it("caption master $75", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { caption_master: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(75);
  });
  it("basic motion graphics from $250 flags an indicative-minimum custom reason", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { motion_graphics_basic: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(250);
    expect(result.customReasons.some((r) => r.includes("indicative minimum"))).toBe(true);
  });
  it("advanced VFX always requires a Custom Proposal", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, advancedVfxRequested: true, licensingFactors: LICENSING_FACTORS });
    expect(result.customProposalRequired).toBe(true);
  });
  it("additional revision round $150", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "film", scopeSlug: "full_day", creativeFeeRates: buildCreativeFeeRates("ghana"), postProductionRates: POSTPRODUCTION_RATES, postProductionSelections: { revision_round: 1 }, licensingFactors: LICENSING_FACTORS });
    expect(result.postProductionSubtotalUsd).toBe(150);
  });
});

describe("calculateCommercialProductionEstimate — Commercial Priority (+35%, post-production only)", () => {
  it("applies exactly 35% to the eligible post-production subtotal", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      postProductionSelections: { advanced_retouch: 2 }, // 120
      priorityRequested: true,
      priorityPercentage: 35,
      licensingFactors: LICENSING_FACTORS,
    });
    expect(result.postProductionSubtotalUsd).toBe(120);
    expect(result.priorityAmountUsd).toBe(Math.round(120 * 0.35 * 100) / 100);
  });
  it("is not applied unless requested", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      postProductionSelections: { advanced_retouch: 2 },
      priorityPercentage: 35,
      licensingFactors: LICENSING_FACTORS,
    });
    expect(result.priorityAmountUsd).toBe(0);
  });
  it("does NOT apply to the Creative Fee", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      priorityRequested: true,
      priorityPercentage: 35,
      licensingFactors: LICENSING_FACTORS,
    });
    // No post-production selected -> priority base is 0 regardless of an $800 creative fee
    expect(result.priorityAmountUsd).toBe(0);
    expect(result.creativeFeeUsd).toBe(800);
  });
  it("does NOT apply to the usage licence", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      usageSlug: "print_advertising",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      priorityRequested: true,
      priorityPercentage: 35,
      licensingFactors: LICENSING_FACTORS,
    });
    expect(result.priorityAmountUsd).toBe(0);
    expect(result.usageLicenceUsd).toBe(800); // untouched by priority
  });
  it("does NOT apply to production/talent/supplier costs", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      productionBudgetUsd: 1000,
      talentFeeUsd: 500,
      talentUsageFeeUsd: 200,
      priorityRequested: true,
      priorityPercentage: 35,
      licensingFactors: LICENSING_FACTORS,
    });
    expect(result.priorityAmountUsd).toBe(0);
  });
});

// ============================================================
// REVIEW ENGINE — exact thresholds and boundaries
// ============================================================
describe("calculateCommercialProductionEstimate — review thresholds, all six markets", () => {
  for (const market of MARKETS) {
    const { reviewUsd, mandatoryUsd } = REVIEW_THRESHOLDS[market];
    it(`${market}: below review threshold is normal`, () => {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "focused",
        creativeFeeRates: [{ marketId: market, serviceMode: "photography", scopeSlug: "focused", priceUsd: reviewUsd - 100 }],
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        reviewThreshold: { reviewUsd, mandatoryUsd },
      });
      expect(result.reviewState).toBe("normal");
    });
    it(`${market}: exactly at review threshold is Commercial Review`, () => {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "focused",
        creativeFeeRates: [{ marketId: market, serviceMode: "photography", scopeSlug: "focused", priceUsd: reviewUsd }],
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        reviewThreshold: { reviewUsd, mandatoryUsd },
      });
      expect(result.reviewState).toBe("commercial_review");
    });
    it(`${market}: just below mandatory threshold is still Commercial Review`, () => {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "focused",
        creativeFeeRates: [{ marketId: market, serviceMode: "photography", scopeSlug: "focused", priceUsd: mandatoryUsd - 1 }],
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        reviewThreshold: { reviewUsd, mandatoryUsd },
      });
      expect(result.reviewState).toBe("commercial_review");
    });
    it(`${market}: exactly at mandatory threshold requires a Custom Proposal`, () => {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "focused",
        creativeFeeRates: [{ marketId: market, serviceMode: "photography", scopeSlug: "focused", priceUsd: mandatoryUsd }],
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        reviewThreshold: { reviewUsd, mandatoryUsd },
      });
      expect(result.reviewState).toBe("custom_proposal_required");
    });
    it(`${market}: above mandatory threshold requires a Custom Proposal`, () => {
      const result = calculateCommercialProductionEstimate({
        serviceMode: "photography",
        scopeSlug: "focused",
        creativeFeeRates: [{ marketId: market, serviceMode: "photography", scopeSlug: "focused", priceUsd: mandatoryUsd + 5000 }],
        postProductionRates: POSTPRODUCTION_RATES,
        licensingFactors: LICENSING_FACTORS,
        reviewThreshold: { reviewUsd, mandatoryUsd },
      });
      expect(result.reviewState).toBe("custom_proposal_required");
    });
  }

  it("Always-Custom conditions override the dollar threshold even for a tiny total", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "focused",
      creativeFeeRates: [{ marketId: "ghana", serviceMode: "photography", scopeSlug: "focused", priceUsd: 10 }],
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      copyrightAssignmentRequested: true,
      reviewThreshold: { reviewUsd: 3000, mandatoryUsd: 7500 },
    });
    expect(result.reviewState).toBe("custom_proposal_required");
  });
});

// ============================================================
// BUSINESS SCENARIO TESTS — exact worked examples
// ============================================================
describe("Business scenario — Ghana Restaurant (normal estimate)", () => {
  it("$800 creative + $200 licence + $350 production = $1,350, below review threshold", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("ghana"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "website_organic_social",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 350,
      reviewThreshold: REVIEW_THRESHOLDS.ghana,
    });
    expect(result.creativeFeeUsd).toBe(800);
    expect(result.usageLicenceUsd).toBe(200);
    expect(result.productionSubtotalUsd).toBe(350);
    expect(result.estimatedTotalUsd).toBe(1350);
    expect(result.reviewState).toBe("normal");
  });
});

describe("Business scenario — Qatar Fashion Campaign (Commercial Review)", () => {
  it("$3,200 creative + $5,400 licence + $3,000 production = $11,600, Commercial Review", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography_film",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("qatar"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "paid_digital_print_campaign",
      durationSlug: "12_months",
      territorySlug: "regional_multicountry",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 3000,
      reviewThreshold: REVIEW_THRESHOLDS.qatar,
    });
    expect(result.creativeFeeUsd).toBe(3200);
    expect(result.usageLicenceUsd).toBe(5400);
    expect(result.estimatedTotalUsd).toBe(11600);
    expect(result.reviewState).toBe("commercial_review");
  });
});

describe("Business scenario — UK Product Brand (normal estimate)", () => {
  it("$2,200 creative + $1,650 licence + $1,000 production = $4,850, below review threshold", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("uk_western_europe"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "paid_digital_advertising",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 1000,
      reviewThreshold: REVIEW_THRESHOLDS.uk_western_europe,
    });
    expect(result.creativeFeeUsd).toBe(2200);
    expect(result.usageLicenceUsd).toBe(1650);
    expect(result.estimatedTotalUsd).toBe(4850);
    expect(result.reviewState).toBe("normal");
  });
});

describe("Business scenario — US National Campaign (Custom Commercial Proposal)", () => {
  it("$4,700 creative + $17,625 licence + $8,000 production = $30,325, above mandatory threshold", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography_film",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("north_america"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "integrated_multimedia_campaign",
      durationSlug: "24_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 8000,
      reviewThreshold: REVIEW_THRESHOLDS.north_america,
    });
    expect(result.creativeFeeUsd).toBe(4700);
    expect(result.usageLicenceUsd).toBe(17625);
    expect(result.estimatedTotalUsd).toBe(30325);
    expect(result.reviewState).toBe("custom_proposal_required");
  });
});

describe("Business scenario — APAC/Singapore Hospitality (Commercial Review)", () => {
  it("$3,700 creative + $4,625 licence + $2,500 production = $10,825, Commercial Review", () => {
    const result = calculateCommercialProductionEstimate({
      serviceMode: "photography_film",
      scopeSlug: "full_day",
      creativeFeeRates: buildCreativeFeeRates("asia_pacific"),
      postProductionRates: POSTPRODUCTION_RATES,
      licensingFactors: LICENSING_FACTORS,
      usageSlug: "paid_digital_print_campaign",
      durationSlug: "12_months",
      territorySlug: "national",
      exclusivitySlug: "non_exclusive",
      productionBudgetUsd: 2500,
      reviewThreshold: REVIEW_THRESHOLDS.asia_pacific,
    });
    expect(result.creativeFeeUsd).toBe(3700);
    expect(result.usageLicenceUsd).toBe(4625);
    expect(result.estimatedTotalUsd).toBe(10825);
    expect(result.reviewState).toBe("commercial_review");
  });
});

describe("calculateCommercialProductionEstimate — Custom routing / missing data", () => {
  it("an unpublished creative fee for the market/mode/scope requires a Custom Proposal", () => {
    const result = calculateCommercialProductionEstimate({ serviceMode: "photography", scopeSlug: "focused", creativeFeeRates: [], postProductionRates: POSTPRODUCTION_RATES, licensingFactors: LICENSING_FACTORS });
    expect(result.customProposalRequired).toBe(true);
    expect(result.creativeFeeUsd).toBeNull();
  });
});
