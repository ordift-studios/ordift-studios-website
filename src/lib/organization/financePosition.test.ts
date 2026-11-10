import { describe, expect, it } from "vitest";
import { acquisitionPosition, customerMatch, financeReport, instalmentState, type AcquisitionFact, type InstalmentFact } from "./financePosition";

// SYNTHETIC fixtures only (the repository is public): the shape of a four-instalment financed purchase, not any real invoice.
const inst = (n: number, over: Partial<InstalmentFact> = {}): InstalmentFact => ({ sequence: n, amount: 287.25, expectedMonth: `2026-${10 + n}-01`.replace("2026-13", "2027-01").replace("2026-14", "2027-02"), status: "pending", providerEvidence: false, statementEvidence: false, ...over });
const acq = (over: Partial<AcquisitionFact> = {}): AcquisitionFact => ({
  id: "a1", currency: "QAR", listPrice: 1499, discount: 350, net: 1149, classification: "pending_professional_review", funding: "to_confirm", customerMatch: "differs_from_entity",
  financing: { provider: "SyntheticPay", reference: "SP-0001", financedAmount: 1149, instalmentCount: 4, scheduleBasis: "founder_expected_months", status: "active",
    instalments: [inst(1, { status: "paid", paidOn: "2026-11-08", providerEvidence: true }), inst(2), inst(3), inst(4)] }, ...over,
});

describe("acquisition position", () => {
  it("keeps purchase, payments and liability apart and recognises NO expense", () => {
    const p = acquisitionPosition(acq());
    expect(p.purchaseNet).toBe(1149);
    expect(p.paidTotal).toBe(287.25);
    expect(p.paidAwaitingStatement).toBe(287.25);
    expect(p.paidVerifiedByStatement).toBe(0);
    expect(p.outstandingLiability).toBe(861.75);
    expect(p.expenseRecognised).toBe(0);
    expect(p.paidTotal + p.outstandingLiability).toBe(1149);          // settlements of ONE obligation, not extra costs
  });
  it("flags what is still undecided instead of deciding it", () => {
    expect(acquisitionPosition(acq()).flags).toEqual(expect.arrayContaining([
      "classification_pending_professional_review", "funding_not_confirmed", "invoice_not_in_entity_name", "schedule_months_are_expected_not_provider", "paid_instalments_awaiting_statement"]));
  });
  it("a statement link moves a paid instalment from awaiting to verified", () => {
    const a = acq(); a.financing!.instalments[0].statementEvidence = true;
    const p = acquisitionPosition(a);
    expect(instalmentState(a.financing!.instalments[0])).toBe("paid_verified_by_statement");
    expect([p.paidVerifiedByStatement, p.paidAwaitingStatement]).toEqual([287.25, 0]);
    expect(p.flags).not.toContain("paid_instalments_awaiting_statement");
  });
  it("detects a paid instalment with no evidence at all, and broken totals", () => {
    const a = acq(); a.financing!.instalments[0].providerEvidence = false;
    expect(acquisitionPosition(a).flags).toContain("paid_without_any_evidence");
    const b = acq(); b.financing!.instalments[3].amount = 300;
    expect(acquisitionPosition(b).flags).toContain("instalments_do_not_add_up_to_financed_amount");
    expect(acquisitionPosition(acq({ net: 1000 })).flags).toEqual(expect.arrayContaining(["net_price_arithmetic_mismatch", "financed_amount_differs_from_net_price"]));
  });
  it("voided instalments and voided financing carry no liability", () => {
    const a = acq(); a.financing!.instalments[3].status = "void";
    expect(acquisitionPosition(a).outstandingLiability).toBe(574.5);
    expect(acquisitionPosition(acq({ financing: { ...acq().financing!, status: "void" } })).outstandingLiability).toBe(0);
  });
  it("a purchase with no financing is not a liability", () => {
    const p = acquisitionPosition(acq({ financing: null }));
    expect([p.financed, p.paidTotal, p.outstandingLiability]).toEqual([0, 0, 0]);
  });
});

describe("finance report", () => {
  it("never mixes currencies and never adds the purchase to its instalments", () => {
    const r = financeReport([acq(), acq({ id: "a2", currency: "GHS" })]);
    expect(r.totalsByCurrency.map((t) => t.currency).sort()).toEqual(["GHS", "QAR"]);
    const qar = r.totalsByCurrency.find((t) => t.currency === "QAR")!;
    expect([qar.purchases, qar.paid, qar.outstandingLiability, qar.expenseRecognised]).toEqual([1149, 287.25, 861.75, 0]);
  });
  it("sums two acquisitions of one currency exactly", () => {
    const r = financeReport([acq(), acq({ id: "a2" })]);
    expect(r.totalsByCurrency[0]).toMatchObject({ purchases: 2298, paid: 574.5, outstandingLiability: 1723.5 });
    expect(r.openItems.some((o) => o.acquisitionId === "a2")).toBe(true);
  });
});

describe("customer on the invoice", () => {
  it("matches the entity, differs, or is not shown (never guessed)", () => {
    expect(customerMatch("ORDIFT STUDIOS W.L.L.", "Ordift Studios W.L.L.")).toBe("matches_entity");
    expect(customerMatch("Jane Example", "ORDIFT STUDIOS W.L.L.")).toBe("differs_from_entity");
    expect(customerMatch("  ", "ORDIFT STUDIOS W.L.L.")).toBe("not_shown");
    expect(customerMatch(null, "ORDIFT STUDIOS W.L.L.")).toBe("not_shown");
  });
});

describe("funding stated by a person vs verified by a statement", () => {
  it("a stated company-card funding source is not 'not confirmed', but stays awaiting statement verification", () => {
    const f = acquisitionPosition(acq({ funding: "company_account" })).flags;
    expect(f).not.toContain("funding_not_confirmed");
    expect(f).toContain("funding_awaiting_statement_verification");
  });
  it("only a linked statement clears it", () => {
    const f = acquisitionPosition(acq({ funding: "company_account", fundingStatementVerified: true })).flags;
    expect(f).not.toContain("funding_awaiting_statement_verification");
    expect(f).not.toContain("funding_not_confirmed");
  });
  it("an unconfirmed funding source raises only 'not confirmed'", () => {
    const f = acquisitionPosition(acq({ funding: "to_confirm" })).flags;
    expect(f).toContain("funding_not_confirmed"); expect(f).not.toContain("funding_awaiting_statement_verification");
  });
});

