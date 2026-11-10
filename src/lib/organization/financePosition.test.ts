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


describe("payment arrangements (not financed)", () => {
  const plain = (over: Partial<AcquisitionFact> = {}): AcquisitionFact => acq({ financing: null, net: 2000, listPrice: 2000, discount: 0, ...over });
  const p = (amount: number, status: "recorded" | "void" = "recorded", paidOn = "2026-11-02") => ({ amount, paidOn, status });
  it("outright, fully paid: settlement paid, nothing owed, still pending statement verification, expense 0", () => {
    const r = acquisitionPosition(plain({ terms: { arrangement: "paid_in_full", balanceDueOn: null }, payments: [p(2000)] }), "2026-11-10");
    expect([r.arrangement, r.settlement, r.paidTotal, r.supplierBalance, r.paidVerifiedByStatement, r.paidAwaitingStatement, r.expenseRecognised]).toEqual(["paid_in_full", "paid", 2000, 0, 0, 2000, 0]);
    expect(r.flags).toContain("payments_awaiting_statement");
  });
  it("deposit and balance: partly paid, the balance is owed to the supplier; a voided payment counts for nothing", () => {
    const r = acquisitionPosition(plain({ terms: { arrangement: "deposit_and_balance", balanceDueOn: "2026-12-15" }, payments: [p(500), p(300, "void")] }), "2026-11-10");
    expect([r.settlement, r.paidTotal, r.supplierBalance, r.balanceDueOn]).toEqual(["partially_paid", 500, 1500, "2026-12-15"]);
  });
  it("supplier credit: unpaid, owed, and overdue only after the due date", () => {
    const terms = { arrangement: "supplier_credit" as const, balanceDueOn: "2026-12-01" };
    expect(acquisitionPosition(plain({ terms, payments: [] }), "2026-11-10")).toMatchObject({ settlement: "unpaid", supplierBalance: 2000 });
    expect(acquisitionPosition(plain({ terms, payments: [] }), "2026-11-10").flags).not.toContain("supplier_balance_overdue");
    expect(acquisitionPosition(plain({ terms, payments: [] }), "2026-12-02").flags).toContain("supplier_balance_overdue");
    expect(acquisitionPosition(plain({ terms, payments: [p(2000)] }), "2026-12-02").flags).not.toContain("supplier_balance_overdue");
  });
  it("arrangement to be confirmed: nothing is assumed paid and the open item says so", () => {
    const r = acquisitionPosition(plain({ terms: null, payments: [] }), "2026-11-10");
    expect([r.arrangement, r.settlement, r.supplierBalance]).toEqual(["to_confirm", "unpaid", 2000]);
    expect(r.flags).toContain("arrangement_not_confirmed");
  });
  it("'paid in full' with no payment recorded is flagged, not trusted", () => {
    expect(acquisitionPosition(plain({ terms: { arrangement: "paid_in_full", balanceDueOn: null }, payments: [] }), "2026-11-10").flags).toContain("arrangement_says_paid_but_balance_open");
  });
  it("a FINANCED purchase never counts direct payments (no double counting) and keeps its instalment figures", () => {
    const r = acquisitionPosition(acq({ payments: [p(1149)], terms: { arrangement: "paid_in_full", balanceDueOn: null } }), "2026-11-10");
    expect([r.arrangement, r.paidTotal, r.outstandingLiability, r.supplierBalance]).toEqual(["financed", 287.25, 861.75, 0]);
  });
  it("report totals keep supplier balance and financing liability in separate columns per currency", () => {
    const rep = financeReport([acq(), plain({ id: "a2", terms: { arrangement: "supplier_credit", balanceDueOn: "2026-12-01" }, payments: [p(500)] })]);
    expect(rep.totalsByCurrency[0]).toMatchObject({ purchases: 3149, outstandingLiability: 861.75, supplierBalance: 1500, paid: 787.25, expenseRecognised: 0 });
  });
});
