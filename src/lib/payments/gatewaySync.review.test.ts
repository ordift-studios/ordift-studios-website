// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Card amount mismatch and completion conflicts must land in manual review, not vanish as ordinary failures. Provider events are synthetic; the database is replaced by an in-memory stand-in.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ payment: { id: "p1", status: "pending" } as Row, cases: [] as Row[], activity: [] as Row[], caseRpcFails: false }));
vi.mock("@/lib/payments/receipts", () => ({ sendPaymentReceiptEmail: async () => ({ ok: true, mode: "logged" }) }));
vi.mock("@/lib/payments/crmStageSync", () => ({ advanceStageOnFullPayment: async () => undefined }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async (name: string, args: Row) => {
    if (name === "acquire_payment_completion_claim") return { data: [{ payment_id: args.p_payment_id, outcome: args.p_outcome }], error: null };
    if (name === "open_payment_review_case") { if (h.caseRpcFails) return { data: null, error: { message: "function does not exist" } }; h.cases.push(args); return { data: "case", error: null }; }
    if (name === "claim_and_log_payment_activity") { h.activity.push(args); return { data: null, error: null }; }
    return { data: null, error: null };
  },
  from: (table: string) => {
    let mode = "select"; let payload: Row = {}; const f: ((r: Row) => boolean)[] = [];
    const run = () => {
      if (table === "payments") {
        if (mode === "update") { const ok = f.every((p) => p(h.payment)); if (ok) Object.assign(h.payment, payload); return { data: ok ? [{ id: "p1" }] : [], error: null }; }
        return { data: { status: h.payment.status }, error: null };
      }
      return { data: table === "payment_receipt_jobs" ? [] : null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q, update: (v: Row) => { mode = "update"; payload = v; return q; }, upsert: () => q, eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, maybeSingle: async () => run(), single: async () => run(), then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  } }) }));
import { applyGatewayEventToPayment } from "./gatewaySync";

const payment = { id: "p1", entity_type: "enquiry", entity_id: "e1", converted_amount: 1550, payment_currency: "GHS" };
const ev = (over: Row) => ({ status: "completed" as const, amount: 1550, currency: "GHS", gatewayFee: null, channel: "card" as const, cardBrand: null, cardLast4: null, refundReference: null, ...over });
beforeEach(() => { h.payment = { id: "p1", status: "pending" }; h.cases = []; h.activity = []; h.caseRpcFails = false; });

describe("card events that need a person", () => {
  it("an amount mismatch marks the attempt Failed AND opens a manual-review case with what was expected and what the provider reported", async () => {
    const r = await applyGatewayEventToPayment(payment, ev({ amount: 1000 }), "webhook");
    expect(r.outcome).toBe("amount-mismatch"); expect(h.payment.status).toBe("failed");
    expect(h.cases).toEqual([{ p_payment_id: "p1", p_reason: "amount_mismatch", p_detail: { expectedAmount: 1550, expectedCurrency: "GHS", receivedAmount: 1000, receivedCurrency: "GHS" }, p_source: "webhook" }]);
  });
  it("a currency mismatch is treated the same way", async () => {
    await applyGatewayEventToPayment(payment, ev({ currency: "USD" }), "verify"); expect(h.payment.status).toBe("failed"); expect(h.cases[0]).toMatchObject({ p_reason: "amount_mismatch", p_source: "verify" });
  });
  it("success reported for an attempt already marked Failed opens a completion_conflict case and does NOT flip the status", async () => {
    h.payment = { id: "p1", status: "failed" }; const r = await applyGatewayEventToPayment(payment, ev({}), "webhook");
    expect(r.outcome).toBe("ignored"); expect(h.payment.status).toBe("failed"); expect(h.cases).toEqual([{ p_payment_id: "p1", p_reason: "completion_conflict", p_detail: { reportedOutcome: "completed", currentStatus: "failed", amount: 1550, currency: "GHS" }, p_source: "webhook" }]);
  });
  it("a normal, matching success opens no case", async () => {
    const r = await applyGatewayEventToPayment(payment, ev({}), "webhook"); expect(r.outcome).toBe("completed"); expect(h.payment.status).toBe("completed"); expect(h.cases).toEqual([]);
  });
  it("if the review case cannot be opened (migration not applied) the payment flow is unchanged: the attempt is still marked Failed and the webhook still answers", async () => {
    h.caseRpcFails = true; const r = await applyGatewayEventToPayment(payment, ev({ amount: 1 }), "webhook"); expect(r.outcome).toBe("amount-mismatch"); expect(h.payment.status).toBe("failed");
  });
});
