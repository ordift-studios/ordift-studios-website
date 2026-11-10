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

import { parsePaymentForm, parseTermsForm, parseVoidPaymentForm } from "./equipmentForms";
describe("arrangement-aware acquisition form", () => {
  it("defaults to 'to be confirmed': no terms, no payment, no financing — nothing assumed", () => {
    expect(parseAcquisitionForm(form(base))).toMatchObject({ ok: true, arrangement: "to_confirm", terms: null, payment: null, financing: null });
  });
  it("an outright purchase needs no financing agreement and carries its payment (method, date, evidence)", () => {
    const r = parseAcquisitionForm(form({ ...base, arrangement: "paid_in_full", paymentAmount: "1149", paymentPaidOn: "2026-11-08", paymentMethod: "company_credit_card", paymentEvidenceNote: "card alert seen on the company mailbox", paymentConfirmUnverified: "yes" }));
    expect(r).toMatchObject({ ok: true, financing: null, terms: { arrangement: "paid_in_full" }, payment: { kind: "full", amount: 1149, method: "company_credit_card" } });
  });
  it("deposit-and-balance defaults the first payment to a deposit; supplier credit to a part payment and keeps the due date", () => {
    expect(parseAcquisitionForm(form({ ...base, arrangement: "deposit_and_balance", paymentAmount: "500", paymentConfirmUnverified: "yes" }))).toMatchObject({ ok: true, payment: { kind: "deposit" } });
    expect(parseAcquisitionForm(form({ ...base, arrangement: "supplier_credit", balanceDueOn: "2026-12-31", supplierTerms: "Net 30" }))).toMatchObject({ ok: true, terms: { balanceDueOn: "2026-12-31", supplierTerms: "Net 30" }, payment: null });
  });
  it("a payment needs the 'reported, not bank-reconciled' confirmation, and 'not yet paid' refuses a payment", () => {
    expect(parseAcquisitionForm(form({ ...base, arrangement: "paid_in_full", paymentAmount: "1149" }))).toMatchObject({ ok: false });
    expect(parseAcquisitionForm(form({ ...base, arrangement: "unpaid", paymentAmount: "10", paymentConfirmUnverified: "yes" }))).toMatchObject({ ok: false });
    expect(parseAcquisitionForm(form({ ...base, arrangement: "bogus" }))).toMatchObject({ ok: false });
  });
  it("'financed' still parses the financing block exactly as before (the PayLater workflow is unchanged) and takes no direct payment", () => {
    const fin = { arrangement: "financed", provider: "SyntheticPay", providerReference: "SP-1", instalmentCount: "4", plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: "d2", paymentAmount: "5", paymentConfirmUnverified: "yes" };
    expect(parseAcquisitionForm(form({ ...base, ...fin }))).toMatchObject({ ok: true, arrangement: "financed", terms: null, payment: null, financing: { count: 4, provider: "SyntheticPay" } });
  });
});
describe("payment, terms and void forms", () => {
  it("parsePaymentForm keeps method separate from kind and requires the not-reconciled confirmation", () => {
    const f = { entityId: "e1", acquisitionId: "a1", kind: "balance", amount: "2,000.00", paidOn: "2026-11-09", method: "cheque", reference: "CHQ-77", evidenceNote: "cheque stub photographed", confirmUnverified: "yes" };
    expect(parsePaymentForm(form(f))).toMatchObject({ ok: true, acquisitionId: "a1", payment: { kind: "balance", amount: 2000, method: "cheque", reference: "CHQ-77" } });
    expect(parsePaymentForm(form({ ...f, confirmUnverified: "" }))).toMatchObject({ ok: false });
    expect(parsePaymentForm(form({ ...f, amount: "x" }))).toMatchObject({ ok: false });
  });
  it("parseTermsForm and parseVoidPaymentForm", () => {
    expect(parseTermsForm(form({ entityId: "e1", acquisitionId: "a1", arrangement: "supplier_credit", balanceDueOn: "2026-12-31" }))).toMatchObject({ ok: true, terms: { arrangement: "supplier_credit" } });
    expect(parseVoidPaymentForm(form({ entityId: "e1", paymentId: "p1", reason: "short" }))).toMatchObject({ ok: false });
    expect(parseVoidPaymentForm(form({ entityId: "e1", paymentId: "p1", reason: "entered against the wrong purchase" }))).toMatchObject({ ok: true });
  });
});
