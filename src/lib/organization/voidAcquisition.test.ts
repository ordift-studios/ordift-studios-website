// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";
import { parseVoidAcquisitionForm } from "./equipmentForms";
import { buildEquipmentViews, type RawAcquisition, type RawInstalment, type RawObligation } from "./equipmentPanelView";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, superAdmin: true, log: vi.fn() }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: h.log }));
vi.mock("./financeOverlap", () => ({ documentFamily: async () => [], expenseOverlapForAcquisition: async () => null }));
import { voidEquipmentAcquisition } from "./equipmentFinancing";

const Q = "ent-qatar", G = "ent-ghana";
const REASON = "Entered with a wrong value; voided to record a correction";
beforeEach(() => {
  h.superAdmin = true; h.log.mockReset();
  h.db = makeFakeDb({ entity_equipment_acquisitions: [{ id: "a-q", employing_entity_id: Q, status: "recorded" }] });
  h.db.rpcHandlers = { void_equipment_acquisition: () => ({ data: null, error: null }) };
});

describe("voidEquipmentAcquisition (library)", () => {
  it("refuses everyone but a Super Admin before reading or writing anything", async () => {
    h.superAdmin = false; const calls = vi.fn(); h.db.rpcHandlers!.void_equipment_acquisition = (a) => { calls(a); return { data: null, error: null }; };
    expect(await voidEquipmentAcquisition({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", reason: REASON })).toMatchObject({ ok: false });
    expect(calls).not.toHaveBeenCalled(); expect(h.log).not.toHaveBeenCalled();
  });
  it("needs a written reason and an acquisition of the entity shown", async () => {
    const calls = vi.fn(); h.db.rpcHandlers!.void_equipment_acquisition = (a) => { calls(a); return { data: null, error: null }; };
    expect(await voidEquipmentAcquisition({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", reason: "short" })).toMatchObject({ ok: false });
    expect(await voidEquipmentAcquisition({ actorUserId: "u", entityId: G, acquisitionId: "a-q", reason: REASON })).toMatchObject({ ok: false });
    expect(await voidEquipmentAcquisition({ actorUserId: "u", entityId: Q, acquisitionId: "missing", reason: REASON })).toMatchObject({ ok: false });
    expect(calls).not.toHaveBeenCalled();
  });
  it("voids through ONE audited database call, trims the reason, logs it, and writes nothing directly", async () => {
    let args: Record<string, unknown> = {}; h.db.rpcHandlers!.void_equipment_acquisition = (a) => { args = a; return { data: null, error: null }; };
    expect(await voidEquipmentAcquisition({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", reason: `  ${REASON}  ` })).toEqual({ ok: true });
    expect(args).toEqual({ p_acquisition: "a-q", p_reason: REASON, p_actor: "u" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_acquisition.voided", entityId: Q }));
    expect(h.db.writes).toEqual([]);
  });
  it("turns each database refusal into a plain explanation and logs nothing", async () => {
    const cases: [string, RegExp][] = [
      ["this acquisition is linked to an asset: unlink it first", /unlink the asset first/i],
      ["a statement is already linked to this acquisition: it was reconciled", /statement is already linked/i],
      ["the financing is already settled (every instalment paid)", /fully paid/i],
      ["that acquisition is not a recorded acquisition", /already be voided/i],
    ];
    for (const [msg, re] of cases) {
      h.db.rpcHandlers!.void_equipment_acquisition = () => ({ data: null, error: { message: msg } });
      const r = await voidEquipmentAcquisition({ actorUserId: "u", entityId: Q, acquisitionId: "a-q", reason: REASON });
      expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(re);
    }
    expect(h.log).not.toHaveBeenCalled();
  });
});

describe("parseVoidAcquisitionForm", () => {
  const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("needs the entity, the acquisition, a reason of 10+ characters and the confirmation tick", () => {
    expect(parseVoidAcquisitionForm(form({ acquisitionId: "a", reason: REASON, confirmVoid: "yes" }))).toMatchObject({ ok: false });
    expect(parseVoidAcquisitionForm(form({ entityId: "e", reason: REASON, confirmVoid: "yes" }))).toMatchObject({ ok: false });
    expect(parseVoidAcquisitionForm(form({ entityId: "e", acquisitionId: "a", reason: "short", confirmVoid: "yes" }))).toMatchObject({ ok: false });
    expect(parseVoidAcquisitionForm(form({ entityId: "e", acquisitionId: "a", reason: REASON }))).toMatchObject({ ok: false });
    expect(parseVoidAcquisitionForm(form({ entityId: "e", acquisitionId: "a", reason: ` ${REASON} `, confirmVoid: "yes" }))).toEqual({ ok: true, entityId: "e", acquisitionId: "a", reason: REASON });
  });
});

describe("buildEquipmentViews with a voided acquisition", () => {
  const acq = (id: string, status: "recorded" | "void", over: Partial<RawAcquisition> = {}): RawAcquisition => ({
    id, supplier_name: "FNAC", supplier_branch: null, invoice_number: "235829", purchase_date: "2026-11-08", item_description: "Wacom One", quantity: 1, currency: "QAR", list_price_total: 1499, discount_total: 350, net_amount: 1149, customer_as_shown: "Founder",
    invoice_document_id: "d1", funding_source_status: "company_account", funding_source_note: "statement", accounting_classification: "pending_professional_review", bank_evidence_document_id: null, created_at: "2026-11-08T10:00:00Z", status, void_reason: status === "void" ? REASON : null, ...over });
  const ob = (id: string, a: string, status: RawObligation["status"]): RawObligation => ({ id, acquisition_id: a, provider: "PayLater", provider_reference: "SQ1", instalment_count: 4, financed_amount: 1149, plan_started_on: "2026-11-08", confirmation_document_id: "d2", schedule_basis: "founder_expected_months", status });
  const ins = (o: string, status: RawInstalment["status"], paidFirst: boolean): RawInstalment[] => [1, 2, 3, 4].map((n) => ({ id: `${o}-${n}`, obligation_id: o, sequence: n, amount: 287.25, expected_month: `2026-1${n}-01`.replace("2026-13", "2027-01").replace("2026-14", "2027-02"), status: n === 1 && paidFirst ? status : status, paid_on: n === 1 && paidFirst ? "2026-11-08" : null, evidence_document_id: null, bank_evidence_document_id: null, evidence_note: n === 1 && paidFirst ? "PayLater PDF shows the down payment" : null }));
  const docs = [{ id: "d1", filename: "r.jpg", sha256: "a", documentType: "purchase_receipt" }, { id: "d2", filename: "p.pdf", sha256: "b", documentType: "other_financial_document" }];

  it("keeps the voided acquisition with its voided financing, its reason and the payment facts it had, and carries no liability", () => {
    const views = buildEquipmentViews({ acquisitions: [acq("a-old", "void")], obligations: [ob("o-old", "a-old", "void")], instalments: ins("o-old", "void", true), docs, entityLegalName: "Ordift Studios (Qatar)", today: "2026-11-12" });
    expect(views).toHaveLength(1);
    const v = views[0];
    expect([v.status, v.voidReason]).toEqual(["void", REASON]);
    expect(v.financing?.status).toBe("void");
    expect(v.financing?.instalments.map((i) => i.state)).toEqual(["void", "void", "void", "void"]);
    expect(v.financing?.instalments[0]).toMatchObject({ paidOn: "2026-11-08", evidenceNote: "PayLater PDF shows the down payment" });
    expect(v.position.outstandingLiability).toBe(0);
    expect(v.acceptsDirectPayments).toBe(false);
  });
  it("a corrected record of the same invoice sits beside the voided one and only the live one carries a liability", () => {
    const views = buildEquipmentViews({
      acquisitions: [acq("a-old", "void"), acq("a-new", "recorded", { created_at: "2026-11-12T09:00:00Z" })],
      obligations: [ob("o-old", "a-old", "void"), ob("o-new", "a-new", "active")],
      instalments: [...ins("o-old", "void", true), ...ins("o-new", "pending", false)], docs, entityLegalName: "Ordift Studios (Qatar)", today: "2026-11-12" });
    const live = views.filter((v) => v.status !== "void"), voided = views.filter((v) => v.status === "void");
    expect([live.length, voided.length]).toEqual([1, 1]);
    expect(live[0].financing?.id).toBe("o-new");
    expect(live[0].position.outstandingLiability).toBe(1149);
    expect(voided[0].position.outstandingLiability).toBe(0);
    expect(live[0].position.expenseRecognised).toBe(0);
  });
  it("a live acquisition is unchanged by the new fields", () => {
    const [v] = buildEquipmentViews({ acquisitions: [acq("a1", "recorded")], obligations: [ob("o1", "a1", "active")], instalments: ins("o1", "pending", false), docs, entityLegalName: "Ordift Studios (Qatar)", today: "2026-11-12" });
    expect([v.status, v.voidReason]).toEqual(["recorded", null]);
    expect(v.financing?.status).toBe("active");
  });
});
