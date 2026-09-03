import { describe, expect, it } from "vitest";
import { createPaymentObligation, validateManualPaymentAgainstObligation } from "@/lib/payments/payoutObligations";

// Phase 3.3, Part M, Test J — payment obligation creation does not
// itself execute money movement. The amount validation below runs and
// returns before any database call is made (no createAdminClient()
// call happens for an invalid amount), so it's safely testable without
// a live Supabase session or credentials.

describe("createPaymentObligation — validation", () => {
  it("rejects a zero amount before touching the database", async () => {
    const result = await createPaymentObligation({
      payeeProfileId: "00000000-0000-0000-0000-000000000000",
      sourceType: "test",
      description: "test obligation",
      currency: "GHS",
      amount: 0,
      actorUserId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result).toEqual({ ok: false, error: "Amount must be greater than zero." });
  });

  it("rejects a negative amount before touching the database", async () => {
    const result = await createPaymentObligation({
      payeeProfileId: "00000000-0000-0000-0000-000000000000",
      sourceType: "test",
      description: "test obligation",
      currency: "GHS",
      amount: -50,
      actorUserId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result).toEqual({ ok: false, error: "Amount must be greater than zero." });
  });
});

// Universal Payables System (2026-09-03) — a payable must not become
// 'paid' merely because someone manually changes a dropdown. This is
// the actual guard that enforces that: an already-approved obligation
// can only be marked paid for its exact amount/currency. RLS/DB access
// aren't locally testable without a live Supabase session (same
// established limitation noted in payeeInstructions.test.ts) — this
// pure validator is the part that's both safety-critical and directly
// verifiable.

const approvedObligation = { status: "approved", amount: 1500, currency: "GHS" };

describe("validateManualPaymentAgainstObligation", () => {
  it("accepts a payment that matches the approved obligation exactly", () => {
    const result = validateManualPaymentAgainstObligation({
      amount: 1500,
      currency: "GHS",
      reference: "MOMO-REF-123",
      obligation: approvedObligation,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects an obligation that is not yet approved", () => {
    const result = validateManualPaymentAgainstObligation({
      amount: 1500,
      currency: "GHS",
      reference: "REF",
      obligation: { status: "pending_approval", amount: 1500, currency: "GHS" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an obligation that is already paid — cannot re-record", () => {
    const result = validateManualPaymentAgainstObligation({
      amount: 1500,
      currency: "GHS",
      reference: "REF",
      obligation: { status: "paid", amount: 1500, currency: "GHS" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatched amount — cannot record a partial or wrong payment as full settlement", () => {
    const result = validateManualPaymentAgainstObligation({
      amount: 1000,
      currency: "GHS",
      reference: "REF",
      obligation: approvedObligation,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatched currency even when the numeric amount matches", () => {
    const result = validateManualPaymentAgainstObligation({
      amount: 1500,
      currency: "USD",
      reference: "REF",
      obligation: approvedObligation,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects zero or negative amounts", () => {
    expect(validateManualPaymentAgainstObligation({ amount: 0, currency: "GHS", reference: "REF", obligation: approvedObligation }).ok).toBe(false);
    expect(validateManualPaymentAgainstObligation({ amount: -50, currency: "GHS", reference: "REF", obligation: approvedObligation }).ok).toBe(false);
  });

  it("rejects an empty or whitespace-only reference — a payment must always be traceable", () => {
    expect(validateManualPaymentAgainstObligation({ amount: 1500, currency: "GHS", reference: "", obligation: approvedObligation }).ok).toBe(false);
    expect(validateManualPaymentAgainstObligation({ amount: 1500, currency: "GHS", reference: "   ", obligation: approvedObligation }).ok).toBe(false);
  });
});
