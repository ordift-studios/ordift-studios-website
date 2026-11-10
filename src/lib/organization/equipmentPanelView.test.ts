import { describe, expect, it } from "vitest";
import { buildEquipmentViews, fundingLabel, type DocRef, type RawAcquisition, type RawInstalment, type RawObligation } from "./equipmentPanelView";

// SYNTHETIC rows only (public repository): the shape of one financed purchase, not any real invoice.
const docs: DocRef[] = [
  { id: "d-inv", filename: "invoice.jpg", sha256: "a".repeat(64), documentType: "purchase_receipt" },
  { id: "d-conf", filename: "provider-confirmation.pdf", sha256: "b".repeat(64), documentType: "other_financial_document" },
  { id: "d-stmt", filename: "statement.pdf", sha256: "c".repeat(64), documentType: "other_financial_document" },
];
const acq = (over: Partial<RawAcquisition> = {}): RawAcquisition => ({ id: "a1", supplier_name: "Synthetic Supplier", supplier_branch: "Branch", invoice_number: "INV-1", purchase_date: "2026-11-08", item_description: "Synthetic pen display", quantity: 1, currency: "QAR",
  list_price_total: "1499.00", discount_total: "350.00", net_amount: "1149.00", customer_as_shown: "An Individual", invoice_document_id: "d-inv", funding_source_status: "to_confirm", funding_source_note: null,
  accounting_classification: "pending_professional_review", bank_evidence_document_id: null, created_at: "2026-11-10", ...over });
const ob: RawObligation = { id: "o1", acquisition_id: "a1", provider: "SyntheticPay", provider_reference: "SP-1", instalment_count: 4, financed_amount: "1149.00", plan_started_on: "2026-11-08", confirmation_document_id: "d-conf", schedule_basis: "founder_expected_months", status: "active" };
const ins = (n: number, over: Partial<RawInstalment> = {}): RawInstalment => ({ id: `i${n}`, obligation_id: "o1", sequence: n, amount: "287.25", expected_month: `2026-1${n}-01`.replace("2026-13", "2027-01").replace("2026-14", "2027-02"), status: "pending", paid_on: null, evidence_document_id: null, bank_evidence_document_id: null, evidence_note: null, ...over });
const rows = (first: Partial<RawInstalment> = {}) => [ins(1, { status: "paid", paid_on: "2026-11-08", evidence_document_id: "d-conf", ...first }), ins(2), ins(3), ins(4)];
const build = (instalments = rows(), a = acq()) => buildEquipmentViews({ acquisitions: [a], obligations: [ob], instalments, docs, entityLegalName: "SYNTHETIC ENTITY W.L.L." })[0];

describe("equipment panel view", () => {
  it("keeps cost, liability, payments and expense in separate fields", () => {
    const v = build();
    expect(v.net).toBe(1149); expect(v.position.financed).toBe(1149);
    expect([v.position.paidTotal, v.position.paidAwaitingStatement, v.position.paidVerifiedByStatement, v.position.outstandingLiability, v.position.expenseRecognised]).toEqual([287.25, 287.25, 0, 861.75, 0]);
  });
  it("a payment with only provider evidence is awaiting statement, never verified", () => {
    const v = build();
    expect(v.financing!.instalments.map((i) => i.state)).toEqual(["paid_awaiting_statement", "pending", "pending", "pending"]);
    expect(v.financing!.instalments[0].evidenceDoc?.id).toBe("d-conf");
    expect(v.position.flags).toContain("paid_instalments_awaiting_statement");
  });
  it("only a linked statement document makes an instalment verified", () => {
    const v = build(rows({ bank_evidence_document_id: "d-stmt" }));
    expect(v.financing!.instalments[0].state).toBe("paid_verified_by_statement");
    expect(v.financing!.instalments[0].statementDoc?.id).toBe("d-stmt");
    expect(v.position.paidVerifiedByStatement).toBe(287.25);
  });
  it("a written note alone counts as evidence but still not as verified", () => {
    const v = build(rows({ evidence_document_id: null, evidence_note: "Provider screen showed down payment paid" }));
    expect(v.financing!.instalments[0].state).toBe("paid_awaiting_statement");
    expect(v.position.flags).not.toContain("paid_without_any_evidence");
  });
  it("shows the classification as pending and the customer mismatch, and links the documents", () => {
    const v = build();
    expect(v.classificationLabel).toMatch(/Pending professional review/);
    expect(v.customerMatch).toBe("differs_from_entity");
    expect([v.invoiceDoc?.id, v.financing?.confirmationDoc?.id]).toEqual(["d-inv", "d-conf"]);
  });
  it("an acquisition without financing has no financing section and no liability", () => {
    const v = buildEquipmentViews({ acquisitions: [acq()], obligations: [], instalments: [], docs, entityLegalName: "X" })[0];
    expect(v.financing).toBeNull(); expect(v.position.outstandingLiability).toBe(0);
  });
});

describe("funding label", () => {
  it("says 'stated by the Founder; statement verification pending' until a statement document is linked", () => {
    expect(build(rows(), acq({ funding_source_status: "company_account", funding_source_note: "Founder statement: company card" })).fundingLabel).toMatch(/stated by the Founder; statement verification pending/);
    expect(build(rows(), acq({ funding_source_status: "company_account", bank_evidence_document_id: "d-stmt" })).fundingLabel).toMatch(/verified against a statement/);
    expect(fundingLabel("to_confirm", false)).toMatch(/not verified/);
  });
});

