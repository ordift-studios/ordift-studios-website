// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("../actions", () => ({ viewEntityDocumentAction: vi.fn() }));
vi.mock("./actions", () => ({ markInstalmentPaidAction: vi.fn(), recordEquipmentAction: vi.fn() }));
import { EquipmentPanel } from "./EquipmentPanel";
import { buildEquipmentViews, type DocRef } from "@/lib/organization/equipmentPanelView";

// SYNTHETIC data only (public repository).
const docs: DocRef[] = [{ id: "d-inv", filename: "invoice.jpg", sha256: "a".repeat(64), documentType: "purchase_receipt" }, { id: "d-conf", filename: "provider-confirmation.pdf", sha256: "b".repeat(64), documentType: "other_financial_document" }];
const views = buildEquipmentViews({
  entityLegalName: "SYNTHETIC ENTITY W.L.L.", docs,
  acquisitions: [{ id: "a1", supplier_name: "Synthetic Supplier", supplier_branch: "Branch", invoice_number: "INV-1", purchase_date: "2026-11-08", item_description: "Synthetic pen display", quantity: 1, currency: "QAR", list_price_total: 1499, discount_total: 350, net_amount: 1149,
    customer_as_shown: "An Individual", invoice_document_id: "d-inv", funding_source_status: "to_confirm", funding_source_note: null, accounting_classification: "pending_professional_review", bank_evidence_document_id: null, created_at: "2026-11-10" }],
  obligations: [{ id: "o1", acquisition_id: "a1", provider: "SyntheticPay", provider_reference: "SP-1", instalment_count: 4, financed_amount: 1149, plan_started_on: "2026-11-08", confirmation_document_id: "d-conf", schedule_basis: "founder_expected_months", status: "active" }],
  instalments: [1, 2, 3, 4].map((n) => ({ id: `i${n}`, obligation_id: "o1", sequence: n, amount: 287.25, expected_month: ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"][n - 1], status: n === 1 ? "paid" as const : "pending" as const, paid_on: n === 1 ? "2026-11-08" : null,
    evidence_document_id: n === 1 ? "d-conf" : null, bank_evidence_document_id: null, evidence_note: null })),
});
const html = renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views, invoiceDocs: [docs[0]], financialDocs: docs }));

describe("Equipment & Financing panel", () => {
  it("shows the four separate figures: cost, liability, payments and expense", () => {
    expect(html).toMatch(/1 · Acquisition cost/); expect(html).toMatch(/Net QAR 1,149\.00/);
    expect(html).toMatch(/2 · Financing liability/); expect(html).toMatch(/Outstanding QAR 861\.75/);
    expect(html).toMatch(/3 · Actual payments/); expect(html).toMatch(/Awaiting statement QAR 287\.25/); expect(html).toMatch(/Verified by statement QAR 0\.00/);
    expect(html).toMatch(/4 · Accounting expense/); expect(html).toMatch(/Recognised QAR 0\.00/);
  });
  it("labels the paid instalment as reported and NOT bank-verified, and the others pending", () => {
    expect(html).toMatch(/Reported paid — awaiting statement reconciliation \(not bank-verified\)/);
    expect(html).not.toMatch(/Paid — verified against a statement/);
    expect((html.match(/Pending — not paid/g) ?? []).length).toBe(3);
  });
  it("marks unverified details as pending: classification, funding, customer, expected months", () => {
    expect(html).toMatch(/Pending professional review — no accounting treatment decided/);
    expect(html).toMatch(/to be confirmed \(not verified\)/);
    expect(html).toMatch(/differs from this legal entity/);
    expect(html).toMatch(/EXPECTED, not the provider’s published schedule/);
  });
  it("lists the linked private documents with a short hash and a server-mediated view button only", () => {
    expect(html).toMatch(/invoice\.jpg/); expect(html).toMatch(/provider-confirmation\.pdf/); expect(html).toMatch(/SHA-256 aaaaaaaaaaaa…/);
    expect(html).not.toMatch(/https?:\/\//);
  });
  it("offers payment recording only for the next pending instalment, with the not-reconciled confirmation", () => {
    expect((html.match(/Record instalment \d as reported paid/g) ?? []).length).toBe(2);   // summary + form heading, one instalment only
    expect(html).toMatch(/Record instalment 2 as reported paid/); expect(html).not.toMatch(/Record instalment 3 as reported paid/);
    expect(html).toMatch(/It is not bank-reconciled until a statement line is matched/);
  });
  it("has an empty state and still offers the controlled record form", () => {
    const empty = renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: [], invoiceDocs: [], financialDocs: [] }));
    expect(empty).toMatch(/No equipment acquisitions are recorded/); expect(empty).toMatch(/Record an equipment acquisition/);
  });
});
