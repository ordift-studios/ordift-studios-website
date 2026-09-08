import { describe, expect, it } from "vitest";
import { isValidSignatureMethod, buildEvidencePackage, isEvidencePackageComplete, SIGNATURE_METHODS } from "./signatureEvidence";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F.

const VALID_HASH = "a".repeat(64);
const baseInput = () => ({
  signatureMethod: "consent_click_typed_name",
  typedFullName: "Jane Doe",
  consentStatement: "I have read and agree to this document.",
  documentSha256: VALID_HASH,
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0",
  signedAt: new Date("2026-09-08T12:00:00.000Z"),
});

describe("isValidSignatureMethod", () => {
  it("only the one implemented provider-neutral method is valid", () => {
    expect(SIGNATURE_METHODS).toEqual(["consent_click_typed_name"]);
    expect(isValidSignatureMethod("consent_click_typed_name")).toBe(true);
    expect(isValidSignatureMethod("docusign_embedded")).toBe(false);
  });
});

describe("buildEvidencePackage", () => {
  it("accepts a well-formed input and trims name/consent", () => {
    const result = buildEvidencePackage({ ...baseInput(), typedFullName: "  Jane Doe  ", consentStatement: "  I agree.  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.typedFullName).toBe("Jane Doe");
      expect(result.evidence.consentStatement).toBe("I agree.");
    }
  });

  it("refuses an unsupported signature method", () => {
    const result = buildEvidencePackage({ ...baseInput(), signatureMethod: "wet_ink_scan" });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty or whitespace-only typed name", () => {
    expect(buildEvidencePackage({ ...baseInput(), typedFullName: "" }).ok).toBe(false);
    expect(buildEvidencePackage({ ...baseInput(), typedFullName: "   " }).ok).toBe(false);
  });

  it("refuses an empty or whitespace-only consent statement", () => {
    expect(buildEvidencePackage({ ...baseInput(), consentStatement: "" }).ok).toBe(false);
  });

  it("refuses a malformed document hash", () => {
    expect(buildEvidencePackage({ ...baseInput(), documentSha256: "not-a-hash" }).ok).toBe(false);
    expect(buildEvidencePackage({ ...baseInput(), documentSha256: "a".repeat(63) }).ok).toBe(false);
  });
});

describe("isEvidencePackageComplete", () => {
  it("true for a fully-populated package", () => {
    expect(isEvidencePackageComplete(baseInput())).toBe(true);
  });
  it("false when any required field is missing", () => {
    expect(isEvidencePackageComplete({ ...baseInput(), typedFullName: "" })).toBe(false);
    expect(isEvidencePackageComplete({ ...baseInput(), documentSha256: undefined })).toBe(false);
  });
});
