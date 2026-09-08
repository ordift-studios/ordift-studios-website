// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F (2026-09-08).
// Pure evidence-package validation/normalization. No paid e-signature
// provider is used — the only implemented method is an explicit
// consent click plus a typed full name, bound to the exact issued
// document hash and a timestamp. This module never touches a
// database, a token, or the network; signatureEngine.ts calls it
// immediately before inserting a signature_evidence row.

export const SIGNATURE_METHODS = ["consent_click_typed_name"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export function isValidSignatureMethod(value: string): value is SignatureMethod {
  return (SIGNATURE_METHODS as readonly string[]).includes(value);
}

export type EvidencePackageInput = {
  signatureMethod: string;
  typedFullName: string;
  consentStatement: string;
  documentSha256: string;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: Date;
};

export type BuildEvidencePackageResult =
  | { ok: true; evidence: EvidencePackageInput & { signatureMethod: SignatureMethod } }
  | { ok: false; error: string };

// Validates and normalizes — never fabricates a missing field. A
// typed name or consent statement that is empty/whitespace-only is
// refused rather than silently accepted, since this row is the
// permanent evidentiary record of intent and consent.
export function buildEvidencePackage(input: EvidencePackageInput): BuildEvidencePackageResult {
  if (!isValidSignatureMethod(input.signatureMethod)) {
    return { ok: false, error: `Unsupported signature method: "${input.signatureMethod}".` };
  }
  if (!input.typedFullName.trim()) {
    return { ok: false, error: "A typed full name is required as evidence of intent." };
  }
  if (!input.consentStatement.trim()) {
    return { ok: false, error: "A consent statement is required before a signature can be recorded." };
  }
  if (!/^[0-9a-f]{64}$/i.test(input.documentSha256)) {
    return { ok: false, error: "documentSha256 must be a well-formed SHA-256 hex digest." };
  }
  return {
    ok: true,
    evidence: { ...input, signatureMethod: input.signatureMethod, typedFullName: input.typedFullName.trim(), consentStatement: input.consentStatement.trim() },
  };
}

export function isEvidencePackageComplete(pkg: Partial<EvidencePackageInput>): boolean {
  return Boolean(pkg.signatureMethod && pkg.typedFullName?.trim() && pkg.consentStatement?.trim() && pkg.documentSha256 && pkg.signedAt);
}
