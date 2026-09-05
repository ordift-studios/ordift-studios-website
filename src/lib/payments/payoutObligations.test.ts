import { describe, expect, it } from "vitest";
import {
  createPaymentObligation,
  validateManualPaymentAgainstObligation,
  canCancelPaymentObligation,
  canReversePaymentObligation,
  isEligibleDestinationForPayable,
} from "@/lib/payments/payoutObligations";

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

// TD-053 (2026-09-05) — recordManualPayment()'s UPDATE is now guarded
// by .eq("status","approved") in addition to .eq("id", obligationId),
// the same atomic idempotency pattern already proven for
// setProjectFileRetain()/promoteProjectFileToFinalApproved(). This is
// the read-time half of that guard — the same pure validator above
// already rejects a non-'approved' obligation, which is exactly what a
// second/repeated Record Payment attempt sees once the first
// successful call has moved status to 'paid'. Restated here explicitly
// against TD-053's own required scenarios so the connection is
// unambiguous, not left implicit in the pre-existing tests above.
//
// What ISN'T covered here, and why: a genuinely concurrent double-
// submission (two requests racing before either commits) needs a real
// Postgres row lock to prove — not reproducible at this project's
// unit-test tier without a live Supabase session, the same established
// limitation as every other DB-dependent guard in this suite (Retain,
// Final Approval, Confirm Backup). The atomic .eq("status","approved")
// guard on the UPDATE itself (not this pure pre-check) is what actually
// closes that race; it's covered by direct code reading in the Phase
// I.2 report, not a unit test.
describe("TD-053 — an obligation no longer 'approved' cannot be recorded as paid", () => {
  it("a pending_approval obligation cannot be recorded as paid", () => {
    expect(
      validateManualPaymentAgainstObligation({
        amount: 10,
        currency: "GHS",
        reference: "REF",
        obligation: { status: "pending_approval", amount: 10, currency: "GHS" },
      }).ok
    ).toBe(false);
  });

  it("a repeated Record Payment attempt after the first successful transition (status now 'paid') cannot succeed", () => {
    // Simulates exactly the state a second submission would observe
    // after a first call already committed status: 'paid'.
    const result = validateManualPaymentAgainstObligation({
      amount: 10,
      currency: "GHS",
      reference: "REF",
      obligation: { status: "paid", amount: 10, currency: "GHS" },
    });
    expect(result).toEqual({ ok: false, error: 'Cannot record payment — current status is "paid", not "approved".' });
  });

  it("a cancelled or reversed obligation cannot be recorded as paid", () => {
    for (const status of ["cancelled", "reversed"]) {
      expect(validateManualPaymentAgainstObligation({ amount: 10, currency: "GHS", reference: "REF", obligation: { status, amount: 10, currency: "GHS" } }).ok).toBe(false);
    }
  });
});

// Payable Safety Hardening (2026-09-04), Parts B/D/J — pure state-
// machine guards for cancel/reverse, same directly-testable-without-a-
// live-DB tier as validateManualPaymentAgainstObligation and
// isValidEngagementTransition above/elsewhere. The DB-dependent parts
// of cancelPaymentObligation()/reversePaymentObligation() themselves
// (authorization, the row lookup, the actual update+logActivity) are
// NOT covered here — same established limitation already documented
// throughout this suite (no live Supabase session in this test
// environment). What's verified here is the actual thing that decides
// whether a given status transition is even allowed, independent of
// who's asking or what the DB currently holds.
describe("canCancelPaymentObligation", () => {
  it("allows cancelling from pending_approval and approved", () => {
    expect(canCancelPaymentObligation("pending_approval")).toBe(true);
    expect(canCancelPaymentObligation("approved")).toBe(true);
  });
  it("refuses cancelling a payable that is already paid, cancelled, or reversed", () => {
    expect(canCancelPaymentObligation("paid")).toBe(false);
    expect(canCancelPaymentObligation("cancelled")).toBe(false);
    expect(canCancelPaymentObligation("reversed")).toBe(false);
  });
  it("fails closed on an unrecognized status", () => {
    expect(canCancelPaymentObligation("not-a-real-status")).toBe(false);
  });
});

describe("canReversePaymentObligation", () => {
  it("allows reversing from approved and paid", () => {
    expect(canReversePaymentObligation("approved")).toBe(true);
    expect(canReversePaymentObligation("paid")).toBe(true);
  });
  it("refuses reversing a payable that is still pending approval, or already cancelled/reversed", () => {
    expect(canReversePaymentObligation("pending_approval")).toBe(false);
    expect(canReversePaymentObligation("cancelled")).toBe(false);
    expect(canReversePaymentObligation("reversed")).toBe(false);
  });
  it("fails closed on an unrecognized status", () => {
    expect(canReversePaymentObligation("not-a-real-status")).toBe(false);
  });
});

// "approved" deliberately overlaps both guards — an approved-but-unpaid
// payable can be corrected either way (a plain Cancel, or a formal
// Reverse under its own stricter capability); this is intentional, not
// a gap, so the admin payable detail page renders both correction
// sections at that one status. "pending_approval" is cancel-only,
// "paid" is reverse-only, and every terminal/already-corrected status
// (cancelled, reversed) offers neither.
describe("cancel/reverse overlap is confined to 'approved', by design", () => {
  it("pending_approval offers cancel only", () => {
    expect(canCancelPaymentObligation("pending_approval")).toBe(true);
    expect(canReversePaymentObligation("pending_approval")).toBe(false);
  });
  it("approved offers both cancel and reverse", () => {
    expect(canCancelPaymentObligation("approved")).toBe(true);
    expect(canReversePaymentObligation("approved")).toBe(true);
  });
  it("paid offers reverse only", () => {
    expect(canCancelPaymentObligation("paid")).toBe(false);
    expect(canReversePaymentObligation("paid")).toBe(true);
  });
  it("cancelled and reversed offer neither — no further correction on an already-corrected record", () => {
    for (const status of ["cancelled", "reversed"]) {
      expect(canCancelPaymentObligation(status)).toBe(false);
      expect(canReversePaymentObligation(status)).toBe(false);
    }
  });
});

// Phase G.4A (2026-09-04) — the one fact both selectPayableDestination()
// (at selection time) and recordManualPayment() (re-checked live) rely
// on. DB-dependent parts of both call sites aren't locally testable
// without a live Supabase session (same established limitation
// throughout this suite) — this pure guard is the part that's both
// safety-critical and directly verifiable.
describe("isEligibleDestinationForPayable", () => {
  const base = { instructionProfileId: "payee-1", obligationPayeeProfileId: "payee-1", active: true, verificationStatus: "verified" };

  it("accepts an active, verified destination belonging to the payable's own payee", () => {
    expect(isEligibleDestinationForPayable(base)).toBe(true);
  });

  it("rejects a destination belonging to a different payee — even if active and verified", () => {
    expect(isEligibleDestinationForPayable({ ...base, instructionProfileId: "someone-else" })).toBe(false);
  });

  it("rejects an inactive destination", () => {
    expect(isEligibleDestinationForPayable({ ...base, active: false })).toBe(false);
  });

  it("rejects a destination that isn't verified (unverified or rejected)", () => {
    expect(isEligibleDestinationForPayable({ ...base, verificationStatus: "unverified" })).toBe(false);
    expect(isEligibleDestinationForPayable({ ...base, verificationStatus: "rejected" })).toBe(false);
  });
});
