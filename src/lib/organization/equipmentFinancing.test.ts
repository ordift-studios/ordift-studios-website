import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ superAdmin: true, rpc: vi.fn(), log: vi.fn(), owner: "11111111-1111-4111-8111-111111111101" }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: h.log }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: h.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "i2", entity_financing_obligations: { employing_entity_id: h.owner } }, error: null }) }) }) }) }) }));

import { markInstalmentPaid, recordEquipmentAcquisition } from "./equipmentFinancing";
const E = "11111111-1111-4111-8111-111111111101", D1 = "22222222-2222-4222-8222-222222222201", D2 = "22222222-2222-4222-8222-222222222202";
const input = () => ({ actorUserId: "u1", acquisition: { entityId: E, supplier: "Synthetic Supplier", invoiceNumber: "INV-1001", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", quantity: 1, currency: "QAR", listPrice: 1499, discount: 350, net: 1149, invoiceDocumentId: D1, fundingStatus: "to_confirm" },
  financing: { provider: "SyntheticPay", reference: "PL-REF-1001", count: 4, plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: D2, scheduleBasis: "founder_expected_months", firstPaid: { paidOn: "2026-11-08", evidenceNote: "Provider confirmation: down payment paid" } } });

beforeEach(() => { h.owner = E; h.superAdmin = true; h.rpc.mockReset(); h.log.mockReset(); });

describe("recordEquipmentAcquisition", () => {
  it("refuses everyone but a Super Admin before touching the database", async () => {
    h.superAdmin = false;
    expect(await recordEquipmentAcquisition(input())).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("validates before the database is called", async () => {
    const i = input(); i.acquisition.net = 1;
    expect(await recordEquipmentAcquisition(i)).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("sends ONE call with the whole record (acquisition, financing, four instalments, first paid) and audits it", async () => {
    h.rpc.mockResolvedValue({ data: [{ acquisition_id: "a1", obligation_id: "o1" }], error: null });
    expect(await recordEquipmentAcquisition(input())).toEqual({ ok: true, acquisitionId: "a1", obligationId: "o1" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("record_equipment_acquisition");
    expect(args.p.financing.instalments).toHaveLength(4);
    expect(args.p.firstInstalmentPaid.sequence).toBe(1);
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_acquisition.recorded", metadata: expect.objectContaining({ classification: "pending_professional_review" }) }));
  });
  it("turns a duplicate invoice into a plain message and logs nothing", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "acquisitions_one_per_invoice"' } });
    expect(await recordEquipmentAcquisition(input())).toEqual({ ok: false, error: "This supplier invoice is already recorded as an acquisition." });
    expect(h.log).not.toHaveBeenCalled();
  });
});

describe("markInstalmentPaid", () => {
  it("needs evidence and a Super Admin", async () => {
    expect(await markInstalmentPaid({ actorUserId: "u1", entityId: E, instalmentId: "i2", paidOn: "2026-12-01" })).toMatchObject({ ok: false });
    h.superAdmin = false;
    expect(await markInstalmentPaid({ actorUserId: "u1", entityId: E, instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "Bank statement line seen" })).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses an instalment that belongs to another legal entity (tampered form) before calling the database", async () => {
    h.owner = "99999999-9999-4999-8999-999999999999";
    expect(await markInstalmentPaid({ actorUserId: "u1", entityId: E, instalmentId: "i2", paidOn: "2026-11-08", evidenceDocumentId: D2 })).toEqual({ ok: false, error: "That instalment does not belong to this legal entity." });
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.log).not.toHaveBeenCalled();
  });
  it("records a payment that has evidence, and audits it", async () => {
    h.rpc.mockResolvedValue({ error: null });
    expect(await markInstalmentPaid({ actorUserId: "u1", entityId: E, instalmentId: "i2", paidOn: "2026-11-08", evidenceDocumentId: D2 })).toEqual({ ok: true });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_instalment.paid" }));
  });
});
