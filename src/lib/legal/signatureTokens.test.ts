import { describe, expect, it } from "vitest";
import { generateSignatureToken, hashSignatureToken, computeTokenExpiry, isTokenExpired, DEFAULT_TOKEN_EXPIRY_DAYS } from "./signatureTokens";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F.

describe("generateSignatureToken", () => {
  it("returns a raw token and its hash, and the hash is never the raw token itself", () => {
    const { token, tokenHash } = generateSignatureToken();
    expect(token).not.toBe(tokenHash);
    expect(token.length).toBeGreaterThan(30);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a fresh, non-repeating token on every call", () => {
    const a = generateSignatureToken();
    const b = generateSignatureToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("hashSignatureToken", () => {
  it("is deterministic — the same raw token always hashes the same way, enabling lookup by hash", () => {
    const { token, tokenHash } = generateSignatureToken();
    expect(hashSignatureToken(token)).toBe(tokenHash);
  });

  it("a different token produces a different hash", () => {
    expect(hashSignatureToken("token-a")).not.toBe(hashSignatureToken("token-b"));
  });
});

describe("computeTokenExpiry / isTokenExpired", () => {
  it("defaults to DEFAULT_TOKEN_EXPIRY_DAYS days ahead", () => {
    const from = new Date("2026-09-08T00:00:00.000Z");
    const expiry = computeTokenExpiry(from);
    expect(expiry.toISOString()).toBe(new Date(from.getTime() + DEFAULT_TOKEN_EXPIRY_DAYS * 86400000).toISOString());
  });

  it("respects a custom expiry window", () => {
    const from = new Date("2026-09-08T00:00:00.000Z");
    const expiry = computeTokenExpiry(from, 3);
    expect(expiry.toISOString()).toBe(new Date(from.getTime() + 3 * 86400000).toISOString());
  });

  it("isTokenExpired is false before the expiry instant and true at/after it", () => {
    const expiresAt = new Date("2026-09-10T00:00:00.000Z");
    expect(isTokenExpired(expiresAt, new Date("2026-09-09T23:59:59.999Z"))).toBe(false);
    expect(isTokenExpired(expiresAt, new Date("2026-09-10T00:00:00.000Z"))).toBe(true);
    expect(isTokenExpired(expiresAt, new Date("2026-09-11T00:00:00.000Z"))).toBe(true);
  });
});
