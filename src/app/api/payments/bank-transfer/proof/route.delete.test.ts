// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A client cancels an UNPAID bank instruction. Never one with proof, never someone else's, never a card attempt; the row is kept as history; audited. In-memory table; synthetic data.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], audit: [] as Row[], user: { id: "client-1" } as null | { id: string } }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isStaffOrAdmin: () => false }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async (a: Row) => { h.audit.push(a); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {};
  const run = () => { const m = h.rows.filter((r) => f.every((p) => p(r))); if (mode === "update") { m.forEach((r) => Object.assign(r, payload)); return { data: m[0] ?? null, error: null }; } return { data: m[0] ?? null, error: null }; };
  const q: Record<string, unknown> = { select: () => q, update: (v: Row) => { mode = "update"; payload = v; return q; }, eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return q; }, maybeSingle: async () => run(), then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res) };
  return q;
} }) }));
import { NextRequest } from "next/server";
import { DELETE } from "./route";

const del = async (paymentId = "p1") => { const res = await DELETE(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "DELETE", body: JSON.stringify({ paymentId }) })); return { status: res.status, body: (await res.json()) as Record<string, unknown> }; };
beforeEach(() => { h.user = { id: "client-1" }; h.audit = []; h.rows = [{ id: "p1", user_id: "client-1", status: "pending", payment_method: "bank_transfer", proof_of_payment_asset_path: null }]; });

describe("cancel an unpaid bank instruction", () => {
  it("closes it as failed (kept as history), audits it, and returns ok", async () => { const r = await del(); expect(r.status).toBe(200); expect(h.rows[0].status).toBe("failed"); expect(h.audit[0]).toMatchObject({ action: "payment.bank_transfer_cancelled", entityId: "p1", actorUserId: "client-1" }); });
  it("refuses a payment with proof, one already past pending, a card attempt, and someone else's payment", async () => {
    h.rows[0].proof_of_payment_asset_path = "p/x"; expect((await del()).status).toBe(409);
    h.rows[0].proof_of_payment_asset_path = null; h.rows[0].status = "awaiting_verification"; expect((await del()).status).toBe(409);
    h.rows[0].status = "pending"; h.rows[0].payment_method = "gateway"; expect((await del()).status).toBe(404);
    h.rows[0].payment_method = "bank_transfer"; h.rows[0].user_id = "someone-else"; expect((await del()).status).toBe(404);
    expect(h.audit).toEqual([]); expect(h.rows[0].status).toBe("pending");
  });
  it("needs a signed-in user and a payment id", async () => { h.user = null; expect((await del()).status).toBe(401); h.user = { id: "client-1" }; expect((await del("")).status).toBe(400); });
});
