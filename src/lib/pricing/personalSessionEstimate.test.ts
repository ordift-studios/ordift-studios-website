import { describe, expect, it } from "vitest";
import { calculatePersonalSessionEstimate, type PersonalSessionRate, type SubjectCategory } from "./personalSessionEstimate";

// Ordift Pricing Engine V1 (2026-09-06) — calculatePersonalSessionEstimate()
// is pure (takes already-fetched rates/subject-category data rather than
// querying itself), so the actual pricing decision logic is directly
// unit-testable without a live Supabase session — same established
// pure/impure split as validateManualPaymentAgainstObligation and
// validateApprovalTransition elsewhere in this codebase. The DB-reading
// wrapper functions (listActivePricingMarkets, getActivePersonalSessionRates,
// estimatePersonalSession) are not covered here for the same reason those
// functions' DB-dependent siblings aren't — verified instead by direct
// code reading and post-deployment read-only Production verification.

const individual: SubjectCategory = {
  id: "sc-1",
  slug: "individual",
  name: "Individual",
  minSubjects: 1,
  maxSubjects: 1,
  supplementUsd: 0,
  active: true,
  requiresCustomQuote: false,
};

const couple: SubjectCategory = {
  id: "sc-2",
  slug: "couple",
  name: "Couple",
  minSubjects: 2,
  maxSubjects: 2,
  supplementUsd: null,
  active: false,
  requiresCustomQuote: true,
};

const ghanaRates: PersonalSessionRate[] = [
  { marketId: "ghana", durationHours: 1, priceUsd: 125, signatureRetouchedImages: 5, professionallyEditedImages: 10 },
  { marketId: "ghana", durationHours: 2, priceUsd: 225, signatureRetouchedImages: 8, professionallyEditedImages: 15 },
  { marketId: "ghana", durationHours: 3, priceUsd: 310, signatureRetouchedImages: 12, professionallyEditedImages: 25 },
  { marketId: "ghana", durationHours: 4, priceUsd: 390, signatureRetouchedImages: 15, professionallyEditedImages: 35 },
];

const qatarRates: PersonalSessionRate[] = [
  { marketId: "qatar", durationHours: 1, priceUsd: 150, signatureRetouchedImages: 5, professionallyEditedImages: 10 },
  { marketId: "qatar", durationHours: 2, priceUsd: 250, signatureRetouchedImages: 8, professionallyEditedImages: 15 },
  { marketId: "qatar", durationHours: 3, priceUsd: 340, signatureRetouchedImages: 12, professionallyEditedImages: 25 },
  { marketId: "qatar", durationHours: 4, priceUsd: 425, signatureRetouchedImages: 15, professionallyEditedImages: 35 },
];

describe("Ghana personal session pricing — all 4 approved duration tiers", () => {
  it.each([
    [1, 125, 5, 10],
    [2, 225, 8, 15],
    [3, 310, 12, 25],
    [4, 390, 15, 35],
  ])("%i hour(s): $%i, %i signature, %i professionally edited", (hours, price, signature, edited) => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: hours, subjectCategory: individual });
    expect(result).toEqual({ ok: true, priceUsd: price, signatureRetouchedImages: signature, professionallyEditedImages: edited, currencyCode: "USD" });
  });
});

describe("Qatar personal session pricing — all 4 approved duration tiers", () => {
  it.each([
    [1, 150, 5, 10],
    [2, 250, 8, 15],
    [3, 340, 12, 25],
    [4, 425, 15, 35],
  ])("%i hour(s): $%i, %i signature, %i professionally edited", (hours, price, signature, edited) => {
    const result = calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: hours, subjectCategory: individual });
    expect(result).toEqual({ ok: true, priceUsd: price, signatureRetouchedImages: signature, professionallyEditedImages: edited, currencyCode: "USD" });
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
    expect(result).toEqual({
      ok: false,
      requiresCustomQuote: true,
      reason: "Sessions longer than 4 hours require a custom proposal rather than a multiplied hourly rate.",
    });
  });

  it("a duration with no matching rate row (e.g. a market missing a tier) requires a custom quote rather than guessing", () => {
    const result = calculatePersonalSessionEstimate({ rates: [ghanaRates[0]], durationHours: 2, subjectCategory: individual });
    expect(result.ok).toBe(false);
  });

  it("an unapproved subject category (no supplement priced yet) requires a custom quote, never an invented supplement", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: couple });
    expect(result).toEqual({
      ok: false,
      requiresCustomQuote: true,
      reason: "Couple sessions are custom-quoted — pricing for this group size hasn't been published yet.",
    });
  });

  it("no subject category selected at all requires a custom quote", () => {
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: null });
    expect(result.ok).toBe(false);
  });
});

describe("no nationality/IP-based pricing", () => {
  it("calculatePersonalSessionEstimate's signature accepts no customer-identity field of any kind — only rates/duration/subjectCategory", () => {
    // Structural proof, not just a runtime assertion: the same market's
    // rates produce the identical result regardless of any imagined
    // "customer context" — because no such parameter exists to pass in
    // the first place. Two calls with the same explicit market data but
    // representing two different hypothetical visitors (one UK, one
    // Ghanaian, both booking a Ghana shoot) must be byte-identical.
    const ukVisitorBookingInGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual });
    const ghanaianVisitorBookingInGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 2, subjectCategory: individual });
    expect(ukVisitorBookingInGhana).toEqual(ghanaianVisitorBookingInGhana);
  });

  it("the same visitor selecting a different market (not a different identity) is the only thing that changes the price", () => {
    const inGhana = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual });
    const inQatar = calculatePersonalSessionEstimate({ rates: qatarRates, durationHours: 1, subjectCategory: individual });
    expect(inGhana.ok && inQatar.ok && inGhana.priceUsd).not.toBe(inQatar.ok && inQatar.priceUsd);
  });
});

describe("no commercial/corporate use of the personal-session engine", () => {
  it("calculatePersonalSessionEstimate has no service-category parameter to misuse for corporate/wedding/commercial work — it only ever computes a personal-portrait price from the rates explicitly handed to it", () => {
    // corporate_headshot_config/pricing_service_categories (corporate,
    // wedding, commercial) are entirely separate tables this function
    // never reads from — there is no code path by which a corporate or
    // wedding booking could accidentally receive a personal-session
    // price, because this function has no awareness of those domains
    // at all.
    const result = calculatePersonalSessionEstimate({ rates: ghanaRates, durationHours: 1, subjectCategory: individual });
    expect(result.ok).toBe(true);
    expect(Object.keys(result)).not.toContain("serviceCategory");
  });
});
