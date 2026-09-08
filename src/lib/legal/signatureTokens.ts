import { randomBytes, createHash } from "crypto";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F (2026-09-08).
// Pure token generation/hashing/expiry logic for the Signature Engine.
// Uses Node's built-in crypto module only (same standard-library
// precedent as paymentIdentifierCrypto.ts) — no new dependency, no
// proprietary cryptography, no paid provider.
//
// TOKEN HASHING, NOT PLAINTEXT (continuation authorization message):
// generateSignatureToken() returns the raw token exactly once — the
// caller (signatureEngine.ts) must hand it to the signatory's access
// link and never persist it. Only hashSignatureToken()'s SHA-256
// digest is ever written to signature_signatories.token_hash. Because
// SHA-256 is deterministic, a presented raw token can be verified by
// hashing it again and comparing — no reversible encryption is needed
// or used here, since the token itself is never read back out.

const TOKEN_BYTES = 32; // 256 bits of entropy — well beyond brute-force range
export const DEFAULT_TOKEN_EXPIRY_DAYS = 14;

export type GeneratedSignatureToken = { token: string; tokenHash: string };

// High-entropy, URL-safe token. base64url avoids characters that need
// escaping in a query string or path segment.
export function generateSignatureToken(): GeneratedSignatureToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashSignatureToken(token) };
}

export function hashSignatureToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function computeTokenExpiry(fromDate: Date, expiryDays: number = DEFAULT_TOKEN_EXPIRY_DAYS): Date {
  const expiry = new Date(fromDate.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + expiryDays);
  return expiry;
}

export function isTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}
