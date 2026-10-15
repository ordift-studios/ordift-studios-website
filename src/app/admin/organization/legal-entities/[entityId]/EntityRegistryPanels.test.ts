// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("./actions", () => ({
  confirmApprovalNoticeAction: vi.fn(), confirmFundingAction: vi.fn(), recordPermitAction: vi.fn(), uploadEntityDocumentAction: vi.fn(), viewEntityDocumentAction: vi.fn(),
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
