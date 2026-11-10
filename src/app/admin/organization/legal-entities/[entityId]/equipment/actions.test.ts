// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, superAdmin: false, record: vi.fn(), pay: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: () => h.superAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/organization/equipmentFinancing", () => ({ recordEquipmentAcquisition: h.record, markInstalmentPaid: h.pay }));
import { markInstalmentPaidAction, recordEquipmentAction } from "./actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const acq = { entityId: "e1", supplier: "Synthetic Supplier", invoiceNumber: "INV-1", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", currency: "QAR", listPrice: "1499", discount: "350", net: "1149", invoiceDocumentId: "d1" };
const pay = { entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "provider app shows it paid", confirmUnverified: "yes" };

beforeEach(() => { h.user = { id: "u1" }; h.superAdmin = true; h.record.mockReset(); h.pay.mockReset(); h.revalidate.mockReset(); });

describe("equipment actions — access", () => {
  it("refuse anonymous and non-Super-Admin users before reading the form or calling the library", async () => {
    h.user = null;
    expect(await recordEquipmentAction(null, fd(acq))).toEqual({ ok: false, error: "Not authenticated." });
    h.user = { id: "u1" }; h.superAdmin = false;
    expect(await recordEquipmentAction(null, fd(acq))).toMatchObject({ ok: false });
    expect(await markInstalmentPaidAction(null, fd(pay))).toMatchObject({ ok: false });
    expect(h.record).not.toHaveBeenCalled(); expect(h.pay).not.toHaveBeenCalled();
  });
});

describe("equipment actions — behaviour", () => {
  it("records an acquisition as the signed-in Super Admin and refreshes only the equipment page", async () => {
    h.record.mockResolvedValue({ ok: true, acquisitionId: "a1", obligationId: null });
    expect(await recordEquipmentAction(null, fd(acq))).toEqual({ ok: true });
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "u1", financing: null, acquisition: expect.objectContaining({ currency: "QAR", fundingStatus: "to_confirm" }) }));
    expect(h.revalidate).toHaveBeenCalledWith("/admin/organization/legal-entities/e1/equipment");
  });
  it("passes a library refusal back unchanged and does not refresh", async () => {
    h.record.mockResolvedValue({ ok: false, error: "This supplier invoice is already recorded as an acquisition." });
    expect(await recordEquipmentAction(null, fd(acq))).toEqual({ ok: false, error: "This supplier invoice is already recorded as an acquisition." });
    expect(h.revalidate).not.toHaveBeenCalled();
  });
  it("marks an instalment reported-paid only with the explicit not-reconciled confirmation", async () => {
    const { confirmUnverified: _c, ...without } = pay; void _c;
    expect(await markInstalmentPaidAction(null, fd(without))).toMatchObject({ ok: false });
    expect(h.pay).not.toHaveBeenCalled();
    h.pay.mockResolvedValue({ ok: true });
    expect(await markInstalmentPaidAction(null, fd(pay))).toEqual({ ok: true });
    expect(h.pay).toHaveBeenCalledWith({ actorUserId: "u1", entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceDocumentId: null, evidenceNote: "provider app shows it paid" });
  });
});
