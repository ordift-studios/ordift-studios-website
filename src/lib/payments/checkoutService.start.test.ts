// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Card checkout start: what happens when the provider's answer is unusable or its reference cannot be saved. In-memory payments table; the provider, rates and market are replaced. Synthetic data.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], charge: null as unknown, failRefSaves: 0, cases: [] as Row[], seq: 0, guard: false }));
vi.mock("@/lib/payments/paymentMarket", () => ({ getEntityPaymentCountry: async () => "GH" }));
vi.mock("@/lib/payments/providerRegistry", () => ({ getActiveCountryConfig: async () => ({ defaultCurrencyCode: "GHS", gatewayProvider: "paystack" }), getProvider: () => ({ id: "paystack", initCharge: async () => { if (h.charge instanceof Error) throw h.charge; return h.charge; } }) }));
vi.mock("@/lib/payments/currency", () => ({ lockExchangeRate: async (usd: number) => ({ rateToUsd: 15.5, convertedAmount: Math.round(usd * 15.5 * 100) / 100, currencyCode: "GHS", source: "ordift", lockedAt: new Date().toISOString() }), convertedAmountsMatch: () => true }));
vi.mock("@/lib/payments/reconcilePendingPayment", () => ({ reconcilePendingGatewayPayment: async () => "pending" }));
vi.mock("@/lib/shared/recordId", () => ({ generateRecordId: async () => `PAY-2026-${String(++h.seq).padStart(6, "0")}` }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => { const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { amount_due: 1000, amount_paid: 0 }, error: null }) }; return q; } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async (name: string, args: Row) => { if (name === "open_payment_review_case") h.cases.push(args); return { data: "case-1", error: null }; },
  from: () => {
    const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {}; let want = false;
    const run = () => {
      if (mode === "insert" && h.guard) return { data: null, error: { message: "ordift:would_exceed_outstanding" } };
      if (mode === "insert") { const row = { id: `p${h.rows.length + 1}`, ...payload }; h.rows.push(row); return { data: row, error: null }; }
      const m = h.rows.filter((r) => f.every((p) => p(r)));
      if (mode === "update") {
        if ("gateway_reference" in payload && h.failRefSaves > 0) { h.failRefSaves--; return { data: null, error: { message: "boom" } }; }
        m.forEach((r) => Object.assign(r, payload)); return { data: want ? m[0] ?? null : null, error: null };
      }
      return { data: m[0] ?? null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => { want = true; return q; }, insert: (v: Row) => { mode = "insert"; payload = v; return q; }, update: (v: Row) => { mode = "update"; payload = v; return q; },
      eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, single: async () => run(), maybeSingle: async () => run(), then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  } }) }));
import { initiateGatewayCheckout } from "./checkoutService";

const start = () => initiateGatewayCheckout({ entityType: "enquiry", entityId: "e1", paymentType: "partial", country: "GH", userId: "u1", email: "c@e2e.test", callbackUrlBase: "http://localhost:3000/pay", requestedAmountUsd: 100, quotedConvertedAmount: 1550 });
beforeEach(() => { h.rows = []; h.charge = { checkoutUrl: "https://checkout.example/abc", providerReference: "PAY-2026-000001" }; h.failRefSaves = 0; h.cases = []; h.seq = 0; h.guard = false; });

describe("card checkout start: provider result handling", () => {
  it("a usable result saves the reference and returns the checkout address", async () => {
    const r = await start(); expect(r).toMatchObject({ ok: true, checkoutUrl: "https://checkout.example/abc" });
    expect(h.rows[0]).toMatchObject({ status: "pending", gateway_reference: "PAY-2026-000001" }); expect(h.cases).toEqual([]);
  });
  it("a result with no provider reference is refused: the attempt is closed as Failed and the customer is not sent anywhere", async () => {
    h.charge = { checkoutUrl: "https://checkout.example/abc", providerReference: "" };
    const r = await start(); expect(r).toMatchObject({ ok: false, error: "gateway-init-failed" }); expect(h.rows[0]).toMatchObject({ status: "failed" }); expect(h.rows[0].gateway_reference).toBeUndefined();
  });
  it("a checkout address that is not https is refused the same way", async () => {
    h.charge = { checkoutUrl: "http://evil.example/x", providerReference: "PAY-2026-000001" };
    expect(await start()).toMatchObject({ ok: false, error: "gateway-init-failed" }); expect(h.rows[0].status).toBe("failed");
  });
  it("a reference that cannot be saved on the first try is retried once and then succeeds", async () => {
    h.failRefSaves = 1; const r = await start(); expect(r.ok).toBe(true); expect(h.rows[0].gateway_reference).toBe("PAY-2026-000001"); expect(h.cases).toEqual([]);
  });
  it("a reference that cannot be saved at all closes the attempt as Failed, never hands over the address, and opens a review case carrying the provider reference", async () => {
    h.failRefSaves = 5; const r = await start();
    expect(r).toMatchObject({ ok: false, error: "gateway-init-failed" }); expect(JSON.stringify(r)).not.toMatch(/checkout\.example/); expect(h.rows[0].status).toBe("failed");
    expect(h.cases).toEqual([{ p_payment_id: "p1", p_reason: "reference_unrecorded", p_detail: { providerReference: "PAY-2026-000001" }, p_source: "checkout" }]);
  });
  it("a provider error leaves the attempt Failed with no review case (nothing was created at the provider)", async () => {
    h.charge = new Error("boom"); expect(await start()).toMatchObject({ ok: false, error: "gateway-init-failed" }); expect(h.rows[0].status).toBe("failed"); expect(h.cases).toEqual([]);
  });
  it("when the database says other open instructions already hold what is owed, nothing is sent to the provider and the client gets a plain code", async () => {
    h.guard = true; const r = await start(); expect(r).toEqual({ ok: false, error: "open-instructions-cover-balance" }); expect(h.rows).toHaveLength(0);
  });
});
