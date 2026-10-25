import { describe, expect, it } from "vitest";
import { classifyRegistryApproval, IDENTITY_METHODS, resolveApprovalDate, validateApprovalAttestation, validateIdentityCheck, type AttestationContext, type AttestationInput } from "./approvalAttestation";
import { deriveMasterContentReference, verifyStoredMaster } from "./masterContentReference";

// The version was created (seeded 'approved', undated, unevidenced) on 8 September 2026; counsel's own evidenced review is dated 18 September 2026.
const ctx: AttestationContext = { documentCode: "OS-LGL-010", today: "2026-10-23", versionCreatedOn: "2026-09-08" };
const identity = { method: "call_back_independent_number", checkedOn: "2026-10-22", note: "The Founder called the firm on a number taken from the Bar register and spoke to counsel." };
const good: AttestationInput = {
  documentCode: "OS-LGL-010", approvalDate: "2026-09-18", counselName: "Samuel Kwame Kumi Esq.", counselFirm: "Danquah & Associates",
  evidenceKind: "counsel_email", evidenceReference: "Counsel's email of 18 Sep 2026 confirming review of OS-LGL-010, filed in the legal archive",
  evidenceSha256: "a".repeat(64), coversDocumentCodes: ["OS-LGL-010"], identityCheck: identity,
};
const errorsOf = (i: AttestationInput, c = ctx) => { const v = validateApprovalAttestation(i, c); return v.ok ? "" : v.errors.join(" | "); };

describe("approval chronology", () => {
  it("accepts counsel's evidenced approval dated AFTER the version was created (8 Sep creation, 18 Sep review)", () => expect(validateApprovalAttestation(good, ctx)).toEqual({ ok: true }));
  it("accepts an approval dated on the creation date itself, and one dated today", () => {
    expect(validateApprovalAttestation({ ...good, approvalDate: "2026-09-08" }, ctx)).toEqual({ ok: true });
    expect(validateApprovalAttestation({ ...good, approvalDate: "2026-10-23" }, ctx)).toEqual({ ok: true });
  });
  it("rejects an approval dated before the version was created", () => {
    expect(errorsOf({ ...good, approvalDate: "2026-09-07" })).toContain("cannot be dated before it existed");
    expect(errorsOf({ ...good, approvalDate: "2026-09-05" })).toContain("was created on 2026-09-08");
  });
  it("rejects future dates, impossible dates and malformed dates", () => {
    expect(errorsOf({ ...good, approvalDate: "2026-10-24" })).toContain("cannot be in the future");
    for (const d of ["2026-02-30", "2026-13-01", "18/09/2026", "", "2026-9-18"]) expect(errorsOf({ ...good, approvalDate: d }), d).toContain("as YYYY-MM-DD");
  });
  it("fails closed when the creation date is not available", () => {
    expect(errorsOf(good, { ...ctx, versionCreatedOn: null })).toContain("creation date is not available");
  });
  it("still refuses a date that does not name this document (a package date is not borrowed) and a different document code", () => {
    expect(errorsOf({ ...good, coversDocumentCodes: ["OS-LGL-001"] })).toContain("must expressly name OS-LGL-010");
    expect(errorsOf({ ...good, documentCode: "OS-LGL-014" })).toContain("not OS-LGL-010");
  });
  it("still refuses missing counsel/evidence and a bad fingerprint", () => {
    for (const bad of [{ counselName: "" }, { counselFirm: "x" }, { evidenceKind: "hearsay" }, { evidenceReference: "email" }, { evidenceSha256: "xyz" }])
      expect(validateApprovalAttestation({ ...good, ...bad }, ctx).ok).toBe(false);
  });
});

describe("counsel identity check", () => {
  it("is required: an attestation without one is refused", () => {
    expect(errorsOf({ ...good, identityCheck: undefined as unknown as AttestationInput["identityCheck"] })).toContain("Record how counsel's identity was independently checked");
    expect(errorsOf({ ...good, identityCheck: { method: "", checkedOn: "", note: "" } })).toContain("Choose how counsel's identity was checked independently");
  });
  it("refuses self-declaration by email or by the sender, and any method that is not an independent one", () => {
    for (const method of ["self_declaration", "sender_confirmed_by_email", "email_says_so", "counsel_confirms_own_address", "SELF"])
      expect(errorsOf({ ...good, identityCheck: { ...identity, method } }), method).toContain("not an independent check");
  });
  it("needs a date that is real and not in the future, and a meaningful note", () => {
    expect(errorsOf({ ...good, identityCheck: { ...identity, checkedOn: "2026-10-24" } })).toContain("identity-check date cannot be in the future");
    expect(errorsOf({ ...good, identityCheck: { ...identity, checkedOn: "22/10/2026" } })).toContain("identity check as YYYY-MM-DD");
    expect(errorsOf({ ...good, identityCheck: { ...identity, note: "checked" } })).toContain("Describe the identity check");
    expect(errorsOf({ ...good, identityCheck: { ...identity, note: "   short   " } })).toContain("Describe the identity check");
  });
  it("asks for more detail when the method is 'another documented method'", () => {
    expect(errorsOf({ ...good, identityCheck: { method: "other_documented", checkedOn: "2026-10-22", note: "Checked it somehow ok." } })).toContain("at least 30 characters");
    expect(validateApprovalAttestation({ ...good, identityCheck: { method: "other_documented", checkedOn: "2026-10-22", note: "Verified through the firm's managing partner at the firm's office, in person." } }, ctx).ok).toBe(true);
  });
  it("accepts each independent method", () => { for (const method of IDENTITY_METHODS) expect(validateIdentityCheck({ ...identity, method, note: identity.note + " More detail for the documented route." }, ctx.today), method).toEqual([]); });
});

describe("what the registry's 'approved' status stands for", () => {
  it("a seeded 'approved' label with no stamp is an unevidenced assertion; only a stamp is evidence; other statuses are not approvals", () => {
    expect(classifyRegistryApproval({ status: "approved", approvedBy: "Legal Counsel", approvedAt: null })).toBe("seeded_label_unevidenced");
    expect(classifyRegistryApproval({ status: "active", approvedBy: "Management", approvedAt: null })).toBe("seeded_label_unevidenced");
    expect(classifyRegistryApproval({ status: "approved", approvedBy: "Legal Counsel", approvedAt: "2026-09-18T10:00:00Z" })).toBe("registry_stamp");
    for (const status of ["draft", "legal_review", "retired", "superseded"]) expect(classifyRegistryApproval({ status, approvedBy: "Legal Counsel", approvedAt: null })).toBe("not_approved");
  });
  it("the approval date comes from the registry stamp or an attestation, never from creation or today", () => {
    expect(resolveApprovalDate({ approvedAt: null }, null)).toBeNull();
    expect(resolveApprovalDate({ approvedAt: null }, { approvalDate: "2026-09-18" })).toEqual({ date: "2026-09-18", source: "attestation" });
    expect(resolveApprovalDate({ approvedAt: "2026-09-12T10:00:00Z" }, { approvalDate: "2026-09-18" })).toEqual({ date: "2026-09-12", source: "registry_stamp" });
  });
});

describe("controlled content reference for the stored OS-LGL-010 master", () => {
  const m = { code: "OS-LGL-010", version: "1.0", docxPath: "masters-docx/OS-LGL-010/a.docx", docxSha256: "1c68", pdfPath: "masters-pdf/OS-LGL-010/a.pdf", pdfSha256: "7014" };
  it("points at the stored files and carries their fingerprints (nothing duplicated)", () => {
    expect(deriveMasterContentReference(m)).toEqual({ contentReference: "legal-masters:masters-docx/OS-LGL-010/a.docx@sha256:1c68;pdf:masters-pdf/OS-LGL-010/a.pdf@sha256:7014", documentHash: "1c68" });
  });
  it("registers only on an exact fingerprint match", () => {
    expect(verifyStoredMaster({ docxSha256: "AB", pdfSha256: "cd" }, { docxSha256: "ab", pdfSha256: "cd" })).toEqual({ ok: true });
    expect(verifyStoredMaster({ docxSha256: "ab", pdfSha256: "cd" }, { docxSha256: "ab", pdfSha256: "ce" })).toEqual({ ok: false, mismatched: ["pdf"] });
  });
});
