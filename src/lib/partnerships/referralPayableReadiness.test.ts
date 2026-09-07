import { describe, expect, it } from "vitest";
import { classifyReferralPayableReadiness } from "./referralPayableReadiness";

function baseParams(overrides: Partial<Parameters<typeof classifyReferralPayableReadiness>[0]> = {}) {
  return {
    commissionStatus: "earned" as const,
    existingPaymentObligationId: null,
    leadStatus: "attributed" as const,
    hasPayeeProfileLinked: true,
    storedEligibleCollectedRevenue: 800,
    recomputedEligibleCollectedRevenue: 800,
    storedCommissionEarnedAmount: 80,
    recomputedCommissionEarnedAmount: 80,
    ...overrides,
  };
}

describe("O. focused referral-payable test targets", () => {
  it("1 / 2. a Calculated or not-yet-Earned commission is never ready", () => {
    expect(classifyReferralPayableReadiness(baseParams({ commissionStatus: "calculated" }))).toEqual({ ready: false, reason: "not_earned" });
  });

  it("4. missing payee setup blocks readiness", () => {
    expect(classifyReferralPayableReadiness(baseParams({ hasPayeeProfileLinked: false }))).toEqual({ ready: false, reason: "no_payee_setup" });
  });

  it("6 / 7. amount mismatch (recomputed vs stored) blocks readiness — proves the amount is never trusted from a single source", () => {
    expect(classifyReferralPayableReadiness(baseParams({ recomputedEligibleCollectedRevenue: 500 }))).toEqual({ ready: false, reason: "amount_mismatch" });
    expect(classifyReferralPayableReadiness(baseParams({ recomputedCommissionEarnedAmount: 50 }))).toEqual({ ready: false, reason: "amount_mismatch" });
  });

  it("8. a disputed lead (the revalidation signal for a refund/chargeback discovered before approval) blocks readiness", () => {
    expect(classifyReferralPayableReadiness(baseParams({ leadStatus: "disputed" }))).toEqual({ ready: false, reason: "lead_disputed" });
  });

  it("11. an already-linked commission is never re-readied — the caller returns the existing obligation instead of creating another", () => {
    expect(classifyReferralPayableReadiness(baseParams({ existingPaymentObligationId: "11111111-1111-1111-1111-111111111111" }))).toEqual({ ready: false, reason: "already_linked" });
  });

  it("a genuinely eligible Earned commission with a linked payee and matching amounts is ready", () => {
    expect(classifyReferralPayableReadiness(baseParams())).toEqual({ ready: true });
  });

  it("floating-point-safe amount comparison — a cent-level rounding difference does not falsely block readiness", () => {
    expect(classifyReferralPayableReadiness(baseParams({ storedCommissionEarnedAmount: 80.001, recomputedCommissionEarnedAmount: 80.002 }))).toEqual({ ready: true });
  });
});
