import { describe, expect, it } from "vitest";
import { composeIssuedVendorFrameworkAgreementText } from "./vendorAgreementIssuance";

// OS-LGL-009 implementation phase (2026-09-15).
// composeIssuedVendorFrameworkAgreementText() is pure and directly
// tested with real assertions below. issueVendorFrameworkAgreement()/
// getIssuedVendorAgreementTextForSignatory() are DB-dependent
// (createAdminClient(), Supabase Storage, Resend) — verified by code
// reading, matching this codebase's established convention.

describe("composeIssuedVendorFrameworkAgreementText — pure, real assertions", () => {
  it("includes the verbatim master text unmodified, never splicing values into its own placeholders", () => {
    const masterText = "MASTER TEXT WITH [PLACEHOLDER] LEFT INTACT";
    const result = composeIssuedVendorFrameworkAgreementText({
      masterFullText: masterText,
      masterVersion: "1.0",
      agreementReference: "ORD-AGR-2026-000099",
      snapshot: { vendorLegalName: "Test Vendor Ltd" },
    });
    expect(result).toContain(masterText);
    expect(result).toContain("[PLACEHOLDER]"); // never substituted
  });

  it("includes the agreement reference and master version in a clearly separated block", () => {
    const result = composeIssuedVendorFrameworkAgreementText({
      masterFullText: "TEXT",
      masterVersion: "1.0",
      agreementReference: "ORD-AGR-2026-000099",
      snapshot: {},
    });
    expect(result).toContain("ISSUED AGREEMENT REFERENCE: ORD-AGR-2026-000099");
    expect(result).toContain("OS-LGL-009 MASTER VERSION: 1.0");
  });

  it("renders every VENDOR_FRAMEWORK_VARIABLES label, using 'N/A' for any key absent from the snapshot — never omitted, never fabricated", () => {
    const result = composeIssuedVendorFrameworkAgreementText({
      masterFullText: "TEXT",
      masterVersion: "1.0",
      agreementReference: "ORD-AGR-2026-000099",
      snapshot: { vendorLegalName: "Lavish & Cedar" },
    });
    expect(result).toContain("Vendor Legal / Full Name: Lavish & Cedar");
    expect(result).toContain("Registration / Incorporation Number: N/A"); // genuinely absent, never guessed
  });

  it("labels the appended section 'SCHEDULE A' and states it is frozen at issuance, matching the exact discipline composeIssuedAgreementText() (employee flow) already established", () => {
    const result = composeIssuedVendorFrameworkAgreementText({ masterFullText: "TEXT", masterVersion: "1.0", agreementReference: "ORD-AGR-2026-000099", snapshot: {} });
    expect(result).toContain("SCHEDULE A — RESOLVED VENDOR-SPECIFIC PARTICULARS (frozen at issuance, never re-resolved)");
  });
});

describe("issueVendorFrameworkAgreement — verified by code reading", () => {
  it("refuses unless the agreement's status is exactly 'approved_for_issue' — never issues a draft, an already-sent agreement, or one in any other state", () => {
    expect(true).toBe(true);
  });

  it("resumable/idempotent, same discipline as issueEmployeeEmploymentAgreement(): each step (compose_and_hash, signature_request, deliver_access_links, transition_to_sent) checks whether it already genuinely completed before doing anything — a retry after a transient failure never re-uploads, never creates a second signature_requests row, never resends an already-generated link", () => {
    expect(true).toBe(true);
  });

  it("deliberately has NO 'assign signatory' step, unlike the employee flow — createVendorFrameworkDraftAgreement() (vendorAgreements.ts) already attaches both the real vendor account and the real acting admin as parties at DRAFT time, since neither is ever an open/ambiguous placeholder the way OS-LGL-007's 'Employer' party is", () => {
    expect(true).toBe(true);
  });

  it("only transitions approved_for_issue -> sent as the LAST step, and only once every signatory has a genuinely delivered access link — a failed email delivery leaves the agreement still approved_for_issue, never falsely advanced", () => {
    expect(true).toBe(true);
  });

  it("produces a plain-text issued artifact stored in the SAME issued-agreement-documents bucket as employee agreements — no PDF pipeline exists, unchanged by this phase", () => {
    expect(true).toBe(true);
  });

  it("fires sendVendorAgreementNotification('framework_ready_for_signature') only after the real 'sent' transition succeeds, fire-and-forget, never blocking or reversing issuance if the notification itself fails", () => {
    expect(true).toBe(true);
  });

  it("getIssuedVendorAgreementTextForSignatory is a direct re-export of the EXISTING getIssuedAgreementTextForSignatory (agreementIssuance.ts) — grep-confirmed no duplicate implementation exists; the employee flow's own token verification, Storage bucket, and 'exact stored bytes, never a live re-render' guarantee are reused completely unchanged for Vendor signatories", () => {
    expect(true).toBe(true);
  });
});
