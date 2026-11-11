// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("../actions", () => ({ viewEntityDocumentAction: vi.fn() }));
vi.mock("./actions", () => ({ markInstalmentPaidAction: vi.fn(), recordEquipmentAction: vi.fn(), recordPaymentAction: vi.fn(), setTermsAction: vi.fn(), voidPaymentAction: vi.fn(), voidAcquisitionAction: vi.fn(), linkAssetAction: vi.fn(), recordOwnershipAction: vi.fn(), voidOwnershipAction: vi.fn(), recordFounderOwnershipAction: vi.fn(), unlinkAssetAction: vi.fn() }));
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

// ---- every arrangement, rendered (synthetic data only)
const A = (id: string, over: Record<string, unknown> = {}) => ({ id, supplier_name: "Synthetic Supplier", supplier_branch: null, invoice_number: `INV-${id}`, purchase_date: "2026-11-01", item_description: `Synthetic item ${id}`, quantity: 1, currency: "QAR", list_price_total: 2000, discount_total: 0, net_amount: 2000,
  customer_as_shown: "SYNTHETIC ENTITY", invoice_document_id: "d-inv", funding_source_status: "to_confirm", funding_source_note: null, accounting_classification: "pending_professional_review", bank_evidence_document_id: null, created_at: "2026-11-10", ...over });
const T = (acq: string, arrangement: string, due: string | null = null, supplier_terms: string | null = null) => ({ id: `t-${acq}`, acquisition_id: acq, arrangement, balance_due_on: due, supplier_terms, note: null, status: "current" as const, created_at: "2026-11-10" });
const PAY = (id: string, acq: string, amount: number, over: Record<string, unknown> = {}) => ({ id, acquisition_id: acq, kind: "part", amount, currency: "QAR", paid_on: "2026-11-02", method: "cash", method_note: null, reference: null, evidence_document_id: null, evidence_note: "cash receipt seen and kept", status: "recorded", void_reason: null, created_at: "2026-11-10", ...over });
const many = buildEquipmentViews({
  entityLegalName: "SYNTHETIC ENTITY", docs, today: "2026-12-20",
  acquisitions: [A("out"), A("dep"), A("cr"), A("unp"), A("tbc"), A("fin", { net_amount: 1149, list_price_total: 1149 })] as never,
  obligations: [{ id: "o1", acquisition_id: "fin", provider: "SyntheticPay", provider_reference: "SP-1", instalment_count: 2, financed_amount: 1149, plan_started_on: "2026-11-08", confirmation_document_id: "d-conf", schedule_basis: "provider_schedule", status: "active" }],
  instalments: [{ id: "i1", obligation_id: "o1", sequence: 1, amount: 574.5, expected_month: "2026-11-01", status: "paid", paid_on: "2026-11-08", evidence_document_id: "d-conf", bank_evidence_document_id: null, evidence_note: null }, { id: "i2", obligation_id: "o1", sequence: 2, amount: 574.5, expected_month: "2026-12-01", status: "pending", paid_on: null, evidence_document_id: null, bank_evidence_document_id: null, evidence_note: null }],
  terms: [T("out", "paid_in_full"), T("dep", "deposit_and_balance", "2026-12-15"), T("cr", "supplier_credit", "2026-12-01", "Net 30"), T("unp", "unpaid")] as never,
  payments: [PAY("p1", "out", 2000, { kind: "full", method: "company_credit_card", evidence_note: null, evidence_document_id: "d-conf" }), PAY("p2", "dep", 500, { kind: "deposit", method: "bank_transfer", reference: "TRF-9" }), PAY("p3", "dep", 99, { status: "void", void_reason: "entered against the wrong purchase" })] as never,
});
const manyHtml = renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: many, invoiceDocs: [docs[0]], financialDocs: docs }));
const cardOf = (name: string) => { const i = manyHtml.indexOf(`Synthetic item ${name}`); const j = manyHtml.indexOf("<article", i); return manyHtml.slice(i, j === -1 ? undefined : j); };

describe("every payment arrangement renders with the four figures kept apart", () => {
  it("outright / paid in full: Paid, pending statement verification, payment method and document shown, no financing needed, expense 0.00", () => {
    const c = cardOf("out");
    expect(c).toMatch(/Paid in full \(outright purchase\)/); expect(c).toMatch(/>Paid</); expect(c).toMatch(/Pending statement verification/);
    expect(c).toMatch(/Company credit card/); expect(c).toMatch(/provider-confirmation\.pdf/); expect(c).toMatch(/Reported — awaiting statement reconciliation \(not bank-verified\)/);
    expect(c).not.toMatch(/Financing liability/); expect(c).toMatch(/Recognised QAR 0\.00/); expect(c).not.toMatch(/No financing agreement/);
  });
  it("deposit and balance: Partly paid, balance owed with its due date, the voided payment shown as voided and not counted", () => {
    const c = cardOf("dep");
    expect(c).toMatch(/Partly paid/); expect(c).toMatch(/Owed to the supplier/); expect(c).toMatch(/QAR 1,500\.00/); expect(c).toMatch(/Due 2026-12-15/); expect(c).toMatch(/Ref TRF-9/);
    expect(c).toMatch(/Voided — entered against the wrong purchase/); expect(c).toMatch(/Reported paid QAR 500\.00/);
  });
  it("supplier credit: Unpaid, owed in full, the supplier's terms, and the overdue open item after the due date", () => {
    const c = cardOf("cr");
    expect(c).toMatch(/Supplier credit \(pay by a due date\)/); expect(c).toMatch(/>Unpaid</); expect(c).toMatch(/QAR 2,000\.00/); expect(c).toMatch(/Net 30/); expect(c).toMatch(/past its due date/);
  });
  it("unpaid: no payment can be recorded until the arrangement changes", () => {
    const c = cardOf("unp");
    expect(c).toMatch(/Not yet paid/); expect(c).toMatch(/change it before recording a payment/); expect(c).not.toMatch(/>Record a payment</);
  });
  it("awaiting confirmation: nothing is assumed paid and the open item says so", () => {
    const c = cardOf("tbc");
    expect(c).toMatch(/Arrangement to be confirmed/); expect(c).toMatch(/Balance not yet evidenced as paid/); expect(c).toMatch(/nothing is assumed to be paid/); expect(c).toMatch(/No payment is recorded for this purchase/);
  });
  it("financed purchases keep the instalment workflow and offer NO direct payment form", () => {
    const c = cardOf("fin");
    expect(c).toMatch(/Financed in instalments/); expect(c).toMatch(/Financing liability/); expect(c).toMatch(/Record instalment 2 as reported paid/); expect(c).not.toMatch(/>Record a payment</);
  });
  it("nothing anywhere claims bank verification, and the record form asks 'How is it paid?' with every arrangement", () => {
    expect(manyHtml).not.toMatch(/Paid — verified against a statement/); expect(manyHtml).not.toMatch(/Verified by statement QAR [1-9]/);
    for (const label of ["Paid in full (outright purchase)", "Deposit now, balance later", "Supplier credit (pay by a due date)", "Not yet paid", "Financed in instalments", "To be confirmed"]) expect(manyHtml).toContain(label);
  });
  it("is usable on small screens: tables scroll inside their own box and the figure grid collapses to one column", () => {
    expect(manyHtml).toMatch(/overflow-x-auto/); expect(manyHtml).toMatch(/grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
  });
});

describe("registered assets and legal owner", () => {
  const assets = [
    { id: "as-1", identifier: "SER-1", description: "Synthetic pen display", category: "Graphics Pad", status: "in_stock", ownership: { id: "o1", entityId: "e1", purchaser: "The Founder, as printed", purpose: "Photography retouching and graphic design", incidentalPersonalUse: true, personalUseNote: "Occasional personal use by the Founder", basis: "Founder statement; documents pending", reviewStatus: "pending_professional_review" }, linkedAcquisitionId: null },
    { id: "as-2", identifier: "SER-2", description: "Synthetic second item", category: null, status: "in_stock", ownership: null, linkedAcquisitionId: null },
    { id: "as-3", identifier: "SER-3", description: "Synthetic Ghana item", category: null, status: "in_stock", ownership: { id: "o3", entityId: "other", purchaser: null, purpose: "Other entity purpose here", incidentalPersonalUse: false, personalUseNote: null, basis: "Other entity basis here", reviewStatus: "pending_professional_review" }, linkedAcquisitionId: null },
  ];
  const html2 = renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: many.slice(0, 1), invoiceDocs: [docs[0]], financialDocs: docs, assets: assets as never }));
  it("shows each registered asset, keeps purchaser / owner / purpose / personal use as separate lines, and flags personal use for the accountant", () => {
    expect(html2).toMatch(/Registered assets and legal owner/); expect(html2).toMatch(/Owner: this legal entity — pending professional review/); expect(html2).toMatch(/Purchaser as stated: The Founder, as printed/);
    expect(html2).toMatch(/Business purpose: Photography retouching/); expect(html2).toMatch(/Incidental personal use flagged for accountant review/);
  });
  it("an asset owned by ANOTHER legal entity shows no details and no actions here; an asset with no owner offers 'Record the legal owner'", () => {
    expect(html2).toMatch(/Owner: another legal entity/); expect(html2).not.toMatch(/Other entity purpose here/); expect(html2).toMatch(/Record the legal owner/);
  });
  it("an acquisition can be linked only to an asset this entity owns; the form says no asset is created or edited", () => {
    expect(html2).toMatch(/Link to an existing registered asset/); expect(html2).toMatch(/Synthetic pen display — SER-1/); expect(html2).not.toMatch(/Synthetic Ghana item — SER-3/);
    expect(html2).toMatch(/No new asset is created and the asset record is not edited/);
  });
  it("without 0188 (no assets) the panel renders exactly as before", () => { expect(renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: [], invoiceDocs: [], financialDocs: [] }))).toMatch(/No registered assets are available/); });
});

describe("Founder-personal ownership display (migration 0189)", () => {
  const own = (over: Record<string, unknown>) => ({ id: "o1", entityId: "e1", ownerKind: "founder_personal", companyFunded: true, primaryUser: "The Founder", financingObligor: "The Founder (personal PayLater account)", excludedFromCompanyFixedAssets: true, purchaser: "The Founder, as printed", purpose: "Photography retouching and related creative production", incidentalPersonalUse: false, personalUseNote: null, basis: "Founder statement: personally owned; company card funds payments", reviewStatus: "pending_professional_review", ...over });
  const assets = [{ id: "as-1", identifier: "SER-1", description: "Synthetic pen display", category: null, status: "in_stock", ownership: own({}), linkedAcquisitionId: "dep" }, { id: "as-2", identifier: "SER-2", description: "Synthetic second item", category: null, status: "in_stock", ownership: null, linkedAcquisitionId: null },
    { id: "as-g", identifier: "SER-G", description: "Synthetic Ghana asset", category: null, status: "in_stock", ownership: own({ entityId: "ghana-entity", purpose: "Ghana purpose text here" }), linkedAcquisitionId: null }];
  const linkedView = { ...many[1], linkedAssetId: "as-1" };
  const h3 = renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: [linkedView], invoiceDocs: [docs[0]], financialDocs: docs, assets: assets as never }));
  it("shows personal ownership as DECLARED and pending professional review (never confirmed), with owner, purchaser, user and obligor on separate lines", () => {
    expect(h3).toMatch(/Owner: the Founder \(personal\) — declared, filed under this legal entity — pending professional review \(not legally or accountant-confirmed\)/);
    expect(h3).toMatch(/Purchaser as stated: The Founder, as printed/); expect(h3).toMatch(/Primary user: The Founder/); expect(h3).toMatch(/Financing obligor as stated: The Founder \(personal PayLater account\)/);
  });
  it("flags it as NOT a company asset, excluded from company fixed-asset totals, with the company-funded treatment pending — and creates nothing", () => {
    expect(h3).toMatch(/Not a company asset — excluded from company-owned fixed-asset totals; company-funded personal asset: accounting treatment pending/);
    expect(h3).toMatch(/Company-funded purchase of a Founder-owned asset — NOT a company asset/);
  });
  it("offers the audited unlink only on a linked purchase, with a mandatory reason; an unowned asset offers both owner types; another entity's records show no details", () => {
    expect(h3).toMatch(/Unlink from this asset \(with a written reason\)/); expect(h3).toMatch(/Why is the link being removed\? \(10\+ characters/);
    expect(h3).toMatch(/Record the legal owner \(a legal entity\)/); expect(h3).toMatch(/Record the Founder as declared personal owner/);
    expect(h3).toMatch(/Founder \(personal\) — filed under another legal entity/); expect(h3).not.toMatch(/Ghana purpose text here/);
  });
});

describe("voided acquisitions (migration 0190)", () => {
  const raw = (id: string, status: "recorded" | "void", linked?: string) => ({ id, supplier_name: "Synthetic Supplier", supplier_branch: null, invoice_number: "INV-9", purchase_date: "2026-11-08", item_description: "Synthetic pen display", quantity: 1, currency: "QAR", list_price_total: 1499, discount_total: 350, net_amount: 1149,
    customer_as_shown: "An Individual", invoice_document_id: "d-inv", funding_source_status: "to_confirm" as const, funding_source_note: null, accounting_classification: "pending_professional_review" as const, bank_evidence_document_id: null, created_at: "2026-11-08T10:00:00Z", company_asset_id: linked ?? null,
    status, void_reason: status === "void" ? "Entered with a wrong value; voided to record a correction" : null });
  const ob = (id: string, a: string, status: "active" | "void") => ({ id, acquisition_id: a, provider: "SyntheticPay", provider_reference: "SP-9", instalment_count: 4, financed_amount: 1149, plan_started_on: "2026-11-08", confirmation_document_id: "d-conf", schedule_basis: "founder_expected_months" as const, status });
  const ins = (o: string, status: "pending" | "void") => [1, 2, 3, 4].map((n) => ({ id: `${o}-${n}`, obligation_id: o, sequence: n, amount: 287.25, expected_month: ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"][n - 1], status, paid_on: null, evidence_document_id: null, bank_evidence_document_id: null, evidence_note: null }));
  const render = (v: ReturnType<typeof buildEquipmentViews>) => renderToStaticMarkup(createElement(EquipmentPanel, { entityId: "e1", views: v, invoiceDocs: [docs[0]], financialDocs: docs }));
  const mixed = render(buildEquipmentViews({ entityLegalName: "SYNTHETIC ENTITY W.L.L.", docs, acquisitions: [raw("a-old", "void"), raw("a-new", "recorded")], obligations: [ob("o-old", "a-old", "void"), ob("o-new", "a-new", "active")], instalments: [...ins("o-old", "void"), ...ins("o-new", "pending")] }));
  it("shows the voided acquisition in its own section with the reason, and the live one with the void control", () => {
    expect(mixed).toMatch(/Voided acquisitions \(1\)/); expect(mixed).toMatch(/VOIDED — kept for the audit trail, excluded from every position and total/);
    expect(mixed).toMatch(/Reason for voiding: Entered with a wrong value; voided to record a correction/);
    expect(mixed).toMatch(/Void this acquisition \(correction\)/); expect(mixed).toMatch(/name="confirmVoid"/);
  });
  it("a voided acquisition offers no forms and no payment controls", () => {
    const onlyVoid = render(buildEquipmentViews({ entityLegalName: "SYNTHETIC ENTITY W.L.L.", docs, acquisitions: [raw("a-old", "void")], obligations: [ob("o-old", "a-old", "void")], instalments: ins("o-old", "void") }));
    expect(onlyVoid).toMatch(/No equipment acquisitions are recorded/);          // nothing live
    expect(onlyVoid).not.toMatch(/Record instalment/); expect(onlyVoid).not.toMatch(/Void this acquisition/);
  });
  it("a linked acquisition explains that the asset must be unlinked first and offers no void form", () => {
    const linked = render(buildEquipmentViews({ entityLegalName: "SYNTHETIC ENTITY W.L.L.", docs, acquisitions: [raw("a-l", "recorded", "asset-1")], obligations: [ob("o-l", "a-l", "active")], instalments: ins("o-l", "pending") }));
    expect(linked).toMatch(/Unlink the asset first/);
  });
  it("never claims the void is an expense, a payment or a verification", () => {
    expect(mixed).toMatch(/creates no expense, payment or statement verification/);
  });
});
