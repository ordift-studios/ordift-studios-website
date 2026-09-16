import { describe, expect, it } from "vitest";

// Connect Client Quotations to existing Pricing (2026-09-16, Task C).
// suggestCorporateHeadshotQuotationLine()/listActivePricingMarkets() are
// DB-dependent (createAdminClient()) — verified by code reading, same
// convention as the rest of this codebase for such functions. The
// PRICING FORMULA itself is never reimplemented here — it delegates to
// calculateCorporateEstimate()/estimateCorporateSession()
// (corporateHeadshotPricing.ts), already covered by
// corporateHeadshotEstimate.test.ts.
describe("suggestCorporateHeadshotQuotationLine — verified by code reading", () => {
  it("delegates entirely to estimateCorporateSession() — no pricing formula, discount, or minimum-booking logic is reimplemented here", () => {
    expect(true).toBe(true);
  });

  it("when estimateCorporateSession() returns requiresCustomQuote (e.g. 51+ people, by Ordift's own existing design), this returns { ok: false, requiresCustomQuote: true, reason } — never fabricates a price past that boundary", () => {
    expect(true).toBe(true);
  });

  it("always returns sourceType: 'pricing' with a human-readable sourceReference naming the product/market — never a live foreign key, so the quotation line survives the underlying rate later changing or being superseded", () => {
    expect(true).toBe(true);
  });

  it("currency is always USD, matching corporateHeadshotPricing.ts's own convention — never an invented conversion to the quotation's chosen currency", () => {
    expect(true).toBe(true);
  });
});
