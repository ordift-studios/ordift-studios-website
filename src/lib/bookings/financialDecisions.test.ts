import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as Record<string, unknown>[], profiles: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: h.rpc, from: (t: string) => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: t === "cancellation_financial_decisions" ? h.rows : null, error: t === "cancellation_financial_decisions" && h.rows.length === 0 ? { message: "relation does not exist" } : null }) }) }), in: async () => ({ data: h.profiles }) }) }) }) }));
import { decideFinancialAction, listFinancialDecisions, recordFinancialExecution, requestFinancialAction } from "./financialDecisions";
const ON = { BOOKING_CONFIRMATION_ENABLED: "true" };
beforeEach(() => { h.rpc.mockReset(); h.rows = []; h.profiles = []; });

describe("the money-decision service", () => {
  it("does nothing while booking confirmation is off", async () => { for (const r of [await requestFinancialAction({ actorUserId: "u", enquiryId: "e", kind: "refund", amountUsd: 5, reason: "x", evidence: "y" }, {}), await decideFinancialAction({ actorUserId: "u", decisionId: "d", decision: "authorised", note: "n" }, {}), await recordFinancialExecution({ actorUserId: "u", decisionId: "d", reference: "r" }, {})]) expect(r.ok).toBe(false); expect(h.rpc).not.toHaveBeenCalled(); });
  it("passes exactly what was typed to the database functions (the database decides) and drops any amount for 'no adjustment'", async () => {
    h.rpc.mockResolvedValue({ data: "d1", error: null });
    expect(await requestFinancialAction({ actorUserId: "u1", enquiryId: "e1", kind: "no_adjustment", amountUsd: 99, reason: "client withdrew, nothing paid", evidence: "Letter ref CL-2026-014" }, ON)).toEqual({ ok: true, id: "d1" });
    expect(h.rpc.mock.calls[0]).toEqual(["request_cancellation_financial_action", { p_enquiry: "e1", p_kind: "no_adjustment", p_amount: null, p_reason: "client withdrew, nothing paid", p_evidence: "Letter ref CL-2026-014", p_actor: "u1" }]);
  });
  it("turns every database refusal into a plain sentence (no codes, no amounts of other people's requests)", async () => {
    const cases: [string, RegExp][] = [["ordift:financial_needs_final_cancellation", /FINAL cancellation/], ["ordift:financial_over_cap", /more than is available/], ["ordift:financial_separation_of_duties", /different Super Admin/], ["ordift:financial_evidence", /evidence reference/], ["ordift:booking_not_authorised", /not authorised/], ["ordift:financial_decision_is_final", /already been decided/], ["ordift:financial_not_authorised", /Only an authorised request/], ["ordift:financial_reference", /external reference/]];
    for (const [code, re] of cases) { h.rpc.mockResolvedValue({ data: null, error: { message: code } }); const r = code.includes("separation") || code.includes("is_final") ? await decideFinancialAction({ actorUserId: "u", decisionId: "d", decision: "authorised", note: "n" }, ON) : code.includes("not_authorised") && code.includes("financial") || code.includes("reference") ? await recordFinancialExecution({ actorUserId: "u", decisionId: "d", reference: "r" }, ON) : await requestFinancialAction({ actorUserId: "u", enquiryId: "e", kind: "refund", amountUsd: 1, reason: "r", evidence: "e" }, ON); expect(r.ok).toBe(false); expect((r as { error: string }).error).toMatch(re); expect((r as { error: string }).error).not.toMatch(/ordift:/); }
  });
  it("a database without the table says so plainly and never throws", async () => { h.rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.request_cancellation_financial_action in the schema cache" } }); const r = await requestFinancialAction({ actorUserId: "u", enquiryId: "e", kind: "refund", amountUsd: 1, reason: "r", evidence: "e" }, ON); expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/not available in this database/) }); expect(await listFinancialDecisions("e")).toEqual([]); });
  it("lists decisions with member-number-first labels and numeric amounts", async () => {
    h.rows = [{ id: "d1", kind: "refund", amount_usd: "600.00", reason: "r", evidence_ref: "e", status: "authorised", requested_by: "a", requested_at: "2026-11-10T01:00:00Z", decided_by: "b", decided_at: "2026-11-10T02:00:00Z", decision_note: "ok ok ok ok ok", executed_reference: null, executed_by: null, executed_at: null }];
    h.profiles = [{ id: "a", full_name: "Admin A", member_number: "INT0002" }, { id: "b", full_name: "Super B", member_number: null }]; const r = await listFinancialDecisions("e");
    expect(r[0]).toMatchObject({ amount_usd: 600, requestedLabel: "INT0002 — Admin A", decidedLabel: "Super B", executedLabel: null });
  });
});
