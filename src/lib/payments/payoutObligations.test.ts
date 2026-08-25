import { describe, expect, it } from "vitest";
import { createPaymentObligation } from "@/lib/payments/payoutObligations";

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
