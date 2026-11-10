// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, superAdmin: false, record: vi.fn(), pay: vi.fn(), revalidate: vi.fn(), terms: vi.fn(), payment: vi.fn(), voidPay: vi.fn(), bundle: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: () => h.superAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/organization/equipmentFinancing", () => ({ recordEquipmentAcquisition: h.record, markInstalmentPaid: h.pay, setAcquisitionTerms: h.terms, recordAcquisitionPayment: h.payment, voidAcquisitionPayment: h.voidPay, recordAcquisitionBundle: h.bundle }));
import { markInstalmentPaidAction, recordEquipmentAction, recordPaymentAction, setTermsAction, voidPaymentAction } from "./actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const acq = { entityId: "e1", supplier: "Synthetic Supplier", invoiceNumber: "INV-1", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", currency: "QAR", listPrice: "1499", discount: "350", net: "1149", invoiceDocumentId: "d1" };
const pay = { entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "provider app shows it paid", confirmUnverified: "yes" };

beforeEach(() => { h.user = { id: "u1" }; h.superAdmin = true; for (const m of [h.record, h.pay, h.revalidate, h.terms, h.payment, h.voidPay, h.bundle]) m.mockReset(); });

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

describe("payment-arrangement actions", () => {
  const outright = { ...acq, arrangement: "paid_in_full", paymentAmount: "2000", paymentPaidOn: "2026-11-08", paymentMethod: "bank_transfer", paymentEvidenceNote: "transfer confirmation seen", paymentConfirmUnverified: "yes" };
  const payForm = { entityId: "e1", acquisitionId: "a1", kind: "balance", amount: "500", paidOn: "2026-11-09", method: "cheque", evidenceNote: "cheque stub photographed", confirmUnverified: "yes" };
  it("every new action refuses a non-Super-Admin before touching the library", async () => {
    h.superAdmin = false;
    for (const r of [await setTermsAction(null, fd({ entityId: "e1", acquisitionId: "a1", arrangement: "unpaid" })), await recordPaymentAction(null, fd(payForm)), await voidPaymentAction(null, fd({ entityId: "e1", paymentId: "p1", reason: "entered against the wrong purchase" })), await recordEquipmentAction(null, fd(outright))]) expect(r).toMatchObject({ ok: false });
    for (const m of [h.record, h.terms, h.payment, h.voidPay, h.bundle]) expect(m).not.toHaveBeenCalled();
  });
  it("an outright purchase with its payment goes through ONE atomic call (no separate terms/payment calls, no financing)", async () => {
    h.bundle.mockResolvedValue({ ok: true, acquisitionId: "acq-9" });
    expect(await recordEquipmentAction(null, fd(outright))).toEqual({ ok: true });
    expect(h.bundle).toHaveBeenCalledTimes(1);
    expect(h.bundle).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "u1", terms: expect.objectContaining({ arrangement: "paid_in_full" }), payment: expect.objectContaining({ kind: "full", method: "bank_transfer" }) }));
    for (const m of [h.record, h.terms, h.payment]) expect(m).not.toHaveBeenCalled();
  });
  it("if the atomic call is refused NOTHING is recorded and the message says why; nothing is refreshed", async () => {
    h.bundle.mockResolvedValue({ ok: false, error: "This payment would take the total above the net price." });
    expect(await recordEquipmentAction(null, fd(outright))).toEqual({ ok: false, error: "This payment would take the total above the net price." });
    expect(h.revalidate).not.toHaveBeenCalled();
  });
  it("a purchase left 'to be confirmed' uses the original single call; a financed one keeps its financing path", async () => {
    h.record.mockResolvedValue({ ok: true, acquisitionId: "acq-9", obligationId: null });
    expect(await recordEquipmentAction(null, fd(acq))).toEqual({ ok: true });
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ financing: null }));
    const fin = { ...acq, arrangement: "financed", provider: "SyntheticPay", providerReference: "SP-1", instalmentCount: "4", plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: "d2" };
    await recordEquipmentAction(null, fd(fin));
    expect(h.record).toHaveBeenLastCalledWith(expect.objectContaining({ financing: expect.objectContaining({ provider: "SyntheticPay", count: 4 }) }));
    expect(h.bundle).not.toHaveBeenCalled();
  });
  it("record payment / terms / void pass the signed-in actor and refresh only the equipment page", async () => {
    h.payment.mockResolvedValue({ ok: true }); h.terms.mockResolvedValue({ ok: true }); h.voidPay.mockResolvedValue({ ok: true });
    expect(await recordPaymentAction(null, fd(payForm))).toEqual({ ok: true });
    expect(await setTermsAction(null, fd({ entityId: "e1", acquisitionId: "a1", arrangement: "supplier_credit", balanceDueOn: "2026-12-31" }))).toEqual({ ok: true });
    expect(await voidPaymentAction(null, fd({ entityId: "e1", paymentId: "p1", reason: "entered against the wrong purchase" }))).toEqual({ ok: true });
    expect(h.payment).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "u1", entityId: "e1", acquisitionId: "a1" }));
    expect(new Set(h.revalidate.mock.calls.map((c) => c[0]))).toEqual(new Set(["/admin/organization/legal-entities/e1/equipment"]));
  });
  it("a payment without the 'reported, not bank-reconciled' confirmation is refused", async () => {
    expect(await recordPaymentAction(null, fd({ ...payForm, confirmUnverified: "" }))).toMatchObject({ ok: false });
    expect(h.payment).not.toHaveBeenCalled();
  });
});

