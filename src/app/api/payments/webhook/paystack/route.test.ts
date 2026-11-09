// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The webhook finds its payment by the provider's reference, restricted to CARD rows and never a refund row, so a bank transfer's own reference can never match a provider event.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], applied: [] as Row[] }));
vi.mock("@/lib/payments/providers/paystack", () => ({ paystackProvider: { verifyWebhookSignature: () => true, parseWebhookEvent: () => ({ eventType: "charge.success", gatewayReference: "SHARED-REF-1", status: "completed", amount: 100, currency: "GHS", raw: {} }) } }));
vi.mock("@/lib/payments/paymentIdempotency", () => ({ checkAndMarkWebhookEvent: async () => ({ outcome: "new" }) }));
vi.mock("@/lib/payments/gatewaySync", () => ({ applyGatewayEventToPayment: async (p: Row) => { h.applied.push(p); return { outcome: "completed" }; } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select";
  const run = () => {
    if (table === "payment_webhook_events") return { data: mode === "insert" ? { id: "w1", received_at: new Date().toISOString() } : [], error: null };
    const m = h.rows.filter((r) => f.every((p) => p(r)));
    if (m.length > 1) return { data: null, error: { message: "multiple rows" } };   // what maybeSingle does with two matches
    return { data: m[0] ?? null, error: null };
  };
  const q: Record<string, unknown> = {
    insert: () => { mode = "insert"; return q; }, update: () => { mode = "update"; return q; }, select: () => q, order: () => q, limit: () => q,
    eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, neq: (c: string, v: unknown) => { f.push((r) => r[c] !== v); return q; },
    single: async () => run(), maybeSingle: async () => run(), then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
} }) }));
import { NextRequest } from "next/server";
import { POST } from "./route";

const hook = async () => { const res = await POST(new NextRequest("http://localhost/api/payments/webhook/paystack", { method: "POST", body: "{}", headers: { "x-paystack-signature": "x" } })); return (await res.json()) as Record<string, unknown>; };
beforeEach(() => { h.rows = []; h.applied = []; });

describe("paystack webhook payment lookup", () => {
  it("finds the card payment for the provider's reference", async () => {
    h.rows = [{ id: "card1", payment_method: "gateway", payment_type: "full", gateway_reference: "SHARED-REF-1" }];
    expect(await hook()).toMatchObject({ processed: true }); expect(h.applied.map((p) => p.id)).toEqual(["card1"]);
  });
  it("is not confused by a bank-transfer row, or a refund row, that happens to carry the same reference", async () => {
    h.rows = [{ id: "card1", payment_method: "gateway", payment_type: "full", gateway_reference: "SHARED-REF-1" }, { id: "bank1", payment_method: "bank_transfer", payment_type: "full", gateway_reference: "SHARED-REF-1" }, { id: "refund1", payment_method: "gateway", payment_type: "refund", gateway_reference: "SHARED-REF-1" }];
    expect(await hook()).toMatchObject({ processed: true }); expect(h.applied.map((p) => p.id)).toEqual(["card1"]);
  });
  it("matches nothing when only a bank-transfer row carries the reference", async () => {
    h.rows = [{ id: "bank1", payment_method: "bank_transfer", payment_type: "full", gateway_reference: "SHARED-REF-1" }];
    expect(await hook()).toMatchObject({ processed: false, reason: "no-matching-payment" }); expect(h.applied).toEqual([]);
  });
});
