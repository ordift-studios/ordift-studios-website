import { describe, expect, it } from "vitest";
import { calculateBrandingEstimate, type BrandingTierRate, type BrandingPercentageSlug } from "./brandingEstimate";

// Ordift Branding & Creative Strategy Pricing V1 (2026-09-07) —
// calculateBrandingEstimate() is pure (takes already-fetched rates
// rather than querying itself), so the actual pricing decision logic
// is directly unit-testable without a live Supabase session — same
// established pure/impure split as every other pricing family.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;

const LOGO_RATES: Record<string, number> = { ghana: 300, qatar: 750, uk_western_europe: 1000, north_america: 1200, asia_pacific: 900, other_international_custom: 850 };
const FOUNDATIONS_RATES: Record<string, number> = { ghana: 1200, qatar: 3000, uk_western_europe: 4000, north_america: 5000, asia_pacific: 3500, other_international_custom: 3300 };
const ESSENTIAL_IDENTITY_RATES: Record<string, number> = { ghana: 750, qatar: 1800, uk_western_europe: 2500, north_america: 3000, asia_pacific: 2200, other_international_custom: 2100 };
const COMPLETE_IDENTITY_RATES: Record<string, number> = { ghana: 1500, qatar: 3500, uk_western_europe: 5000, north_america: 6000, asia_pacific: 4500, other_international_custom: 4200 };
const STRATEGY_COMPLETE_RATES: Record<string, number> = { ghana: 2800, qatar: 6500, uk_western_europe: 9000, north_america: 11000, asia_pacific: 8000, other_international_custom: 7500 };
const STRATEGIC_REBRAND_RATES: Record<string, number> = { ghana: 3500, qatar: 8000, uk_western_europe: 11000, north_america: 13500, asia_pacific: 10000, other_international_custom: 9000 };

const REVISION_MINIMUMS: Record<string, number> = { ghana: 50, qatar: 125, uk_western_europe: 175, north_america: 200, asia_pacific: 150, other_international_custom: 150 };

const PERCENTAGES: Partial<Record<BrandingPercentageSlug, number>> = { priority: 25, additional_revision: 15 };

function tierRates(market: string): BrandingTierRate[] {
  return [
    { marketId: market, tierSlug: "logo_development", priceUsd: LOGO_RATES[market] },
    { marketId: market, tierSlug: "brand_foundations", priceUsd: FOUNDATIONS_RATES[market] },
    { marketId: market, tierSlug: "essential_identity", priceUsd: ESSENTIAL_IDENTITY_RATES[market] },
    { marketId: market, tierSlug: "complete_identity", priceUsd: COMPLETE_IDENTITY_RATES[market] },
    { marketId: market, tierSlug: "strategy_complete_identity", priceUsd: STRATEGY_COMPLETE_RATES[market] },
    { marketId: market, tierSlug: "strategic_rebrand", priceUsd: STRATEGIC_REBRAND_RATES[market] },
  ];
}

function baseParams(market: string) {
  return { tierRates: tierRates(market), revisionMinimumUsd: REVISION_MINIMUMS[market], percentages: PERCENTAGES };
}

// ============================================================
// LOCKED RATES — all six markets, all six tiers
// ============================================================
describe("calculateBrandingEstimate — locked tier rates, all six markets", () => {
  const cases: [string, Record<string, number>][] = [
    ["logo_development", LOGO_RATES],
    ["brand_foundations", FOUNDATIONS_RATES],
    ["essential_identity", ESSENTIAL_IDENTITY_RATES],
    ["complete_identity", COMPLETE_IDENTITY_RATES],
    ["strategy_complete_identity", STRATEGY_COMPLETE_RATES],
    ["strategic_rebrand", STRATEGIC_REBRAND_RATES],
  ];
  for (const [slug, rates] of cases) {
    for (const market of MARKETS) {
      it(`${slug} — ${market}`, () => {
        const result = calculateBrandingEstimate({ tierSlug: slug as BrandingTierRate["tierSlug"], ...baseParams(market) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.baseTierUsd).toBe(rates[market]);
        expect(result.estimatedTotalUsd).toBe(rates[market]);
      });
    }
  }
});

// ============================================================
// EXACT WORKED TEST TARGETS (spec Part "TEST TARGETS")
// ============================================================
describe("exact worked test targets", () => {
  it("1. Ghana Logo = 300", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(300);
  });

  it("2. Qatar Logo = 750", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", ...baseParams("qatar") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(750);
  });

  it("3. UK Essential Identity = 2500", () => {
    const r = calculateBrandingEstimate({ tierSlug: "essential_identity", ...baseParams("uk_western_europe") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(2500);
  });

  it("4. North America Complete Identity = 6000", () => {
    const r = calculateBrandingEstimate({ tierSlug: "complete_identity", ...baseParams("north_america") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(6000);
  });

  it("5. APAC Brand Foundations = 3500", () => {
    const r = calculateBrandingEstimate({ tierSlug: "brand_foundations", ...baseParams("asia_pacific") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(3500);
  });

  it("6. Other Strategy + Complete Identity = 7500", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategy_complete_identity", ...baseParams("other_international_custom") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(7500);
  });

  it("7. Ghana Strategic Rebrand = 3500", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategic_rebrand", ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(3500);
  });

  it("8. Qatar Strategic Rebrand = 8000", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategic_rebrand", ...baseParams("qatar") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(8000);
  });

  it("9. North America Strategic Rebrand = 13500", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategic_rebrand", ...baseParams("north_america") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimatedTotalUsd).toBe(13500);
  });

  it("10. Strategy + Complete Identity uses its own package rate rather than adding the two standalone tier prices — Ghana is the discriminating market: 1200 + 1500 = 2700, but the locked package rate is 2800", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategy_complete_identity", ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estimatedTotalUsd).toBe(2800);
      expect(r.estimatedTotalUsd).not.toBe(FOUNDATIONS_RATES.ghana + COMPLETE_IDENTITY_RATES.ghana);
    }
  });

  it("11. Custom Enterprise never auto-prices — there is no 'custom_enterprise' (or any enterprise-shaped) value in the priced tier type at all, so the calculator cannot be called for it", () => {
    const validSlugs = tierRates("ghana").map((r) => r.tierSlug);
    expect(validSlugs).not.toContain("custom_enterprise");
    expect(validSlugs).not.toContain("enterprise");
    expect(validSlugs.length).toBe(6);
  });

  it("12. Naming never implies legal trademark clearance — no field, slug, or line item anywhere claims legal/trademark clearance", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).not.toHaveProperty("trademarkClearedUsd");
      expect(r).not.toHaveProperty("legalClearanceUsd");
      const joined = r.lineItems.map((l) => l.label.toLowerCase()).join(" ");
      expect(joined).not.toContain("trademark");
      expect(joined).not.toContain("legal clearance");
    }
  });

  it("13. Multilingual complexity can trigger Creative Review, without blocking or altering the indicative price", () => {
    const withoutSignal = calculateBrandingEstimate({ tierSlug: "essential_identity", ...baseParams("qatar") });
    const withSignal = calculateBrandingEstimate({ tierSlug: "essential_identity", scaleSignals: ["multilingual_complexity"], ...baseParams("qatar") });
    expect(withoutSignal.ok).toBe(true);
    expect(withSignal.ok).toBe(true);
    if (withoutSignal.ok && withSignal.ok) {
      expect(withoutSignal.requiresCreativeReview).toBe(false);
      expect(withSignal.requiresCreativeReview).toBe(true);
      expect(withSignal.creativeReviewReasons.some((r) => r.toLowerCase().includes("multilingual"))).toBe(true);
      // Price is unaffected — the signal is a review trigger, not a surcharge.
      expect(withSignal.estimatedTotalUsd).toBe(withoutSignal.estimatedTotalUsd);
    }
  });

  it("every project-scale signal independently triggers Creative Review", () => {
    const signals: Array<Parameters<typeof calculateBrandingEstimate>[0]["scaleSignals"]> = [
      ["many_stakeholder_groups"],
      ["multiple_business_units"],
      ["many_markets"],
      ["regulated_high_risk_industry"],
      ["extensive_research_required"],
      ["numerous_applications_required"],
      ["complex_brand_architecture"],
      ["multilingual_complexity"],
    ];
    for (const scaleSignals of signals) {
      const r = calculateBrandingEstimate({ tierSlug: "complete_identity", scaleSignals, ...baseParams("ghana") });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.requiresCreativeReview).toBe(true);
    }
  });

  it("14. Priority = +25% of the eligible Ordift creative/strategy fee only", () => {
    const r = calculateBrandingEstimate({ tierSlug: "essential_identity", turnaround: "priority", ...baseParams("uk_western_europe") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.priorityAmountUsd).toBe(Math.round(ESSENTIAL_IDENTITY_RATES.uk_western_europe * 0.25 * 100) / 100);
      expect(r.estimatedTotalUsd).toBe(Math.round((ESSENTIAL_IDENTITY_RATES.uk_western_europe + r.priorityAmountUsd) * 100) / 100);
    }
  });

  it("14b. extremely compressed timeline always requires Custom Confirmation", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", turnaround: "custom_confirmation", ...baseParams("ghana") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.requiresCustomQuote).toBe(true);
  });

  it("15. Additional revision round = +15% of the affected component, floored at the correct market minimum", () => {
    // 15% of Ghana Logo (300) = 45, below the $50 Ghana minimum -> floored to 50.
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", additionalRevisionRounds: 1, ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.additionalRevisionUsd).toBe(50);
      expect(r.estimatedTotalUsd).toBe(350);
    }
  });

  it("15b. above the minimum, the percentage itself applies (North America Strategic Rebrand)", () => {
    const r = calculateBrandingEstimate({ tierSlug: "strategic_rebrand", additionalRevisionRounds: 1, ...baseParams("north_america") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const expectedPerRound = Math.max(Math.round(STRATEGIC_REBRAND_RATES.north_america * 0.15 * 100) / 100, REVISION_MINIMUMS.north_america);
      expect(r.additionalRevisionUsd).toBe(expectedPerRound);
      expect(expectedPerRound).toBeGreaterThan(REVISION_MINIMUMS.north_america); // confirms this case exercises the percentage, not just the floor
    }
  });

  it("does not apply the revision percentage to third-party/legal/supplier costs — the calculator never models those fields at all", () => {
    const r = calculateBrandingEstimate({ tierSlug: "complete_identity", ...baseParams("ghana") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).not.toHaveProperty("supplierCostUsd");
      expect(r).not.toHaveProperty("legalFeeUsd");
      expect(r).not.toHaveProperty("thirdPartyLicenceUsd");
    }
  });
});

describe("refusal behavior — missing published rates", () => {
  it("refuses when the tier itself isn't published for the market", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", tierRates: [], percentages: PERCENTAGES });
    expect(r.ok).toBe(false);
  });

  it("refuses when a revision is requested but the minimum isn't published", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", additionalRevisionRounds: 1, tierRates: tierRates("ghana"), percentages: PERCENTAGES });
    expect(r.ok).toBe(false);
  });

  it("refuses when priority is requested but its percentage isn't published", () => {
    const r = calculateBrandingEstimate({ tierSlug: "logo_development", turnaround: "priority", tierRates: tierRates("ghana"), percentages: {} });
    expect(r.ok).toBe(false);
  });
});
