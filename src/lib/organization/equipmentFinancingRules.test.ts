import { describe, expect, it } from "vitest";
import { addMonths, buildInstalmentSchedule, outstandingBalance, paidTotal, validateAcquisition, type AcquisitionInput, type FinancingInput } from "./equipmentFinancingRules";

const E = "11111111-1111-4111-8111-111111111101", D1 = "22222222-2222-4222-8222-222222222201", D2 = "22222222-2222-4222-8222-222222222202";
const acq = (o: Partial<AcquisitionInput> = {}): AcquisitionInput => ({ entityId: E, supplier: "Synthetic Supplier", branch: "Synthetic Branch", invoiceNumber: "INV-1001", purchaseDate: "2026-11-08", itemDescription: "Synthetic pen display", itemCode: "ITEM-1",
  quantity: 1, currency: "QAR", listPrice: 1499, discount: 350, net: 1149, customerAsShown: "as printed", invoiceDocumentId: D1, fundingStatus: "to_confirm", ...o });
const fin = (o: Partial<FinancingInput> = {}): FinancingInput => ({ provider: "SyntheticPay", reference: "PL-REF-1001", merchant: "Synthetic Supplier", count: 4, plannedOn: "2026-11-08", firstMonth: "2026-11-01", confirmationDocumentId: D2, scheduleBasis: "founder_expected_months",
  firstPaid: { paidOn: "2026-11-08", evidenceNote: "Provider confirmation: down payment paid" }, ...o });
const TODAY = "2026-11-09";

describe("instalment schedule", () => {
  it("splits 1,149.00 into four exact instalments of 287.25 in the four expected months", () => {
    const s = buildInstalmentSchedule(1149, 4, "2026-11-01");
    expect(s.map((i) => i.amount)).toEqual([287.25, 287.25, 287.25, 287.25]);
    expect(s.map((i) => i.expectedMonth)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });
  it("always adds up exactly; odd cents go to the first instalment", () => {
    const s = buildInstalmentSchedule(100, 3, "2026-11-01");
    expect(s.map((i) => i.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(Math.round(s.reduce((t, i) => t + i.amount * 100, 0))).toBe(10000);
  });
  it("months roll over the year", () => { expect(addMonths("2026-11-01", 3)).toBe("2027-02-01"); expect(addMonths("2026-12-01", 1)).toBe("2027-01-01"); });
});

describe("recording one acquisition with a separately tracked financing obligation", () => {
  it("accepts the real shape: one acquisition, one financing obligation, four instalments, only the first marked paid", () => {
    const v = validateAcquisition(acq(), fin(), TODAY);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload.financing?.instalments).toHaveLength(4);
    expect(v.payload.firstInstalmentPaid).toEqual({ sequence: 1, paidOn: "2026-11-08", evidenceNote: "Provider confirmation: down payment paid" });
    expect(v.payload.acquisition.fundingStatus).toBe("to_confirm");       // who paid is not assumed
  });
  it("the net price must equal the list price minus the discount", () => {
    expect(validateAcquisition(acq({ net: 1150 }), fin(), TODAY)).toMatchObject({ ok: false });
    expect(validateAcquisition(acq({ discount: 349 }), fin(), TODAY)).toMatchObject({ ok: false });
  });
  it("no payment can be marked paid without evidence, and never in the future", () => {
    expect(validateAcquisition(acq(), fin({ firstPaid: { paidOn: "2026-11-08", evidenceNote: "ok" } }), TODAY)).toMatchObject({ ok: false });
    expect(validateAcquisition(acq(), fin({ firstPaid: { paidOn: "2026-12-01", evidenceNote: "Provider confirmation: down payment paid" } }), TODAY)).toMatchObject({ ok: false });
  });
  it("with no firstPaid, every instalment stays pending", () => {
    const v = validateAcquisition(acq(), fin({ firstPaid: null }), TODAY);
    expect(v.ok && v.payload.firstInstalmentPaid).toBeNull();
  });
  it("the invoice and the financing confirmation must be two different documents", () => { expect(validateAcquisition(acq(), fin({ confirmationDocumentId: D1 }), TODAY)).toMatchObject({ ok: false }); });
  it("a confirmed funding source needs a stated basis; an unconfirmed one needs nothing", () => {
    expect(validateAcquisition(acq({ fundingStatus: "company_account" }), fin(), TODAY)).toMatchObject({ ok: false });
    expect(validateAcquisition(acq({ fundingStatus: "company_account", fundingNote: "The Founder's statement; bank evidence pending" }), fin(), TODAY).ok).toBe(true);
  });
  it("the purchase date cannot be in the future; instalment counts are bounded; months start on the 1st", () => {
    expect(validateAcquisition(acq({ purchaseDate: "2026-12-01" }), fin(), TODAY)).toMatchObject({ ok: false });
    expect(validateAcquisition(acq(), fin({ count: 1 }), TODAY)).toMatchObject({ ok: false });
    expect(validateAcquisition(acq(), fin({ firstMonth: "2026-11-15" }), TODAY)).toMatchObject({ ok: false });
  });
  it("an acquisition can be recorded without any financing", () => { const v = validateAcquisition(acq(), null, TODAY); expect(v.ok && v.payload.financing).toBeNull(); });
  it("never carries a classification: the accounting decision is not made here", () => {
    const v = validateAcquisition(acq(), fin(), TODAY);
    expect(v.ok && "classification" in v.payload.acquisition).toBe(false);
  });
});

describe("balances", () => {
  const rows = [{ status: "paid", amount: 287.25 }, { status: "pending", amount: 287.25 }, { status: "pending", amount: 287.25 }, { status: "pending", amount: 287.25 }];
  it("only pending instalments are outstanding", () => { expect(outstandingBalance(rows)).toBe(861.75); expect(paidTotal(rows)).toBe(287.25); });
});
