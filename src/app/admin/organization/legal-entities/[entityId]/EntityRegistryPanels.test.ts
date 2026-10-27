// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("./actions", () => ({
  confirmApprovalNoticeAction: vi.fn(), confirmFundingAction: vi.fn(), recordPermitAction: vi.fn(), recordExpenseAction: vi.fn(), uploadEntityDocumentAction: vi.fn(), viewEntityDocumentAction: vi.fn(), recordRegistrationAction: vi.fn(), recordRenewalAction: vi.fn(), setSignatoryCapacityAction: vi.fn(), linkSignatoryToFounderAction: vi.fn(),
}));
import { EntityRegistryPanels } from "./EntityRegistryPanels";
import { trackCompliance } from "@/lib/organization/entityRegistry";

const regs = [
  { id: "1", kind: "commercial_registration", label: "Commercial Registration (CR)", status: "active", identifier: "TEST-CR", issuedOn: "2026-10-15", expiresOn: "2027-10-15", note: null, verifiedAt: "2026-10-16", facts: { entityNumber: "00-0000-00", headOfficeCity: "Doha", capitalQar: 1000, activities: [{ code: "742010", name: "Photographic activities" }] } },
  { id: "2", kind: "commercial_permit", label: "Commercial Permit / Licence", status: "not_issued", identifier: null, issuedOn: null, expiresOn: null, note: null, verifiedAt: null, facts: {} },
];
const tracked = trackCompliance(regs.map((r) => ({ ...r, kind: r.kind as never, status: r.status as never })), "2026-10-16");
const render = () => renderToStaticMarkup(createElement(EntityRegistryPanels, {
  entityId: "e1", tracked, registrations: regs, signatories: [{ id: "s", fullName: "Test Owner", position: "Owner", authority: "Full authority", nationality: "Ghana", ownershipPercent: 100 }],
  documents: [{ id: "d1", documentType: "commercial_registration", filename: "CR.pdf", sha256: "a".repeat(64), sizeBytes: 2048, issuedOn: "2026-10-15", expiresOn: "2027-10-15", issuingAuthority: "X", relation: null, relatedDocumentId: null, replacedByDocumentId: null, notes: null, uploadedAt: "2026-10-16T00:00:00Z" }],
  expenses: [{ id: "x", expenseDate: "2026-10-15", amount: 200, currency: "QAR", description: "Fee", receiptNumber: "R-1", receiptTotal: 1200, payerAsShown: "Applicant", fundingSourceStatus: "founder_personal", fundingSourceNote: "Founder statement", accountingTreatment: "to_be_confirmed" }],
  canonicalPermitPending: true, status: { entityVerification: "verified", employerCapable: false, documentCount: 1 },
}));

describe("Qatar entity registry panels render the linked records", () => {
  const html = render();
  it("shows the four separate statuses: registration verified, permit not issued (without invalidating the CR), documents, employer-capable no", () => {
    expect(html).toMatch(/Commercial Registration: <\/dt><dd[^>]*>active — verified against the original document/);
    expect(html).toMatch(/not yet issued — awaiting the official document \(this does not affect the issued registration\)/);
    expect(html).toMatch(/Employer-capable: <\/dt><dd[^>]*>no — a separate decision/);
  });
  it("lists the CR with its number, dates, establishment number, activity and capital as share capital (not an expense)", () => {
    expect(html).toContain("TEST-CR"); expect(html).toContain("issued 2026-10-15"); expect(html).toContain("expires 2027-10-15");
    expect(html).toContain("establishment no. 00-0000-00"); expect(html).toContain("742010 Photographic activities"); expect(html).toContain("capital, not an expense");
  });
  it("shows the permit fields blank, the signatory, the vault document, and the receipt as one payment with its allocation", () => {
    for (const f of ["Permit number", "Licence number", "Issue date", "Expiry date", "Confirmed premises address"]) expect(html).toContain(f);
    expect(html).toContain("blank until supplied"); expect(html).toContain("Test Owner"); expect(html).toContain("CR.pdf");
    expect(html).toContain("Receipt R-1"); expect(html).toContain("QAR 1200.00"); expect(html).toContain("Paid personally by the Founder");
  });
});

describe("Ghana registry panels: proprietor capacity, renewal tracking and the registration form", () => {
  const ghanaRegs = [{ id: "g1", kind: "commercial_registration", label: "Commercial Registration (CR)", status: "active", identifier: "BN000000000", issuedOn: "2018-05-07", expiresOn: null, note: null, verifiedAt: "2026-10-26", facts: {} }];
  const base = {
    entityId: "g", tracked: trackCompliance(ghanaRegs.map((r) => ({ ...r, kind: r.kind as never, status: r.status as never })), "2026-10-26"), registrations: ghanaRegs, documents: [{ id: "d9", documentType: "commercial_registration", filename: "certificate.jpeg", sha256: "b".repeat(64), sizeBytes: 1024, issuedOn: "2018-05-07", expiresOn: null, issuingAuthority: "Registrar", relation: null, relatedDocumentId: null, replacedByDocumentId: null, pageNumber: null, pageCount: null, notes: null, uploadedAt: "2026-10-22T00:00:00Z" }],
    expenses: [], canonicalPermitPending: false, status: { entityVerification: "verified", employerCapable: true, documentCount: 1 }, jurisdictionName: "Ghana",
  };
  const ghanaHtml = (over: Record<string, unknown>) => renderToStaticMarkup(createElement(EntityRegistryPanels, { ...base, signatories: [], ...over } as never));
  it("shows the title and the LEGAL capacity separately; a title alone is flagged as not legal authority, and offers to record the capacity", () => {
    const html = ghanaHtml({ signatories: [{ id: "s1", fullName: "Test Proprietor", position: "Chief Executive Officer", authority: "Full authority", nationality: null, ownershipPercent: null, legalCapacity: null }] });
    expect(html).toContain("title: Chief Executive Officer");
    expect(html).toContain("not recorded (a title alone is not legal authority to contract)");
    expect(html).toContain("Record legal capacity");
    const done = ghanaHtml({ signatories: [{ id: "s1", fullName: "Test Proprietor", position: "Chief Executive Officer", authority: "Full authority", nationality: null, ownershipPercent: null, legalCapacity: "sole_proprietor" }] });
    expect(done).toContain("title: Chief Executive Officer"); expect(done).toContain("Sole proprietor"); expect(done).not.toContain("Record legal capacity");   // set once
  });
  it("renewal: no record says so plainly; a Founder statement is labelled 'Founder-confirmed — official verification pending'; nothing is called overdue", () => {
    expect(ghanaHtml({})).toContain("No renewal confirmation is recorded.");
    const html = ghanaHtml({ renewals: [{ id: "r1", coversFrom: "2018-05-07", coversTo: "2026-10-26", status: "founder_confirmed", basis: "founder_statement", statement: "x", officialReference: null, nextDueOn: null, verifiedAt: null }] });
    expect(html).toContain("Founder-confirmed — official verification pending");
    expect(html.replace("Nothing is marked overdue or non-compliant because a paper receipt is missing.", "")).not.toMatch(/overdue|non-compliant/i);
    expect(html).toContain("Nothing is marked overdue or non-compliant because a paper receipt is missing.");
  });
  it("the registration form appears only for what is not yet recorded, and says the number is checked against the jurisdiction's format and recorded as a cross-check", () => {
    const html = ghanaHtml({});
    expect(html).toContain("Record a registration");
    expect(html).toContain("the tax identification number");
    expect(html).toContain("recorded as a cross-check, not as confirmation by the issuing authority");
  });
});

describe("linking a signatory record to the Founder identity", () => {
  const sig = (over: Record<string, unknown>) => ({ id: "s1", fullName: "Test Founder", position: "Owner", authority: "Full authority", nationality: "Ghana", ownershipPercent: 100, legalCapacity: null, profileLinked: false, ...over });
  const html = (signatories: unknown[], founderIdentityActive: boolean) => renderToStaticMarkup(createElement(EntityRegistryPanels, {
    entityId: "q", tracked, registrations: regs, signatories, documents: [], expenses: [], canonicalPermitPending: true, status: { entityVerification: "verified", employerCapable: false, documentCount: 0 }, founderIdentityActive,
  } as never));
  it("an unlinked record offers the link (with its capacity choice) only when a Founder identity is designated; the person is never chosen on screen", () => {
    const h = html([sig({})], true);
    expect(h).toContain("Link to the Founder identity");
    expect(h).toContain("This signatory is the Founder (the designated Founder identity)");
    expect(h).toContain("Legal capacity…");
    expect(h).not.toMatch(/name="profileId"|name="profile"/);
    expect(html([sig({})], false)).not.toContain("Link to the Founder identity");          // nobody designated: nothing to link
  });
  it("a record that is already linked offers no link, and one with a capacity already recorded does not ask for it again", () => {
    expect(html([sig({ profileLinked: true, legalCapacity: "owner" })], true)).not.toContain("Link to the Founder identity");
    const h = html([sig({ legalCapacity: "owner" })], true);
    expect(h).toContain("Link to the Founder identity");
    expect(h.split("Legal capacity…").length - 1).toBe(0);
  });
});

describe("Qatar Commercial Permit panel: the record form and what an issued permit shows", () => {
  const permitDoc = { id: "dp", documentType: "commercial_permit", filename: "Commercial Permit.pdf", sha256: "c".repeat(64), sizeBytes: 3000, issuedOn: "2026-10-26", expiresOn: "2027-10-21", issuingAuthority: "X", relation: null, relatedDocumentId: null, replacedByDocumentId: null, uploadedAt: "2026-10-26T08:00:00Z", pageNumber: null, pageCount: null, hasFile: true, notes: null };
  const cr = { id: "1", kind: "commercial_registration", label: "Commercial Registration (CR)", status: "active", identifier: "254551", issuedOn: "2026-10-15", expiresOn: "2027-10-15", note: null, verifiedAt: "2026-10-16", facts: {} };
  const card = { id: "3", kind: "establishment_card", label: "Establishment Card", status: "active", identifier: "EC-1", issuedOn: "2026-10-15", expiresOn: "2027-10-15", note: null, verifiedAt: "2026-10-16", facts: {} };
  const pending = { id: "2", kind: "commercial_permit", label: "Commercial Permit / Licence", status: "not_issued", identifier: null, issuedOn: null, expiresOn: null, note: null, verifiedAt: null, facts: {} };
  const issued = (verifiedAt: string | null) => ({ id: "4", kind: "commercial_permit", label: "Commercial Permit / Licence", status: "active", identifier: "345520", issuedOn: "2026-10-26", expiresOn: "2027-10-21", note: null, verifiedAt,
    facts: { premises: "Zone 27, Street 950, Building 20, Floor 1, Unit 0", premisesBasis: "founder_confirmed_authorised_location_not_a_government_inspection", siteClassification: "Commercial", activities: [{ code: "742010", name: "Photographic activities" }], restrictions: "Practicing any activity not explicitly listed in the license is prohibited." } });
  const page = (regs: unknown[], documents: unknown[]) => renderToStaticMarkup(createElement(EntityRegistryPanels, {
    entityId: "q", tracked: trackCompliance((regs as { kind: string; status: string }[]).map((r) => ({ ...r, kind: r.kind as never, status: r.status as never })) as never, "2026-10-26"), registrations: regs, signatories: [], documents, expenses: [],
    canonicalPermitPending: true, status: { entityVerification: "verified", employerCapable: false, documentCount: documents.length }, jurisdictionName: "Qatar",
  } as never));

  it("the record form asks for the printed particulars and offers two SEPARATE confirmations, worded as a cross-check and the Founder's confirmation - never as government verification", () => {
    const html = page([cr, card, pending], [permitDoc]);
    for (const f of ["Site classification", "Licensed activities exactly as printed", "Restrictions printed on the permit", "exactly as printed on the permit"]) expect(html).toContain(f);
    expect(html).toContain('name="founderCrossChecked"'); expect(html).toContain('name="premisesConfirmedByFounder"');
    expect(html).toContain("not a check against the issuing authority&#x27;s records or the QR verification portal");
    expect(html).toContain("not as a government inspection of the premises");
    expect(html).not.toMatch(/government verification (complete|confirmed)|verified by the (Ministry|government)/i);
  });
  it("an issued, cross-checked permit shows every printed fact, says no other activity is licensed, and says plainly it is a cross-check", () => {
    const html = page([cr, card, issued("2026-10-26T09:00:00Z")], [permitDoc]);
    expect(html).toContain("Permit 345520 — issued 2026-10-26, expires 2027-10-21");
    expect(html).toContain("Zone 27, Street 950, Building 20, Floor 1, Unit 0"); expect(html).toContain("confirmed by the Founder as the authorised location (not a government inspection)");
    expect(html).toContain("Site classification: Commercial"); expect(html).toContain("742010 Photographic activities"); expect(html).toContain("No other activity is licensed by this permit.");
    expect(html).toContain("not explicitly listed in the license is prohibited");
    expect(html).toContain("issued — checked against the original document (a cross-check, not a government verification)");
    expect(html).toContain("cross-checked; not checked against the issuing authority&#x27;s records or the QR verification portal");
  });
  it("an issued permit that has not been cross-checked says so", () => {
    const html = page([cr, card, issued(null)], [permitDoc]);
    expect(html).toContain("issued — not yet cross-checked against the original document");
    expect(html).toContain("Not yet cross-checked against the original document.");
  });
  it("the commercial registration and the establishment card stay separate records alongside the permit", () => {
    const html = page([cr, card, issued("2026-10-26T09:00:00Z")], [permitDoc]);
    expect(html).toContain("254551"); expect(html).toContain("Establishment Card");
    expect(html.match(/Commercial Registration \(CR\)/g)!.length).toBeGreaterThan(0);
  });
});

describe("the expense entry form uses a receipt already in the vault and never presents a recorded cost as a bank payment, payable, loan or capital", () => {
  const doc = (id: string, over: object = {}) => ({ id, documentType: "government_receipt", filename: `${id}.jpg`, sha256: id.padEnd(64, "e"), sizeBytes: 2048, issuedOn: "2026-10-26", expiresOn: null, issuingAuthority: "Single Window", relation: null, relatedDocumentId: null, replacedByDocumentId: null, uploadedAt: "2026-10-27T08:00:00Z", pageNumber: null, pageCount: null, hasFile: true, notes: null, ...over });
  const exp = (over: object = {}) => ({ id: "x1", expenseDate: "2026-10-26", amount: 500, currency: "QAR", description: "Commercial Permit issuance fee", receiptNumber: "R-500", receiptTotal: 500, payerAsShown: "Applicant", fundingSourceStatus: "founder_personal", fundingSourceNote: "Founder statement", accountingTreatment: "to_be_confirmed", sourceDocumentId: "used", reimbursementIntent: "not_reimbursable", paymentMethod: "card", relatedReference: "Commercial License 345520", notes: "A note", ...over });
  const render = (documents: unknown[], expenses: unknown[]) => renderToStaticMarkup(createElement(EntityRegistryPanels, {
    entityId: "q", tracked: [], registrations: [], signatories: [], documents, expenses, canonicalPermitPending: false, status: { entityVerification: "verified", employerCapable: false, documentCount: documents.length }, jurisdictionName: "Qatar",
  } as never));

  it("offers only receipts in the vault that do not already back an expense (and never a duplicate-of or non-receipt document)", () => {
    const html = render([doc("fresh"), doc("used"), doc("dupe", { relation: "exact_duplicate_of" }), doc("cr", { documentType: "commercial_registration" })], [exp()]);
    const form = html.slice(html.indexOf("Choose the receipt or invoice already in the vault"));
    expect(form).toContain("fresh.jpg"); expect(form).not.toContain("used.jpg"); expect(form).not.toContain("dupe.jpg"); expect(form).not.toContain("cr.jpg");
  });
  it("offers receipts, supplier invoices, purchase receipts and other financial documents by class — and never a registration, permit, premises or generic document", () => {
    const html = render([doc("g1"), doc("inv1", { documentType: "supplier_invoice", filename: "acme.pdf" }), doc("pur1", { documentType: "purchase_receipt", filename: "shop.pdf" }), doc("fin1", { documentType: "other_financial_document", filename: "stmt.pdf" }),
      doc("p1", { documentType: "commercial_permit", filename: "permit.pdf" }), doc("pr1", { documentType: "premises_document", filename: "lease.pdf" }), doc("o1", { documentType: "other", filename: "misc.pdf" }), doc("t1", { documentType: "tax_card", filename: "tax.pdf" })], []);
    const form = html.slice(html.indexOf("Choose the receipt or invoice already in the vault"), html.indexOf("Record Expense"));
    for (const f of ["g1.jpg", "acme.pdf", "shop.pdf", "stmt.pdf", "Supplier / vendor invoice", "Purchase receipt", "Other financial supporting document"]) expect(form).toContain(f);
    for (const f of ["permit.pdf", "lease.pdf", "misc.pdf", "tax.pdf"]) expect(form).not.toContain(f);
  });
  it("shows every field the entry needs, as separate controls: funding, reimbursement intention, payment method, related reference, notes", () => {
    const html = render([doc("fresh")], []);
    for (const n of ["sourceDocumentId", "receiptNumber", "requestReference", "receiptDate", "issuingAuthority", "category", "relatedReference", "currency", "printedTotal", "lines", "payerAsShown", "paymentMethod", "fundingSourceStatus", "reimbursementIntent", "fundingSourceNote", "notes"]) expect(html).toContain(`name="${n}"`);
    expect(html).toContain("Record Expense");
    expect(html).toContain("non-reimbursable contribution (not a loan)");
  });
  it("states that recording a cost creates no bank transaction, payable, reimbursement, loan or journal and leaves share capital alone", () => {
    const html = render([doc("fresh")], []);
    expect(html).toContain("does not create a bank transaction, payable, reimbursement, loan or journal, and does not change registered share capital");
  });
  it("tells the Founder-funded story plainly on a recorded cost: personal funds, reimbursement not required (not a loan), accounting still to be confirmed", () => {
    const html = render([doc("used")], [exp()]);
    expect(html).toContain("Paid personally by the Founder");
    expect(html).toContain("Reimbursement: not required — non-reimbursable contribution (not a loan)");
    expect(html).toContain("Accounting treatment: to be confirmed");
    expect(html).toContain("Related: Commercial License 345520");
    expect(html).not.toMatch(/Founder loan|director loan|share capital increase|increase in registered share capital/i);
  });
  it("with every vault receipt already used, the form is disabled and says why", () => {
    const html = render([doc("used")], [exp()]);
    expect(html).toContain("Every receipt or invoice in the vault already backs a recorded expense");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Record Expense<\/button>/);
  });
});
