// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The bank-transfer START (PUT): one open instruction per client, record and payment type, including when two requests race. In-memory payments table that behaves like the database rule
// (a second OPEN bank-transfer row for the same client, record and type is a unique violation, code 23505). Synthetic data; nothing leaves this file.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], hideFromNextFind: false, refreshMisses: 0, audit: [] as Row[], seq: 0, guard: false }));
const key = (r: Row) => `${r.entity_type}|${r.entity_id}|${r.user_id}|${r.payment_type}`;
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => ({ id: "client-1", email: "c@e2e.test", roles: ["client"] }), isStaffOrAdmin: () => false }));
vi.mock("@/lib/shared/rateLimit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/shared/recordId", () => ({ generateRecordId: async () => `PAY-2026-${String(++h.seq).padStart(6, "0")}` }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async (a: Row) => { h.audit.push(a); } }));
vi.mock("@/lib/payments/paymentMarket", () => ({ getEntityPaymentCountry: async () => "QA" }));
vi.mock("@/lib/payments/bankAccounts", () => ({ getActiveBankAccount: async () => ({ id: "acct-1", bankName: "Synthetic Bank", accountName: "Synthetic", accountNumber: "000", iban: null, swiftCode: null, currencyCode: "QAR", country: "QA", classification: "corporate" }) }));
vi.mock("@/lib/payments/checkoutService", async (orig) => ({ ...(await orig<typeof import("@/lib/payments/checkoutService")>()), resolveEntityAmounts: async () => ({ amountDueUsd: 1000, amountPaidUsd: 0 }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => { const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: t === "payment_country_config" ? { default_currency_code: "QAR" } : { rate_to_usd: 3.64 } }) }; return q; } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {}; let wantRow = false; let single = false;
  const run = (): { data: unknown; error: { code: string; message: string } | null } => {
    if (table !== "payments") return { data: null, error: null };
    if (mode === "insert") {
      if (h.guard) return { data: null, error: { code: "P0001", message: "ordift:would_exceed_outstanding" } };
      if (payload.payment_method === "bank_transfer" && payload.status === "pending" && h.rows.some((r) => r.payment_method === "bank_transfer" && r.status === "pending" && key(r) === key(payload))) return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "payments_one_open_bank_transfer_instruction"' } };
      const row = { id: `p${h.rows.length + 1}`, ...payload }; h.rows.push(row); return { data: row, error: null };
    }
    const m = h.rows.filter((r) => f.every((p) => p(r)));
    if (mode === "update") { if (h.guard) return { data: null, error: { code: "P0001", message: "ordift:would_exceed_outstanding" } }; if (h.refreshMisses > 0) { h.refreshMisses--; return { data: null, error: null }; } m.forEach((r) => Object.assign(r, payload)); return { data: wantRow ? m[0] ?? null : null, error: null }; }
    if (h.hideFromNextFind) { h.hideFromNextFind = false; return { data: null, error: null }; }
    return { data: single ? m[0] ?? null : m, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => { wantRow = true; return q; }, insert: (v: Row) => { mode = "insert"; payload = v; return q; }, update: (v: Row) => { mode = "update"; payload = v; return q; },
    eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return q; }, order: () => q, limit: () => q, in: () => q,
    maybeSingle: async () => { single = true; return run(); }, single: async () => { single = true; return run(); },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
} }) }));

import { NextRequest } from "next/server";
import { PUT } from "./route";

const put = async (over: Record<string, unknown> = {}) => {
  const res = await PUT(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "PUT", body: JSON.stringify({ entityType: "enquiry", entityId: "e1", paymentType: "partial", amountUsd: 100, quotedConvertedAmount: 364, ...over }) }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const open = () => h.rows.filter((r) => r.payment_method === "bank_transfer" && r.status === "pending");
beforeEach(() => { h.rows = []; h.hideFromNextFind = false; h.refreshMisses = 0; h.audit = []; h.seq = 0; h.guard = false; });

describe("bank-transfer start: one open instruction", () => {
  it("creates one instruction and audits it once; pressing again reuses it (refreshing the amount) and creates nothing", async () => {
    const a = await put(); expect(a.status).toBe(200); expect(open()).toHaveLength(1); expect(h.audit.map((x) => x.action)).toEqual(["payment.bank_transfer_initiated"]);
    const b = await put({ amountUsd: 150, quotedConvertedAmount: 546 }); expect(b.body.paymentId).toBe(a.body.paymentId); expect(open()).toHaveLength(1); expect(open()[0].reference_amount_usd).toBe(150); expect(h.audit).toHaveLength(1);
  });
  it("when two requests race (both looked, neither found one) the database refuses the second insert and the route answers with the winner: no second row, no second audit entry, no error shown", async () => {
    const first = await put(); h.hideFromNextFind = true;                                          // the second request's look finds nothing, as in a real race
    const second = await put();
    expect(second.status).toBe(200); expect(second.body.paymentId).toBe(first.body.paymentId); expect(open()).toHaveLength(1); expect(h.audit).toHaveLength(1);
  });
  it("if the winner has moved on (proof submitted) by the time the loser looks again, the loser is told one is already in progress and nothing is created", async () => {
    await put(); h.hideFromNextFind = true; h.refreshMisses = 1;
    const second = await put(); expect(second.status).toBe(409); expect(second.body.error).toBe("checkout-already-in-progress"); expect(open()).toHaveLength(1);
  });
  it("an open instruction whose proof was submitted a moment ago is not reused: a fresh instalment instruction is created", async () => {
    const a = await put(); h.rows.find((r) => r.id === a.body.paymentId)!.status = "awaiting_verification";
    const b = await put(); expect(b.status).toBe(200); expect(b.body.paymentId).not.toBe(a.body.paymentId); expect(open()).toHaveLength(1); expect(h.rows).toHaveLength(2);
  });
  it("separate payment obligations are not merged: another payment type or another record gets its own instruction", async () => {
    const a = await put(); const b = await put({ paymentType: "balance", amountUsd: 1000, quotedConvertedAmount: 3640 }); const c = await put({ entityId: "e2" });
    expect(new Set([a.body.paymentId, b.body.paymentId, c.body.paymentId]).size).toBe(3); expect(open()).toHaveLength(3);
  });
  it("a client with an earlier instalment awaiting verification can start the next one", async () => {
    const a = await put(); h.rows[0].status = "awaiting_verification"; h.rows[0].payment_type = "partial";
    const b = await put(); expect(b.status).toBe(200); expect(b.body.paymentId).not.toBe(a.body.paymentId);
  });
  it("answers with the same fields as before (reference, amount, currency, rate lock, receiving account) so the checkout screens are unaffected", async () => {
    const a = await put(); expect(Object.keys(a.body).sort()).toEqual(["convertedAmount", "currencyCode", "ok", "paymentId", "rateLockedAt", "rateToUsd", "receivingAccount", "recordId"]);
  });
  it("when the database says the other open instructions already hold what is owed, nothing is created and the client gets a plain 409", async () => {
    h.guard = true; const r = await put(); expect(r.status).toBe(409); expect(r.body.error).toBe("open-instructions-cover-balance"); expect(h.rows).toHaveLength(0); expect(h.audit).toEqual([]);
  });
  it("the same when refreshing an existing open instruction to a larger amount would exceed it: the existing instruction is left as it was", async () => {
    const a = await put(); h.guard = true; const b = await put({ amountUsd: 900, quotedConvertedAmount: 3276 });
    expect(b.status).toBe(409); expect(b.body.error).toBe("open-instructions-cover-balance"); expect(open()).toHaveLength(1); expect(open()[0].reference_amount_usd).toBe(100); expect(a.body.paymentId).toBe(open()[0].id);
  });
});
