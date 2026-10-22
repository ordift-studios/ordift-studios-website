import { describe, expect, it } from "vitest";
import { resolveApprovalDate, validateApprovalAttestation, type AttestationInput } from "./approvalAttestation";
import { deriveMasterContentReference, verifyStoredMaster } from "./masterContentReference";

const ctx = { documentCode: "OS-LGL-010", today: "2026-10-23", versionCreatedOn: "2026-09-08", versionWasCreatedApproved: true };
const good: AttestationInput = {
  documentCode: "OS-LGL-010", approvalDate: "2026-09-05", counselName: "Samuel Kwame Kumi Esq.", counselFirm: "Danquah & Associates",
  evidenceKind: "counsel_email", evidenceReference: "Counsel's email of 5 Sep 2026 approving OS-LGL-001 to OS-LGL-021 v1.0, filed in the legal archive",
  evidenceSha256: "a".repeat(64), coversDocumentCodes: ["OS-LGL-010"],
};

describe("historical approval attestation", () => {
  it("accepts a dated, evidenced approval that names this document and pre-dates the registry entry", () => expect(validateApprovalAttestation(good, ctx)).toEqual({ ok: true }));
  it("rejects the 11 October 2026 addendum-package date for OS-LGL-010: it post-dates the registry's own approved record (8 Sep)", () => {
    const v = validateApprovalAttestation({ ...good, approvalDate: "2026-10-11" }, ctx);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.errors.join(" ")).toContain("already recorded this version as approved on 2026-09-08");
  });
  it("rejects a date that does not name this document (a package date is not borrowed)", () => {
    const v = validateApprovalAttestation({ ...good, coversDocumentCodes: ["OS-LGL-001"] }, ctx);
    expect(!v.ok && v.errors.join(" ")).toContain("must expressly name OS-LGL-010");
  });
  it("rejects future dates, malformed dates, missing counsel/evidence and a bad fingerprint", () => {
    for (const bad of [{ approvalDate: "2026-12-01" }, { approvalDate: "05/09/2026" }, { counselName: "" }, { counselFirm: "x" }, { evidenceKind: "hearsay" }, { evidenceReference: "email" }, { evidenceSha256: "xyz" }])
      expect(validateApprovalAttestation({ ...good, ...bad }, ctx).ok).toBe(false);
  });
  it("the approval date comes from the registry stamp or an attestation, never from ingestion or today", () => {
    expect(resolveApprovalDate({ approvedAt: null }, null)).toBeNull();
    expect(resolveApprovalDate({ approvedAt: null }, { approvalDate: "2026-09-05" })).toEqual({ date: "2026-09-05", source: "attestation" });
    expect(resolveApprovalDate({ approvedAt: "2026-09-04T10:00:00Z" }, { approvalDate: "2026-09-05" })).toEqual({ date: "2026-09-04", source: "registry_stamp" });
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
