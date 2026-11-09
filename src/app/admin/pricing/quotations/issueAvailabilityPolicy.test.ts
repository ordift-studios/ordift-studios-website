import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ policy: vi.fn(), issue: vi.fn(), user: { id: "u1" } as null | { id: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, hasRole: () => true, isSuperAdmin: () => false }));
vi.mock("@/lib/bookings/quotationAvailabilityService", () => ({ applyAvailabilityPolicyForIssue: h.policy }));
vi.mock("@/lib/commercial/quotationIssuance", () => ({ issueOrdinaryQuotation: h.issue, recordQuotationDelivery: async () => ({ ok: true }) }));
vi.mock("@/lib/commercial/quotationAcceptance", () => ({ recordOrdinaryQuotationAcceptance: async () => ({ ok: true }) }));
vi.mock("@/lib/commercial/clientQuotations", () => ({ createClientQuotation: vi.fn(), updateClientQuotationDraft: vi.fn(), reviseClientQuotation: vi.fn(), deleteClientQuotation: vi.fn(), updateQuotationStatus: vi.fn(), associateProspectQuotationWithClient: vi.fn() }));
vi.mock("@/lib/commercial/pricingCatalog", () => ({ suggestCorporateHeadshotQuotationLine: vi.fn() }));

import { issueQuotationAction } from "./actions";

const fd = (o: Record<string, string> = {}) => { const f = new FormData(); f.set("quotationId", "q1"); f.set("confirm", "on"); f.set("validUntil", "2026-12-01"); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { h.policy.mockReset(); h.issue.mockReset(); h.user = { id: "u1" }; h.issue.mockResolvedValue({ ok: true, validUntil: "2026-12-01", isException: false }); });

describe("issueQuotationAction applies the availability policy BEFORE issuing", () => {
  it("does not issue when the policy refuses (no check, stale check, known firm conflict, missing basis, missing acknowledgement)", async () => {
    h.policy.mockResolvedValue({ ok: false, error: "The last availability check found a firm conflict." });
    expect(await issueQuotationAction(null, fd({ availabilityBasis: "depends" }))).toEqual({ ok: false, error: "The last availability check found a firm conflict." });
    expect(h.issue).not.toHaveBeenCalled();
  });
  it("passes the form's basis, reason and acknowledgement to the policy, with the signed-in user, never trusting a user id from the form", async () => {
    h.policy.mockResolvedValue({ ok: true, mode: "available", conditional: false, summary: "" });
    await issueQuotationAction(null, fd({ availabilityBasis: "independent", independentReason: "Retouching only", conditionalAck: "on", userId: "attacker" }));
    expect(h.policy).toHaveBeenCalledWith({ actorUserId: "u1", quotationId: "q1", basis: "independent", independentReason: "Retouching only", conditionalAck: true });
  });
  it("issues when the policy allows, and says plainly when it was issued as a CONDITIONAL quotation", async () => {
    h.policy.mockResolvedValue({ ok: true, mode: "conditional", conditional: true, summary: "x" });
    const r = await issueQuotationAction(null, fd({ availabilityBasis: "depends", conditionalAck: "on" }));
    expect(h.issue).toHaveBeenCalledTimes(1); expect(r).toMatchObject({ ok: true, message: expect.stringContaining("CONDITIONAL quotation (scheduling subject to confirmation)") });
    h.policy.mockResolvedValue({ ok: true, mode: "available", conditional: false, summary: "" });
    expect(((await issueQuotationAction(null, fd({ availabilityBasis: "depends" }))) as { message: string }).message).not.toContain("CONDITIONAL");
  });
  it("still needs the confirmation tick and a signed-in user before anything else happens", async () => {
    const f = fd(); f.delete("confirm"); expect(await issueQuotationAction(null, f)).toMatchObject({ ok: false }); expect(h.policy).not.toHaveBeenCalled();
    h.user = null; expect(await issueQuotationAction(null, fd())).toMatchObject({ ok: false }); expect(h.issue).not.toHaveBeenCalled();
  });
});
