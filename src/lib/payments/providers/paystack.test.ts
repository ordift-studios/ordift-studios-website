import { describe, expect, it } from "vitest";
import { paystackProvider } from "./paystack";

// Part B (2026-08-21) — parseWebhookEvent()'s refund.processed handling,
// verified against the actual real Production payload captured for
// PAY-2026-000003's GHS 11.09 partial refund, not inferred from
// documentation. See TECHNICAL_DEBT_REGISTER.md TD-046 and
// MILESTONES.md's "Production refund reconciliation" entry for the
// full history this replaces manual handling of.

function refundPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    event: "refund.processed",
    data: {
      id: "18000505",
      amount: 1109,
      currency: "GHS",
      status: "processed",
      customer_note: "Partial refund",
      merchant_note: "Ordift Studios production partial refund test - PAY-2026-000003",
      refund_reference: "623214176889",
      transaction_reference: "PAY-2026-000003",
      ...overrides,
    },
  });
}

describe("paystackProvider.parseWebhookEvent — refund.processed", () => {
  it("maps the real captured payload shape correctly", () => {
    const event = paystackProvider.parseWebhookEvent(refundPayload());

    expect(event.eventType).toBe("refund.processed");
    expect(event.status).toBe("refunded");
    // Deliberately the *original* transaction's reference, not the
    // refund's own — see the provider's own comment for why: this is
    // what lets the existing gateway_reference-based payment lookup
    // find the original payment unchanged.
    expect(event.gatewayReference).toBe("PAY-2026-000003");
    expect(event.refundReference).toBe("623214176889");
    expect(event.amount).toBe(11.09); // 1109 minor units -> major unit, existing toMajorUnit()
    expect(event.currency).toBe("GHS");
  });

  it("never mixes up gatewayReference and refundReference even when both are present", () => {
    const event = paystackProvider.parseWebhookEvent(refundPayload());
    expect(event.gatewayReference).not.toBe(event.refundReference);
  });

  it("does not throw on a malformed refund payload — missing refund_reference", () => {
    const raw = JSON.stringify({
      event: "refund.processed",
      data: { id: "18000506", amount: 500, currency: "GHS", status: "processed", transaction_reference: "PAY-2026-000099" },
    });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("refunded");
    expect(event.refundReference).toBeNull();
    expect(event.gatewayReference).toBe("PAY-2026-000099");
  });

  it("does not throw on a malformed refund payload — missing transaction_reference", () => {
    const raw = JSON.stringify({
      event: "refund.processed",
      data: { id: "18000507", amount: 500, currency: "GHS", status: "processed", refund_reference: "999888777" },
    });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("refunded");
    expect(event.gatewayReference).toBeNull();
    expect(event.refundReference).toBe("999888777");
  });

  it("does not throw on a malformed refund payload — empty data object", () => {
    const raw = JSON.stringify({ event: "refund.processed", data: {} });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("refunded");
    expect(event.gatewayReference).toBeNull();
    expect(event.refundReference).toBeNull();
    expect(event.amount).toBeNull();
  });

  it("still parses charge.success correctly — regression, refund parsing must not affect the charge path", () => {
    const raw = JSON.stringify({
      event: "charge.success",
      data: { reference: "PAY-2026-000200", amount: 2000, currency: "GHS", channel: "card", fees: 30 },
    });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("completed");
    expect(event.gatewayReference).toBe("PAY-2026-000200");
    expect(event.refundReference).toBeNull();
    expect(event.amount).toBe(20);
    expect(event.gatewayFee).toBe(0.3);
  });

  it("still parses charge.failed correctly — regression", () => {
    const raw = JSON.stringify({ event: "charge.failed", data: { reference: "PAY-2026-000201", amount: 2000, currency: "GHS" } });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("failed");
    expect(event.refundReference).toBeNull();
  });

  it("unrecognized event types remain 'unknown' — regression", () => {
    const raw = JSON.stringify({ event: "subscription.create", data: { reference: "SUB-1" } });
    const event = paystackProvider.parseWebhookEvent(raw);
    expect(event.status).toBe("unknown");
    expect(event.refundReference).toBeNull();
  });
});
