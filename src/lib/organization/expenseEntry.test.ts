import { describe, expect, it } from "vitest";
import { EXPENSE_EVIDENCE_TYPES, isExpenseEvidenceType, parseReceiptLines, validateFunding } from "./expenseEntry";
import { ENTITY_DOCUMENT_TYPES } from "./entityRegistry";

describe("parseReceiptLines: every printed line is read exactly or refused, never guessed", () => {
  it("reads the QAR 500 permit receipt, keeping the zero-fee card-printing line (reconciliation drops it later)", () => {
    const r = parseReceiptLines("PERMIT_ISSUANCE | Ordift Studios Commercial Permit issuance fee (Commercial License 345520) | 500\nESTABLISHMENT_CARD_PRINT | Establishment card printing | 0");
    expect(r).toEqual({ ok: true, lines: [
      { code: "PERMIT_ISSUANCE", description: "Ordift Studios Commercial Permit issuance fee (Commercial License 345520)", amount: 500 },
      { code: "ESTABLISHMENT_CARD_PRINT", description: "Establishment card printing", amount: 0 },
    ] });
  });
  it("accepts thousands separators and two decimals; upper-cases the code", () => {
    expect(parseReceiptLines("fee | A fee | 1,200.50")).toEqual({ ok: true, lines: [{ code: "FEE", description: "A fee", amount: 1200.5 }] });
  });
  it.each([
    ["", /at least one receipt line/],
    ["only one part", /Cannot read the line/],
    ["A | B", /Cannot read the line/],
    ["A | B | C | 5", /Cannot read the line/],
    [" | desc | 5", /Cannot read the line/],
    ["A | desc | QAR 500", /not a valid number/],
    ["A | desc | 5.555", /not a valid number/],
    ["A | desc | -5", /not a valid number/],
    ["A | one | 5\nA | two | 6", /appears twice/],
  ])("refuses %j", (text, msg) => {
    const r = parseReceiptLines(text);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(msg);
  });
});

describe("validateFunding: who paid, what they expect and the basis must agree", () => {
  const ok = (funding: string, reimbursement: string, note: string | null = "Founder's own statement") => validateFunding({ funding, reimbursement, fundingNote: note });
  it("accepts the Founder-funded, non-reimbursable contribution when a basis is stated", () => expect(ok("founder_personal", "not_reimbursable")).toBeNull());
  it("accepts reimbursement expected (an intention) for a person who paid", () => expect(ok("founder_personal", "reimbursement_expected")).toBeNull());
  it("accepts the default: funding and reimbursement both still to confirm, with no note", () => expect(ok("to_confirm", "to_be_confirmed", null)).toBeNull());
  it("accepts a company-account payment with nothing to reimburse", () => { expect(ok("company_account", "not_applicable", "bank statement line 4")).toBeNull(); expect(ok("company_account", "to_be_confirmed", "bank statement line 4")).toBeNull(); });
  it("requires a stated basis once funding is confirmed", () => expect(ok("founder_personal", "not_reimbursable", "  ")).toMatch(/how the funding source is known/));
  it("refuses an intention before funding is confirmed", () => expect(ok("to_confirm", "not_reimbursable", null)).toMatch(/Confirm who funded/));
  it("refuses 'not applicable' for a person-paid cost and any repayment intention for a company-paid one", () => {
    expect(ok("founder_personal", "not_applicable")).toMatch(/only for a cost the company account paid/);
    expect(ok("company_account", "not_reimbursable", "bank statement line 4")).toMatch(/nothing to reimburse/);
    expect(ok("company_account", "reimbursement_expected", "bank statement line 4")).toMatch(/nothing to reimburse/);
  });
  it("refuses unknown values", () => { expect(ok("bank", "to_be_confirmed")).toMatch(/Choose who funded/); expect(ok("founder_personal", "loan")).toMatch(/Choose the reimbursement/); });
});

describe("which vault documents may back a cost", () => {
  it("exactly the four financial classes; every one is a real vault class", () => {
    expect([...EXPENSE_EVIDENCE_TYPES]).toEqual(["government_receipt", "supplier_invoice", "purchase_receipt", "other_financial_document"]);
    for (const t of EXPENSE_EVIDENCE_TYPES) expect(ENTITY_DOCUMENT_TYPES.map((d) => d.value)).toContain(t);
  });
  it.each(["commercial_registration", "articles_of_association", "establishment_card", "tax_card", "trade_name_reservation", "investment_application", "commercial_permit", "premises_document", "other", "", "free text"])("%j is not financial evidence", (t) => expect(isExpenseEvidenceType(t)).toBe(false));
  it("the new classes are offered in the vault upload list with plain names", () => {
    const labels = Object.fromEntries(ENTITY_DOCUMENT_TYPES.map((d) => [d.value, d.label]));
    expect(labels.supplier_invoice).toMatch(/Supplier \/ vendor invoice/); expect(labels.purchase_receipt).toBe("Purchase receipt"); expect(labels.other_financial_document).toBe("Other financial supporting document");
  });
});
