import { describe, expect, it } from "vitest";
import { calculateCorporateEstimate, resolveCorporatePriorityDeliveryScope, type CorporateHeadshotRate, type CorporateTeamTierRate } from "./corporateHeadshotEstimate";

// Ordift Corporate & Headshots Pricing V1 (2026-09-06) —
// calculateCorporateEstimate() is pure (takes already-fetched rates
// rather than querying itself), so the actual pricing decision logic is
// directly unit-testable without a live Supabase session — same
// established pure/impure split as calculatePersonalSessionEstimate().
// Market is selected only by an explicit "where will the shoot take
// place" choice; no nationality/IP/geolocation signal is ever read
// here, and none is exercised by these tests.

// ---- Approved six-market rate matrix, exactly as authorized. ----

const HEADSHOT_RATES: Record<string, CorporateHeadshotRate[]> = {
  ghana: [
    { marketId: "ghana", productSlug: "individual_headshot", priceUsd: 100, signatureRetouchedImages: 2 },
    { marketId: "ghana", productSlug: "executive_portrait", priceUsd: 200, signatureRetouchedImages: 5 },
  ],
  qatar: [
    { marketId: "qatar", productSlug: "individual_headshot", priceUsd: 175, signatureRetouchedImages: 2 },
    { marketId: "qatar", productSlug: "executive_portrait", priceUsd: 300, signatureRetouchedImages: 5 },
  ],
  uk: [
    { marketId: "uk", productSlug: "individual_headshot", priceUsd: 225, signatureRetouchedImages: 2 },
    { marketId: "uk", productSlug: "executive_portrait", priceUsd: 400, signatureRetouchedImages: 5 },
  ],
  north_america: [
    { marketId: "north_america", productSlug: "individual_headshot", priceUsd: 250, signatureRetouchedImages: 2 },
    { marketId: "north_america", productSlug: "executive_portrait", priceUsd: 450, signatureRetouchedImages: 5 },
  ],
  asia_pacific: [
    { marketId: "asia_pacific", productSlug: "individual_headshot", priceUsd: 200, signatureRetouchedImages: 2 },
    { marketId: "asia_pacific", productSlug: "executive_portrait", priceUsd: 350, signatureRetouchedImages: 5 },
  ],
  other_international: [
    { marketId: "other_international", productSlug: "individual_headshot", priceUsd: 200, signatureRetouchedImages: 2 },
    { marketId: "other_international", productSlug: "executive_portrait", priceUsd: 350, signatureRetouchedImages: 5 },
  ],
};

function teamTiers(marketId: string, rates: { "2-5": number; "6-10": number; "11-25": number; "26-50": number }): CorporateTeamTierRate[] {
  return [
    { marketId, tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: rates["2-5"] },
    { marketId, tierSlug: "6-10", minPeople: 6, maxPeople: 10, pricePerPersonUsd: rates["6-10"] },
    { marketId, tierSlug: "11-25", minPeople: 11, maxPeople: 25, pricePerPersonUsd: rates["11-25"] },
    { marketId, tierSlug: "26-50", minPeople: 26, maxPeople: 50, pricePerPersonUsd: rates["26-50"] },
  ];
}

const TEAM_TIER_RATES: Record<string, CorporateTeamTierRate[]> = {
  ghana: teamTiers("ghana", { "2-5": 75, "6-10": 60, "11-25": 45, "26-50": 35 }),
  qatar: teamTiers("qatar", { "2-5": 125, "6-10": 100, "11-25": 80, "26-50": 65 }),
  uk: teamTiers("uk", { "2-5": 175, "6-10": 135, "11-25": 100, "26-50": 75 }),
  north_america: teamTiers("north_america", { "2-5": 190, "6-10": 145, "11-25": 110, "26-50": 85 }),
  asia_pacific: teamTiers("asia_pacific", { "2-5": 150, "6-10": 115, "11-25": 85, "26-50": 65 }),
  other_international: teamTiers("other_international", { "2-5": 150, "6-10": 115, "11-25": 85, "26-50": 65 }),
};

const MINIMUM_BOOKING: Record<string, number> = {
  ghana: 250,
  qatar: 400,
  uk: 550,
  north_america: 600,
  asia_pacific: 450,
  other_international: 450,
};

const RETOUCH_RATE: Record<string, number> = {
  ghana: 15,
  qatar: 25,
  uk: 35,
  north_america: 40,
  asia_pacific: 30,
  other_international: 30,
};

const PRIORITY_DELIVERY_PERCENTAGE = 35;

const MARKETS = ["ghana", "qatar", "uk", "north_america", "asia_pacific", "other_international"] as const;

function baseParams(market: (typeof MARKETS)[number]) {
  return {
    headshotRates: HEADSHOT_RATES[market],
    teamTierRates: TEAM_TIER_RATES[market],
    minimumBookingUsd: MINIMUM_BOOKING[market],
    additionalRetouchRatePerImage: RETOUCH_RATE[market],
    priorityDeliveryPercentage: PRIORITY_DELIVERY_PERCENTAGE,
  };
}

describe("calculateCorporateEstimate — Individual Headshot, all six markets", () => {
  const expected: Record<string, number> = { ghana: 100, qatar: 175, uk: 225, north_america: 250, asia_pacific: 200, other_international: 200 };
  for (const market of MARKETS) {
    it(`${market}`, () => {
      const result = calculateCorporateEstimate({ product: "individual_headshot", ...baseParams(market) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.basePriceUsd).toBe(expected[market]);
      expect(result.signatureRetouchedImages).toBe(2);
      expect(result.totalPriceUsd).toBe(expected[market]);
    });
  }
});

describe("calculateCorporateEstimate — Executive Portrait, all six markets", () => {
  const expected: Record<string, number> = { ghana: 200, qatar: 300, uk: 400, north_america: 450, asia_pacific: 350, other_international: 350 };
  for (const market of MARKETS) {
    it(`${market}`, () => {
      const result = calculateCorporateEstimate({ product: "executive_portrait", ...baseParams(market) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.basePriceUsd).toBe(expected[market]);
      expect(result.signatureRetouchedImages).toBe(5);
      expect(result.totalPriceUsd).toBe(expected[market]);
    });
  }
});

describe("calculateCorporateEstimate — Team Headshots, every tier × every market", () => {
  const cases: { people: number; tier: "2-5" | "6-10" | "11-25" | "26-50" }[] = [
    { people: 3, tier: "2-5" },
    { people: 8, tier: "6-10" },
    { people: 15, tier: "11-25" },
    { people: 40, tier: "26-50" },
  ];
  const perPersonRates: Record<string, Record<string, number>> = {
    ghana: { "2-5": 75, "6-10": 60, "11-25": 45, "26-50": 35 },
    qatar: { "2-5": 125, "6-10": 100, "11-25": 80, "26-50": 65 },
    uk: { "2-5": 175, "6-10": 135, "11-25": 100, "26-50": 75 },
    north_america: { "2-5": 190, "6-10": 145, "11-25": 110, "26-50": 85 },
    asia_pacific: { "2-5": 150, "6-10": 115, "11-25": 85, "26-50": 65 },
    other_international: { "2-5": 150, "6-10": 115, "11-25": 85, "26-50": 65 },
  };

  for (const market of MARKETS) {
    for (const { people, tier } of cases) {
      it(`${market} — ${people} people (${tier} tier)`, () => {
        const perPerson = perPersonRates[market][tier];
        const subtotal = people * perPerson;
        const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: people, ...baseParams(market) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.teamSubtotalUsd).toBe(subtotal);
        expect(result.basePriceUsd).toBe(Math.max(subtotal, MINIMUM_BOOKING[market]));
        expect(result.signatureRetouchedImages).toBe(people);
      });
    }
  }
});

describe("calculateCorporateEstimate — team tier boundaries", () => {
  const params = baseParams("qatar");
  it("1 person is below the minimum team size — requires custom quote / redirect", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 1, ...params });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/at least 2 people/i);
  });
  it("2 people lands in the 2-5 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 2, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(2 * 125);
  });
  it("5 people lands in the 2-5 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 5, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(5 * 125);
  });
  it("6 people crosses into the 6-10 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 6, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(6 * 100);
  });
  it("10 people lands in the 6-10 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 10, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(10 * 100);
  });
  it("11 people crosses into the 11-25 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 11, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(11 * 80);
  });
  it("25 people lands in the 11-25 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 25, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(25 * 80);
  });
  it("26 people crosses into the 26-50 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 26, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(26 * 65);
  });
  it("50 people lands in the 26-50 tier", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 50, ...params });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(50 * 65);
  });
  it("51 people always requires a Custom Corporate Proposal — never auto-priced", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 51, ...params });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresCustomQuote).toBe(true);
    expect(result.reason).toMatch(/custom corporate proposal/i);
  });
  it("well beyond 51 people also requires a Custom Corporate Proposal", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 200, ...params });
    expect(result.ok).toBe(false);
  });
});

describe("calculateCorporateEstimate — minimum corporate team booking", () => {
  it("Ghana, 3 employees: 3×$75=$225 falls below the $250 minimum — minimum applied, final $250", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 3, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(225);
    expect(result.minimumApplied).toBe(true);
    expect(result.basePriceUsd).toBe(250);
    expect(result.totalPriceUsd).toBe(250);
  });
  it("Ghana, 5 employees: 5×$75=$375 exceeds the $250 minimum — minimum NOT applied, final $375", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 5, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(375);
    expect(result.minimumApplied).toBe(false);
    expect(result.basePriceUsd).toBe(375);
    expect(result.totalPriceUsd).toBe(375);
  });
});

describe("calculateCorporateEstimate — additional Signature Retouch (Corporate-specific rate)", () => {
  it("each market's corporate retouch rate is distinct from the Personal Portrait family and is applied per-image", () => {
    for (const market of MARKETS) {
      const result = calculateCorporateEstimate({
        product: "individual_headshot",
        additionalRetouchImages: 3,
        ...baseParams(market),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.additionalRetouchAmountUsd).toBe(3 * RETOUCH_RATE[market]);
    }
  });
  it("zero additional retouch images means zero additional amount, even with no rate published", () => {
    const result = calculateCorporateEstimate({
      product: "individual_headshot",
      headshotRates: HEADSHOT_RATES.ghana,
      teamTierRates: [],
      minimumBookingUsd: null,
      additionalRetouchImages: 0,
      additionalRetouchRatePerImage: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additionalRetouchAmountUsd).toBe(0);
  });
  it("requesting additional retouch images with no published rate requires a custom quote, not a silent $0", () => {
    const result = calculateCorporateEstimate({
      product: "individual_headshot",
      headshotRates: HEADSHOT_RATES.ghana,
      teamTierRates: [],
      minimumBookingUsd: null,
      additionalRetouchImages: 2,
      additionalRetouchRatePerImage: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("calculateCorporateEstimate — Priority Delivery, locked at exactly 35%", () => {
  it("is not applied unless deliberately requested, even when a percentage is available", () => {
    const result = calculateCorporateEstimate({ product: "individual_headshot", priorityDeliveryRequested: false, ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryRequested).toBe(false);
    expect(result.priorityDeliveryAmountUsd).toBe(0);
    expect(result.totalPriceUsd).toBe(result.basePriceUsd);
  });
  it("defaults to not-requested when the flag is entirely omitted", () => {
    const result = calculateCorporateEstimate({ product: "individual_headshot", ...baseParams("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryRequested).toBe(false);
    expect(result.priorityDeliveryAmountUsd).toBe(0);
  });
  it("when requested, is exactly 35% of the eligible subtotal (base + additional retouch), not of base alone", () => {
    const result = calculateCorporateEstimate({
      product: "individual_headshot",
      additionalRetouchImages: 2,
      priorityDeliveryRequested: true,
      ...baseParams("qatar"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const eligibleSubtotal = 175 + 2 * 25; // base + retouch = 225
    expect(result.priorityDeliveryPercentage).toBe(35);
    expect(result.priorityDeliveryAmountUsd).toBe(Math.round(eligibleSubtotal * 0.35 * 100) / 100);
    expect(result.totalPriceUsd).toBe(Math.round((eligibleSubtotal + eligibleSubtotal * 0.35) * 100) / 100);
  });
  it("requesting Priority Delivery with no published percentage requires a custom quote, never a silent $0 uplift", () => {
    const result = calculateCorporateEstimate({
      product: "individual_headshot",
      headshotRates: HEADSHOT_RATES.ghana,
      teamTierRates: [],
      minimumBookingUsd: null,
      priorityDeliveryRequested: true,
      priorityDeliveryPercentage: null,
    });
    expect(result.ok).toBe(false);
  });
  it("mathematically produces exactly 35.00 (no rounding drift) across a range of subtotals", () => {
    for (const eligibleSubtotal of [100, 175, 225, 250, 375, 1200, 1275, 1721.25 / 1.35]) {
      const rate: CorporateHeadshotRate = { marketId: "m", productSlug: "individual_headshot", priceUsd: eligibleSubtotal, signatureRetouchedImages: 2 };
      const result = calculateCorporateEstimate({
        product: "individual_headshot",
        headshotRates: [rate],
        teamTierRates: [],
        minimumBookingUsd: null,
        priorityDeliveryRequested: true,
        priorityDeliveryPercentage: 35,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedAmount = Math.round(eligibleSubtotal * 0.35 * 100) / 100;
      expect(result.priorityDeliveryAmountUsd).toBe(expectedAmount);
      expect(result.totalPriceUsd).toBe(Math.round((eligibleSubtotal + expectedAmount) * 100) / 100);
    }
  });
});

describe("calculateCorporateEstimate — combined arithmetic (user's own worked example)", () => {
  it("Qatar, 15 employees (11-25 tier @ $80/person), 3 additional retouches @ $25, Priority Delivery requested → $1,721.25", () => {
    const result = calculateCorporateEstimate({
      product: "team_headshots",
      numberOfPeople: 15,
      additionalRetouchImages: 3,
      priorityDeliveryRequested: true,
      ...baseParams("qatar"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(1200); // 15 × $80
    expect(result.minimumApplied).toBe(false); // $1,200 exceeds the $400 minimum
    expect(result.basePriceUsd).toBe(1200);
    expect(result.additionalRetouchAmountUsd).toBe(75); // 3 × $25
    expect(result.priorityDeliveryAmountUsd).toBe(446.25); // 35% × ($1,200 + $75)
    expect(result.totalPriceUsd).toBe(1721.25);
  });
});

describe("calculateCorporateEstimate — market switching changes only the applicable rate set", () => {
  it("the same product/quantity inputs produce different totals per market, each matching that market's own approved rate", () => {
    for (const market of MARKETS) {
      const result = calculateCorporateEstimate({ product: "executive_portrait", ...baseParams(market) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedRate = HEADSHOT_RATES[market].find((r) => r.productSlug === "executive_portrait")!.priceUsd;
      expect(result.basePriceUsd).toBe(expectedRate);
    }
  });
});

describe("calculateCorporateEstimate — no customer-nationality pricing signal", () => {
  it("the function signature accepts no nationality/IP/geolocation input at all — only an explicit market's already-fetched rates", () => {
    const result = calculateCorporateEstimate({ product: "individual_headshot", ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    // Structural guarantee: every parameter is either the chosen product,
    // an explicit quantity, or rates already resolved from an explicit
    // market selection upstream. No parameter here could carry a
    // customer's nationality or location.
  });
});

describe("calculateCorporateEstimate — missing/unpublished rates never silently default", () => {
  it("a headshot product with no matching rate for the market requires a custom quote rather than $0", () => {
    const result = calculateCorporateEstimate({
      product: "executive_portrait",
      headshotRates: [{ marketId: "m", productSlug: "individual_headshot", priceUsd: 100, signatureRetouchedImages: 2 }],
      teamTierRates: [],
      minimumBookingUsd: null,
    });
    expect(result.ok).toBe(false);
  });
  it("team headshots with no minimum booking published requires a custom quote rather than skipping the minimum check", () => {
    const result = calculateCorporateEstimate({
      product: "team_headshots",
      numberOfPeople: 15,
      headshotRates: [],
      teamTierRates: TEAM_TIER_RATES.qatar,
      minimumBookingUsd: null,
    });
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// Corporate Priority Delivery correction (2026-09-06, approved) —
// resolveCorporatePriorityDeliveryScope() maps a product/team-tier to
// the scope key whose percentage now applies (replacing the prior
// single global +35%). This does not change calculateCorporateEstimate's
// own base-rate/team-rate/minimum-booking/retouch-rate formulas at all
// — see the "existing Corporate base prices unchanged" regression
// tests below.
// ============================================================
describe("resolveCorporatePriorityDeliveryScope — Corporate Priority Delivery correction", () => {
  it("Individual Headshot resolves to individual_headshot", () => {
    expect(resolveCorporatePriorityDeliveryScope("individual_headshot", [])).toBe("individual_headshot");
  });
  it("Executive Portrait resolves to executive_portrait", () => {
    expect(resolveCorporatePriorityDeliveryScope("executive_portrait", [])).toBe("executive_portrait");
  });
  it("Team 2-5 resolves to team_2_5", () => {
    expect(resolveCorporatePriorityDeliveryScope("team_headshots", TEAM_TIER_RATES.ghana, 3)).toBe("team_2_5");
  });
  it("Team 6-10 resolves to team_6_10", () => {
    expect(resolveCorporatePriorityDeliveryScope("team_headshots", TEAM_TIER_RATES.ghana, 8)).toBe("team_6_10");
  });
  it("Team 11-25 resolves to team_11_25", () => {
    expect(resolveCorporatePriorityDeliveryScope("team_headshots", TEAM_TIER_RATES.ghana, 15)).toBe("team_11_25");
  });
  it("Team 26-50 resolves to team_26_50", () => {
    expect(resolveCorporatePriorityDeliveryScope("team_headshots", TEAM_TIER_RATES.ghana, 40)).toBe("team_26_50");
  });
  it("an unmatched team size (e.g. 51+) resolves to null rather than guessing a scope", () => {
    expect(resolveCorporatePriorityDeliveryScope("team_headshots", TEAM_TIER_RATES.ghana, 60)).toBeNull();
  });
});

describe("Corporate Priority Delivery correction — approved percentages, applied via calculateCorporateEstimate", () => {
  const CORRECTED_PERCENTAGES: Record<string, number> = {
    individual_headshot: 40,
    executive_portrait: 40,
    team_2_5: 40,
    team_6_10: 40,
    team_11_25: 40,
    team_26_50: 30,
  };

  it("Individual Headshot: +40%", () => {
    const result = calculateCorporateEstimate({ product: "individual_headshot", headshotRates: HEADSHOT_RATES.ghana, teamTierRates: [], minimumBookingUsd: null, priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.individual_headshot });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(40);
    expect(result.priorityDeliveryAmountUsd).toBe(Math.round(100 * 0.4 * 100) / 100);
  });
  it("Executive Portrait: +40%", () => {
    const result = calculateCorporateEstimate({ product: "executive_portrait", headshotRates: HEADSHOT_RATES.ghana, teamTierRates: [], minimumBookingUsd: null, priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.executive_portrait });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(40);
    expect(result.priorityDeliveryAmountUsd).toBe(Math.round(200 * 0.4 * 100) / 100);
  });
  it("Team 2-5: +40%", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 3, ...baseParams("ghana"), priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.team_2_5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(40);
  });
  it("Team 6-10: +40%", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 8, ...baseParams("ghana"), priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.team_6_10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(40);
  });
  it("Team 11-25: +40%", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 15, ...baseParams("ghana"), priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.team_11_25 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(40);
  });
  it("Team 26-50: +30% (the one tier that differs from the rest)", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 40, ...baseParams("ghana"), priorityDeliveryRequested: true, priorityDeliveryPercentage: CORRECTED_PERCENTAGES.team_26_50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryPercentage).toBe(30);
  });
  it("51+ remains a Custom Corporate Proposal — the correction changes no custom-quote routing", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 55, ...baseParams("ghana") });
    expect(result.ok).toBe(false);
  });
});

describe("Corporate Priority Delivery correction — existing Corporate base prices unchanged", () => {
  it("all six Individual Headshot rates are unchanged by the correction", () => {
    const expected: Record<string, number> = { ghana: 100, qatar: 175, uk: 225, north_america: 250, asia_pacific: 200, other_international: 200 };
    for (const market of MARKETS) {
      const result = calculateCorporateEstimate({ product: "individual_headshot", ...baseParams(market) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.basePriceUsd).toBe(expected[market]);
    }
  });
  it("all Team tier per-person rates are unchanged by the correction", () => {
    const result = calculateCorporateEstimate({ product: "team_headshots", numberOfPeople: 3, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamSubtotalUsd).toBe(225); // 3 x $75, unchanged Ghana 2-5 rate
  });
  it("minimum booking and retouch rates are unchanged by the correction", () => {
    const result = calculateCorporateEstimate({ product: "individual_headshot", additionalRetouchImages: 2, ...baseParams("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additionalRetouchAmountUsd).toBe(30); // 2 x $15, unchanged Ghana rate
  });
});
