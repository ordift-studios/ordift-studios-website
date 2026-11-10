import { describe, expect, it } from "vitest";
import { parseAcquisitionForm, parseMarkPaidForm } from "./equipmentForms";

const form = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as { get(k: string): unknown };
const base = { entityId: "e1", supplier: "Synthetic Supplier", invoiceNumber: "INV-1", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", currency: "qar", listPrice: "1,499.00", discount: "350", net: "1149", invoiceDocumentId: "d1" };

describe("parseAcquisitionForm", () => {
  it("never defaults funding into a claim and upper-cases the currency", () => {
    const r = parseAcquisitionForm(form(base));
    expect(r).toMatchObject({ ok: true, financing: null, acquisition: { currency: "QAR", fundingStatus: "to_confirm", listPrice: 1499, quantity: 1 } });
  });
  it("refuses non-numeric amounts", () => { expect(parseAcquisitionForm(form({ ...base, net: "abc" }))).toMatchObject({ ok: false }); });
  it("parses the financing block only when the box is ticked", () => {
    const fin = { hasFinancing: "yes", provider: "SyntheticPay", providerReference: "SP-1", instalmentCount: "4", plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: "d2" };
    expect(parseAcquisitionForm(form({ ...base, ...fin }))).toMatchObject({ ok: true, financing: { count: 4, scheduleBasis: "founder_expected_months", firstPaid: null } });
    expect(parseAcquisitionForm(form({ ...base, provider: "SyntheticPay" }))).toMatchObject({ ok: true, financing: null });
  });
  it("a first payment needs BOTH a date and what the evidence shows", () => {
    const fin = { hasFinancing: "yes", provider: "P", providerReference: "SP-1", instalmentCount: "4", plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: "d2" };
    expect(parseAcquisitionForm(form({ ...base, ...fin, firstPaidOn: "2026-11-08" }))).toMatchObject({ ok: false });
    expect(parseAcquisitionForm(form({ ...base, ...fin, firstPaidEvidenceNote: "x shows paid" }))).toMatchObject({ ok: false });
    expect(parseAcquisitionForm(form({ ...base, ...fin, firstPaidOn: "2026-11-08", firstPaidEvidenceNote: "Provider receipt: down payment paid" }))).toMatchObject({ ok: true, financing: { firstPaid: { paidOn: "2026-11-08" } } });
  });
});

describe("parseMarkPaidForm", () => {
  it("requires the explicit 'reported, not bank-reconciled' confirmation", () => {
    expect(parseMarkPaidForm(form({ entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "seen on provider app" }))).toMatchObject({ ok: false });
    expect(parseMarkPaidForm(form({ entityId: "e1", instalmentId: "i2", paidOn: "2026-12-01", evidenceNote: "seen on provider app", confirmUnverified: "yes" }))).toMatchObject({ ok: true, instalmentId: "i2" });
  });
});
