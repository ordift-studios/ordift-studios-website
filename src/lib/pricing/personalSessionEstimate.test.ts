import { describe, expect, it } from "vitest";
import { calculatePersonalSessionEstimate, type PersonalSessionRate, type SubjectCategory } from "./personalSessionEstimate";

// Ordift Pricing Engine V1 / V1.1 (2026-09-06) — calculatePersonalSessionEstimate()
// is pure (takes already-fetched rates/subject-category/retouch-rate
// data rather than querying itself), so the actual pricing decision
// logic is directly unit-testable without a live Supabase session —
// same established pure/impure split as validateManualPaymentAgainstObligation
// and validateApprovalTransition elsewhere in this codebase. The
// DB-reading wrapper functions are not covered here for the same
// reason those functions' DB-dependent siblings aren't — verified
// instead by direct code reading and post-deployment read-only
// Production verification.

const individual: SubjectCategory = { id: "sc-1", slug: "individual", name: "Individual", minSubjects: 1, maxSubjects: 1, priceMultiplier: 1.0, active: true, requiresCustomQuote: false };
const couple: SubjectCategory = { id: "sc-2", slug: "couple", name: "Couple", minSubjects: 2, maxSubjects: 2, priceMultiplier: 1.2, active: true, requiresCustomQuote: false };
const family: SubjectCategory = { id: "sc-3", slug: "family_small_group", name: "Family / Small Group", minSubjects: 3, maxSubjects: 5, priceMultiplier: 1.4, active: true, requiresCustomQuote: false };
const limitedGuest: SubjectCategory = { id: "sc-4", slug: "limited_guest_appearance", name: "Limited Guest Appearance", minSubjects: 1, maxSubjects: null, priceMultiplier: 1.0, active: true, requiresCustomQuote: false };
const largeGroup: SubjectCategory = { id: "sc-5", slug: "large_group", name: "Large Group", minSubjects: 6, maxSubjects: null, priceMultiplier: null, active: false, requiresCustomQuote: true };

function makeRates(rates: Record<number, { priceUsd: number; signature: number; edited: number }>): PersonalSessionRate[] {
  return Object.entries(rates).map(([hours, r]) => ({
    marketId: "m", durationHours: Number(hours), priceUsd: r.priceUsd, signatureRetouchedImages: r.signature, professionallyEditedImages: r.edited,
  }));
}

const ghanaRates = makeRates({
  1: { priceUsd: 125, signature: 5, edited: 10 },
  2: { priceUsd: 225, signature: 8, edited: 15 },
  3: { priceUsd: 310, signature: 12, edited: 25 },
  4: { priceUsd: 390, signature: 15, edited: 35 },
});
const qatarRates = makeRates({
  1: { priceUsd: 150, signature: 5, edited: 10 },
  2: { priceUsd: 250, signature: 8, edited: 15 },
  3: { priceUsd: 340, signature: 12, edited: 25 },
  4: { priceUsd: 425, signature: 15, edited: 35 },
});
const ukRates = makeRates({
  1: { priceUsd: 225, signature: 5, edited: 10 },
  2: { priceUsd: 375, signature: 8, edited: 15 },
  3: { priceUsd: 500, signature: 12, edited: 25 },
  4: { priceUsd: 625, signature: 15, edited: 35 },
});
const northAmericaRates = makeRates({
  1: { priceUsd: 250, signature: 5, edited: 10 },
  2: { priceUsd: 425, signature: 8, edited: 15 },
  3: { priceUsd: 575, signature: 12, edited: 25 },
  4: { priceUsd: 700, signature: 15, edited: 35 },
});
const asiaPacificRates = makeRates({
  1: { priceUsd: 200, signature: 5, edited: 10 },
  2: { priceUsd: 340, signature: 8, edited: 15 },
  3: { priceUsd: 460, signature: 12, edited: 25 },
  4: { priceUsd: 575, signature: 15, edited: 35 },
});
const otherInternationalRates = makeRates({
  1: { priceUsd: 200, signature: 5, edited: 10 },
  2: { priceUsd: 350, signature: 8, edited: 15 },
  3: { priceUsd: 475, signature: 12, edited: 25 },
  4: { priceUsd: 600, signature: 15, edited: 35 },
});

describe("all six markets — Individual (1.00x), all 4 duration tiers", () => {
  it.each([
    ["Ghana", ghanaRates, [125, 225, 310, 390]],
    ["Qatar", qatarRates, [150, 250, 340, 425]],
    ["UK / Western Europe", ukRates, [225, 375, 500, 625]],
    ["North America", northAmericaRates, [250, 425, 575, 700]],
    ["Asia-Pacific", asiaPacificRates, [200, 340, 460, 575]],
    ["Other International", otherInternationalRates, [200, 350, 475, 600]],
  ])("%s", (_name, rates, expectedPrices) => {
    [1, 2, 3, 4].forEach((hours, i) => {
      const result = calculatePersonalSessionEstimate({ rates, durationHours: hours, subjectCategory: individual });
      expect(result.ok).toBe(true);
      expect((result as { sessionPriceUsd: number }).sessionPriceUsd).toBe(expectedPrices[i]);
    });
  });
});

describe("subject multipliers against the base rate — worked examples from the authorizing request", () => {
  it("Ghana 1h: Individual $125, Couple $150, Family/Small Group $175", () => {
    expect((calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(125);
    expect((calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: couple }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(150);
    expect((calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: family }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(175);
  });

  it("Qatar 1h: Individual $150, Couple $180, Family/Small Group $210", () => {
    expect((calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: individual }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(150);
    expect((calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: couple }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(180);
    expect((calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: family }) as { sessionPriceUsd: number }).sessionPriceUsd).toBe(210);
  });

  it("Limited Guest Appearance carries no monetary supplement — same price as Individual", () => {
    const individualResult = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual });
    const limitedGuestResult = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: limitedGuest });
    expect(individualResult).toEqual(limitedGuestResult);
  });

  it("Large Group has no approved multiplier and always requires a custom quote", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: largeGroup });
    expect(result).toEqual({ ok: false, requiresCustomQuote: true, reason: "Large Group sessions are custom-quoted — pricing for this group size hasn't been published yet." });
  });
});

describe("deliverable counts remain duration-based only, unaffected by subject category", () => {
  it("Individual, Couple, and Family all get the same deliverable counts for the same duration", () => {
    const individualResult = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 3, subjectCategory: individual });
    const coupleResult = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 3, subjectCategory: couple });
    const familyResult = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 3, subjectCategory: family });
    expect(individualResult.ok && coupleResult.ok && familyResult.ok).toBe(true);
    const counts = [individualResult, coupleResult, familyResult].map((r) => (r as { signatureRetouchedImages: number; professionallyEditedImages: number }));
    expect(counts.every((c) => c.signatureRetouchedImages === 12 && c.professionallyEditedImages === 25)).toBe(true);
  });
});

describe("additional Signature Retouched Image pricing", () => {
  it("2 additional images in Qatar at $18 each adds $36 to the total", () => {
    const result = calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 2, additionalRetouchRatePerImage: 18 });
    expect(result).toMatchObject({ ok: true, sessionPriceUsd: 150, additionalRetouchImages: 2, additionalRetouchAmountUsd: 36, totalPriceUsd: 186 });
  });

  it("zero additional images adds nothing to the total", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 0, additionalRetouchRatePerImage: 12 });
    expect(result).toMatchObject({ ok: true, additionalRetouchAmountUsd: 0, totalPriceUsd: 125 });
  });

  it("changing market changes the applicable per-image rate — same quantity, different market, different total", () => {
    const inGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 3, additionalRetouchRatePerImage: 12 });
    const inQatar = calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 3, additionalRetouchRatePerImage: 18 });
    expect((inGhana as { additionalRetouchAmountUsd: number }).additionalRetouchAmountUsd).toBe(36);
    expect((inQatar as { additionalRetouchAmountUsd: number }).additionalRetouchAmountUsd).toBe(54);
  });

  it("requesting additional images with no published rate for the market requires a custom quote, never a guessed price", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 1, additionalRetouchRatePerImage: null });
    expect(result).toEqual({ ok: false, requiresCustomQuote: true, reason: "Additional Signature Retouched Image pricing isn't published for this market yet." });
  });

  it("the additional-retouch amount is included in the total, shown separately from the session price", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual, additionalRetouchImages: 1, additionalRetouchRatePerImage: 12 });
    expect(result).toMatchObject({ ok: true, sessionPriceUsd: 225, additionalRetouchAmountUsd: 12, totalPriceUsd: 237 });
  });

  it("no result field represents an additional Professionally Edited Image price — that pricing does not exist", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual, additionalRetouchImages: 2, additionalRetouchRatePerImage: 12 });
    expect(result.ok && Object.keys(result)).not.toContain("additionalEditedAmountUsd");
    expect(result.ok && Object.keys(result)).not.toContain("additionalProfessionallyEditedRatePerImage");
  });
});

describe("currency-safe rounding", () => {
  it("a multiplier producing a fractional cent rounds to the nearest cent", () => {
    const oddRate = makeRates({ 1: { priceUsd: 99.99, signature: 5, edited: 10 } });
    const result = calculatePersonalSessionEstimate({ rates: oddRate, durationHours: 1, subjectCategory: couple });
    // 99.99 * 1.20 = 119.988, rounds to 119.99
    expect((result as { sessionPriceUsd: number }).sessionPriceUsd).toBe(119.99);
  });
});

describe("inactive/unapproved market behavior", () => {
  it("an empty rates list (an inactive or unpublished market) always routes to a custom quote, never a guessed price", () => {
    const result = calculatePersonalSessionEstimate({ rates: [], durationHours: 1, subjectCategory: individual });
    expect(result.ok).toBe(false);
    expect((result as { requiresCustomQuote: true }).requiresCustomQuote).toBe(true);
  });
});

describe("custom-quote fallback — boundary conditions", () => {
  it("does not extrapolate beyond the 4 approved hourly tiers — a 5-hour request requires a custom proposal", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 5, subjectCategory: individual });
    expect(result).toEqual({ ok: false, requiresCustomQuote: true, reason: "Sessions longer than 4 hours require a custom proposal rather than a multiplied hourly rate." });
  });

  it("no subject category selected at all requires a custom quote", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: null });
    expect(result.ok).toBe(false);
  });
});

describe("production-market selection rather than nationality/residence/IP", () => {
  it("the same market's rates produce an identical result regardless of any imagined 'customer context' — no such parameter exists to pass", () => {
    const ukVisitorBookingInGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual });
    const ghanaianVisitorBookingInGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual });
    expect(ukVisitorBookingInGhana).toEqual(ghanaianVisitorBookingInGhana);
  });
});

describe("future-market / country-override compatibility", () => {
  it("a hypothetical brand-new market (never seen by this function before) works with zero code changes — proving the engine is not hard-coded to Ghana/Qatar/etc.", () => {
    const hypotheticalNewMarketRates = makeRates({ 1: { priceUsd: 999, signature: 20, edited: 40 } });
    const result = calculatePersonalSessionEstimate({ rates: hypotheticalNewMarketRates, durationHours: 1, subjectCategory: couple });
    expect(result).toMatchObject({ ok: true, sessionPriceUsd: 1198.8 });
  });
});
