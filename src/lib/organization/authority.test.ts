import { describe, expect, it } from "vitest";
import {
  jurisdictionAuthority,
  PROTECTED_LEADERSHIP_POSITION_SLUGS,
  JURISDICTIONS,
  AUTHORITY_VERBS,
  OPERATIONS_CAPABILITIES,
  FINANCE_CAPABILITIES,
  STRATEGY_CAPABILITIES,
  PEOPLE_CAPABILITIES,
  TECHNOLOGY_CAPABILITIES,
  GOVERNANCE_CAPABILITIES,
  IDENTITY_CAPABILITIES,
} from "@/lib/organization/authority";

// Phase 3.2 — pure-logic coverage for the peer-executive model. The
// DB-backed checks (hasJurisdictionAuthority, isSuperAdminId, and the
// full authorization branch inside assignStaffPosition()) need a live
// Supabase session to exercise for real and aren't covered here — see
// the Phase 3.2 report for how those were verified instead (code
// review + the same "no live admin session in this environment"
// limitation every prior phase's report has acknowledged).

describe("jurisdictionAuthority", () => {
  it("builds the documented <jurisdiction>.<verb> string", () => {
    expect(jurisdictionAuthority("operations", "administer")).toBe("operations.administer");
    expect(jurisdictionAuthority("finance", "view")).toBe("finance.view");
  });

  it("keeps every jurisdiction and verb distinct from one another (no accidental overlap in the naming convention)", () => {
    expect(new Set(JURISDICTIONS).size).toBe(JURISDICTIONS.length);
    expect(new Set(AUTHORITY_VERBS).size).toBe(AUTHORITY_VERBS.length);
  });
});

describe("PROTECTED_LEADERSHIP_POSITION_SLUGS", () => {
  it("covers exactly CHIEF and all six GR.9 peer executives — no more, no less", () => {
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS).toEqual(
      new Set([
        "founder-ceo",
        "chief-operating-officer-coo",
        "chief-financial-officer",
        "chief-strategy-officer",
        "chief-people-hr-officer",
        "chief-technology-officer",
        "director-executive-administration",
      ])
    );
  });

  it("does not protect a GR.8 Director or any ordinary Position", () => {
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS.has("creative-director")).toBe(false);
    expect(PROTECTED_LEADERSHIP_POSITION_SLUGS.has("photographer")).toBe(false);
  });
});

// Phase 3.4, Part 17 — "GR.9 peer executives cannot grant themselves
// another executive's jurisdiction" is proven structurally here: every
// capability string across all six jurisdiction blocks is globally
// unique, so no two peer executives' capability sets can ever collide
// or accidentally imply each other, and every consumer (hasAuthority())
// matches by exact string equality — holding one jurisdiction's
// capability can never satisfy a check for a different jurisdiction's.
describe("six-jurisdiction capability taxonomy — no cross-jurisdiction overlap", () => {
  it("every capability string across PRIME/VAULT/ARCHITECT/PULSE/GEEK/CHANCELLOR is globally unique", () => {
    const allCapabilities = [
      ...Object.values(OPERATIONS_CAPABILITIES),
      ...Object.values(FINANCE_CAPABILITIES),
      ...Object.values(STRATEGY_CAPABILITIES),
      ...Object.values(PEOPLE_CAPABILITIES),
      ...Object.values(TECHNOLOGY_CAPABILITIES),
      ...Object.values(IDENTITY_CAPABILITIES),
      ...Object.values(GOVERNANCE_CAPABILITIES),
    ];
    expect(new Set(allCapabilities).size).toBe(allCapabilities.length);
  });

  it("every capability string is correctly namespaced under its own jurisdiction prefix", () => {
    for (const c of Object.values(OPERATIONS_CAPABILITIES)) expect(c.startsWith("operations.")).toBe(true);
    for (const c of Object.values(FINANCE_CAPABILITIES)) expect(c.startsWith("finance.")).toBe(true);
    for (const c of Object.values(STRATEGY_CAPABILITIES)) expect(c.startsWith("strategy.")).toBe(true);
    for (const c of Object.values(PEOPLE_CAPABILITIES)) expect(c.startsWith("people.")).toBe(true);
    for (const c of Object.values(TECHNOLOGY_CAPABILITIES)) expect(c.startsWith("technology.")).toBe(true);
    for (const c of Object.values(IDENTITY_CAPABILITIES)) expect(c.startsWith("technology.")).toBe(true);
    for (const c of Object.values(GOVERNANCE_CAPABILITIES)) expect(c.startsWith("governance.")).toBe(true);
  });

  it("the finance.* compensation/payout/payment-obligation capabilities match the exact strings specified (Phase 3.4), plus Workshop Management's workshopRevenueView (Phase B) and the Universal Payables System's payeeAdminister/paymentObligationRecordPayment (2026-09-03)", () => {
    expect(FINANCE_CAPABILITIES).toEqual({
      compensationView: "finance.compensation.view",
      compensationManage: "finance.compensation.manage",
      paymentInstructionVerify: "finance.payment_instruction.verify",
      paymentObligationReview: "finance.payment_obligation.review",
      paymentObligationApprove: "finance.payment_obligation.approve",
      payoutInitiate: "finance.payout.initiate",
      payoutReconcile: "finance.payout.reconcile",
      workshopRevenueView: "finance.workshop_revenue.view",
      payeeAdminister: "finance.payee.administer",
      paymentObligationRecordPayment: "finance.payment_obligation.record_payment",
    });
  });
});
