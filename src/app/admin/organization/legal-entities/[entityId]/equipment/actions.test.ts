// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, superAdmin: false, record: vi.fn(), pay: vi.fn(), revalidate: vi.fn(), terms: vi.fn(), payment: vi.fn(), voidPay: vi.fn(), bundle: vi.fn(), voidAcq: vi.fn() }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isSuperAdmin: () => h.superAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
const a = vi.hoisted(() => ({ link: vi.fn(), own: vi.fn(), voidOwn: vi.fn(), founder: vi.fn(), unlink: vi.fn() }));
vi.mock("@/lib/organization/assetReconciliation", () => ({ linkAcquisitionToAsset: a.link, recordAssetOwnership: a.own, voidAssetOwnership: a.voidOwn, recordFounderAssetOwnership: a.founder, unlinkAcquisitionFromAsset: a.unlink }));
vi.mock("@/lib/organization/equipmentFinancing", () => ({ recordEquipmentAcquisition: h.record, markInstalmentPaid: h.pay, setAcquisitionTerms: h.terms, recordAcquisitionPayment: h.payment, voidAcquisitionPayment: h.voidPay, voidEquipmentAcquisition: h.voidAcq, recordAcquisitionBundle: h.bundle }));
import { linkAssetAction, markInstalmentPaidAction, recordEquipmentAction, recordFounderOwnershipAction, recordOwnershipAction, unlinkAssetAction, recordPaymentAction, setTermsAction, voidAcquisitionAction, voidOwnershipAction, voidPaymentAction } from "./actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const acq = { entityId: "e1", supplier: "Synthetic Supplier", invoiceNumber: "INV-1", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", currency: "QAR", listPrice: "1499", discount: "350", net: "1149", invoiceDocumentId: "d1" };
const pay = { entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "provider app shows it paid", confirmUnverified: "yes" };

beforeEach(() => { h.user = { id: "u1" }; h.superAdmin = true; for (const m of [h.record, h.pay, h.revalidate, h.terms, h.payment, h.voidPay, h.bundle, h.voidAcq]) m.mockReset(); });

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

describe("asset ownership and link actions", () => {
  const link = { entityId: "e1", acquisitionId: "a1", assetId: "asset-1", confirmLink: "yes" };
  beforeEach(() => { for (const m of [a.link, a.own, a.voidOwn]) m.mockReset(); });
  it("refuse a non-Super-Admin before the library is touched", async () => {
    h.superAdmin = false;
    for (const r of [await linkAssetAction(null, fd(link)), await recordOwnershipAction(null, fd({ entityId: "e1", assetId: "x", businessPurpose: "Retouching and design", basisStatement: "Founder statement" })), await voidOwnershipAction(null, fd({ entityId: "e1", ownershipId: "o1", reason: "recorded against the wrong asset" }))]) expect(r).toMatchObject({ ok: false });
    for (const m of [a.link, a.own, a.voidOwn]) expect(m).not.toHaveBeenCalled();
  });
  it("linking needs the explicit 'existing asset, no new asset' confirmation, then calls the audited link as the signed-in actor", async () => {
    expect(await linkAssetAction(null, fd({ ...link, confirmLink: "" }))).toMatchObject({ ok: false });
    expect(a.link).not.toHaveBeenCalled();
    a.link.mockResolvedValue({ ok: true });
    expect(await linkAssetAction(null, fd(link))).toEqual({ ok: true });
    expect(a.link).toHaveBeenCalledWith({ actorUserId: "u1", entityId: "e1", acquisitionId: "a1", assetId: "asset-1" });
    expect(h.revalidate).toHaveBeenCalledWith("/admin/organization/legal-entities/e1/equipment");
  });
  it("records ownership with purchaser, purpose, personal-use flag and basis as separate fields", async () => {
    a.own.mockResolvedValue({ ok: true });
    expect(await recordOwnershipAction(null, fd({ entityId: "e1", assetId: "asset-1", purchaserAsStated: "The Founder", businessPurpose: "Photography retouching and graphic design", incidentalPersonalUse: "yes", personalUseNote: "Occasional personal use", basisStatement: "Founder statement; documents pending" }))).toEqual({ ok: true });
    expect(a.own).toHaveBeenCalledWith({ actorUserId: "u1", ownership: expect.objectContaining({ entityId: "e1", assetId: "asset-1", purchaserAsStated: "The Founder", incidentalPersonalUse: true, personalUseNote: "Occasional personal use" }) });
  });
});

describe("Founder ownership and unlink actions", () => {
  beforeEach(() => { a.founder.mockReset(); a.unlink.mockReset(); });
  it("refuse a non-Super-Admin; unlink needs a reason; the Founder ownership passes separate fields as the signed-in actor", async () => {
    h.superAdmin = false;
    expect(await recordFounderOwnershipAction(null, fd({ entityId: "e1", assetId: "x", businessPurpose: "Photography retouching", basisStatement: "Founder statement; funding stated" }))).toMatchObject({ ok: false });
    expect(await unlinkAssetAction(null, fd({ entityId: "e1", acquisitionId: "a1", reason: "the accountant concluded a different structure" }))).toMatchObject({ ok: false });
    expect(a.founder).not.toHaveBeenCalled(); expect(a.unlink).not.toHaveBeenCalled();
    h.superAdmin = true; a.founder.mockResolvedValue({ ok: true }); a.unlink.mockResolvedValue({ ok: true });
    expect(await recordFounderOwnershipAction(null, fd({ entityId: "e1", assetId: "asset-1", purchaserAsStated: "The Founder", primaryUserAsStated: "The Founder", financingObligorAsStated: "The Founder (personal PayLater account)", businessPurpose: "Photography retouching and related creative production", companyFunded: "yes", basisStatement: "Founder statement: personally owned; company card funds payments" }))).toEqual({ ok: true });
    expect(a.founder).toHaveBeenCalledWith({ actorUserId: "u1", ownership: expect.objectContaining({ entityId: "e1", companyFunded: true, financingObligorAsStated: "The Founder (personal PayLater account)" }) });
    expect(await unlinkAssetAction(null, fd({ entityId: "e1", acquisitionId: "a1", reason: "the accountant concluded a different structure" }))).toEqual({ ok: true });
    expect(a.unlink).toHaveBeenCalledWith({ actorUserId: "u1", entityId: "e1", acquisitionId: "a1", reason: "the accountant concluded a different structure" });
  });
});

describe("void acquisition action (migration 0190)", () => {
  const form = { entityId: "e1", acquisitionId: "a1", reason: "Entered with a wrong value; voided to record a correction", confirmVoid: "yes" };
  it("refuses anonymous and non-Super-Admin users before the library is called", async () => {
    h.user = null; expect(await voidAcquisitionAction(null, fd(form))).toEqual({ ok: false, error: "Not authenticated." });
    h.user = { id: "u1" }; h.superAdmin = false; expect(await voidAcquisitionAction(null, fd(form))).toMatchObject({ ok: false });
    expect(h.voidAcq).not.toHaveBeenCalled();
  });
  it("needs the reason and the confirmation tick; nothing is called otherwise", async () => {
    expect(await voidAcquisitionAction(null, fd({ ...form, reason: "short" }))).toMatchObject({ ok: false });
    expect(await voidAcquisitionAction(null, fd({ entityId: "e1", acquisitionId: "a1", reason: form.reason }))).toMatchObject({ ok: false });
    expect(h.voidAcq).not.toHaveBeenCalled();
  });
  it("voids as the signed-in Super Admin and refreshes only the equipment page; a refusal is passed on", async () => {
    h.voidAcq.mockResolvedValueOnce({ ok: true });
    expect(await voidAcquisitionAction(null, fd(form))).toEqual({ ok: true });
    expect(h.voidAcq).toHaveBeenCalledWith({ actorUserId: "u1", entityId: "e1", acquisitionId: "a1", reason: form.reason });
    expect(h.revalidate).toHaveBeenCalledWith("/admin/organization/legal-entities/e1/equipment");
    h.voidAcq.mockResolvedValueOnce({ ok: false, error: "This acquisition is linked to an asset." });
    expect(await voidAcquisitionAction(null, fd(form))).toEqual({ ok: false, error: "This acquisition is linked to an asset." });
  });
});
