// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, canVerify: false, rpc: vi.fn(), audit: [] as Record<string, unknown>[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/payments/bankTransferAccess", () => ({ canVerifyBankTransfers: async () => h.canVerify }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (a: Record<string, unknown>) => { h.audit.push(a); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => h.rpc(...a) }) }));
import { resolveReviewCaseAction } from "./reviewCaseActions";

const form = (o: Record<string, string | undefined>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, v); return f; };
beforeEach(() => { h.user = { id: "u1" }; h.canVerify = true; h.rpc.mockReset(); h.audit = []; });

describe("resolveReviewCaseAction: authorization and audit", () => {
  it("refuses a signed-out user and anyone without the verification authority, without touching the database", async () => {
    h.user = null; expect((await resolveReviewCaseAction(null, form({ caseId: "c1", resolution: "other", note: "Long enough note." })))?.ok).toBe(false);
    h.user = { id: "u1" }; h.canVerify = false; expect((await resolveReviewCaseAction(null, form({ caseId: "c1", resolution: "other", note: "Long enough note." })))?.ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.audit).toEqual([]);
  });
  it("refuses a missing case, an unknown resolution and a short note before any database call", async () => {
    for (const f of [{ resolution: "other", note: "Long enough note." }, { caseId: "c1", resolution: "deleted", note: "Long enough note." }, { caseId: "c1", resolution: "other", note: "short" }]) expect((await resolveReviewCaseAction(null, form(f)))?.ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("resolves through the database function with the resolver's id, and audits who resolved what", async () => {
    h.rpc.mockResolvedValue({ data: { payment_id: "p1", reason: "amount_mismatch" }, error: null });
    const r = await resolveReviewCaseAction(null, form({ caseId: "c1", resolution: "confirmed_not_charged", note: "Checked the provider dashboard: no charge." }));
    expect(r?.ok).toBe(true); expect(h.rpc).toHaveBeenCalledWith("resolve_payment_review_case", { p_case_id: "c1", p_resolver: "u1", p_resolution: "confirmed_not_charged", p_note: "Checked the provider dashboard: no charge." });
    expect(h.audit[0]).toMatchObject({ actorUserId: "u1", action: "payment.review_case_resolved", entityId: "p1", metadata: { caseId: "c1", reason: "amount_mismatch", resolution: "confirmed_not_charged" } });
  });
  it("shows the database's refusal in plain words and audits nothing", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "case_already_resolved" } });
    const r = await resolveReviewCaseAction(null, form({ caseId: "c1", resolution: "other", note: "Long enough note." })); expect(r?.ok).toBe(false); expect(h.audit).toEqual([]);
  });
});
