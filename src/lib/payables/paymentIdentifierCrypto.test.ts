import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomBytes } from "crypto";
import {
  encryptPaymentIdentifier,
  decryptPaymentIdentifier,
  encryptPaymentIdentifierOrNull,
  decryptPaymentIdentifierOrNull,
} from "@/lib/payables/paymentIdentifierCrypto";
import { maskIdentifier } from "@/lib/payments/payeeInstructions";

// Payment Identifier Encryption (2026-09-04) — a test-only 32-byte key
// is generated fresh for this suite (never the real Production key,
// which this process never has access to and never needs to — the
// round-trip, tamper-detection, and version-handling properties below
// are true for ANY valid key, so a synthetic one proves them exactly
// as rigorously as the real one would, without this test file ever
// touching a real secret).
const originalKey = process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterAll(() => {
  process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = originalKey;
});

describe("encryptPaymentIdentifier / decryptPaymentIdentifier — round trip", () => {
  it("decrypts back to the exact original plaintext", () => {
    const plaintext = "GH00ORDF0123456789";
    const stored = encryptPaymentIdentifier(plaintext);
    expect(decryptPaymentIdentifier(stored)).toBe(plaintext);
  });

  it("round-trips a mobile money number", () => {
    const plaintext = "0244000000";
    expect(decryptPaymentIdentifier(encryptPaymentIdentifier(plaintext))).toBe(plaintext);
  });

  it("stored ciphertext is never equal to the supplied plaintext", () => {
    const plaintext = "1234567890";
    const stored = encryptPaymentIdentifier(plaintext);
    expect(stored).not.toBe(plaintext);
    expect(stored).not.toContain(plaintext);
  });

  it("is prefixed with the current version", () => {
    expect(encryptPaymentIdentifier("1234567890").startsWith("v1:")).toBe(true);
  });

  it("stored value has exactly 4 colon-separated parts: version, iv, authTag, ciphertext", () => {
    expect(encryptPaymentIdentifier("1234567890").split(":")).toHaveLength(4);
  });
});

describe("non-deterministic ciphertext — unique IV per encryption", () => {
  it("encrypting the same plaintext twice never produces identical ciphertext", () => {
    const plaintext = "1234567890";
    const first = encryptPaymentIdentifier(plaintext);
    const second = encryptPaymentIdentifier(plaintext);
    expect(first).not.toBe(second);
    // both must still independently decrypt to the same plaintext
    expect(decryptPaymentIdentifier(first)).toBe(plaintext);
    expect(decryptPaymentIdentifier(second)).toBe(plaintext);
  });
});

describe("authentication — tampered ciphertext fails", () => {
  it("rejects a ciphertext whose data has been altered", () => {
    const stored = encryptPaymentIdentifier("1234567890");
    const [version, iv, tag] = stored.split(":");
    // Flip the ciphertext to something else entirely — GCM's auth tag
    // must reject this rather than silently decrypting to garbage.
    const tampered = `${version}:${iv}:${tag}:${Buffer.from("tampered-ciphertext-value").toString("base64")}`;
    expect(() => decryptPaymentIdentifier(tampered)).toThrow();
  });

  it("rejects a ciphertext whose auth tag has been altered", () => {
    const stored = encryptPaymentIdentifier("1234567890");
    const [version, iv, , ciphertext] = stored.split(":");
    const wrongTag = Buffer.alloc(16, 0).toString("base64"); // a valid-length but wrong tag
    const tampered = `${version}:${iv}:${wrongTag}:${ciphertext}`;
    expect(() => decryptPaymentIdentifier(tampered)).toThrow();
  });
});

describe("wrong key fails", () => {
  it("cannot decrypt with a different key than the one used to encrypt", () => {
    const stored = encryptPaymentIdentifier("1234567890");
    const savedKey = process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;
    process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = randomBytes(32).toString("base64"); // a different key
    try {
      expect(() => decryptPaymentIdentifier(stored)).toThrow();
    } finally {
      process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = savedKey;
    }
  });
});

describe("version parsing / unknown version fails safely", () => {
  it("parses the current version correctly (already proven by the round-trip tests above)", () => {
    expect(encryptPaymentIdentifier("1234567890").split(":")[0]).toBe("v1");
  });

  it("throws for an unrecognized version rather than guessing/trying other keys", () => {
    const stored = encryptPaymentIdentifier("1234567890");
    const [, iv, tag, ciphertext] = stored.split(":");
    const futureVersion = `v99:${iv}:${tag}:${ciphertext}`;
    expect(() => decryptPaymentIdentifier(futureVersion)).toThrow(/Unknown payment-identifier encryption key version/);
  });

  it("throws for a malformed stored value (wrong number of parts) rather than decrypting garbage", () => {
    expect(() => decryptPaymentIdentifier("not-a-valid-stored-value")).toThrow(/Malformed/);
  });
});

describe("null-safe wrappers", () => {
  it("encryptPaymentIdentifierOrNull passes through null/undefined/empty string as null", () => {
    expect(encryptPaymentIdentifierOrNull(null)).toBeNull();
    expect(encryptPaymentIdentifierOrNull(undefined)).toBeNull();
    expect(encryptPaymentIdentifierOrNull("")).toBeNull();
  });

  it("decryptPaymentIdentifierOrNull passes through null/undefined as null", () => {
    expect(decryptPaymentIdentifierOrNull(null)).toBeNull();
    expect(decryptPaymentIdentifierOrNull(undefined)).toBeNull();
  });

  it("round-trips a real value through the null-safe wrappers", () => {
    const stored = encryptPaymentIdentifierOrNull("1234567890");
    expect(stored).not.toBeNull();
    expect(decryptPaymentIdentifierOrNull(stored)).toBe("1234567890");
  });
});

describe("full chain — encrypt, decrypt, mask (what listPaymentInstructionsForProfile actually does)", () => {
  it("a browser-facing read only ever sees the last-4-masked form, never the full decrypted value", () => {
    const plaintext = "GH00ORDF0123456789";
    const stored = encryptPaymentIdentifier(plaintext);
    // stored is what the database holds; decrypting it and masking the
    // result is exactly what listPaymentInstructionsForProfile() does
    // before returning anything to a caller.
    const masked = maskIdentifier(decryptPaymentIdentifier(stored));
    expect(masked).not.toBe(plaintext);
    expect(masked?.slice(-4)).toBe(plaintext.slice(-4));
    expect(masked?.slice(0, -4)).toMatch(/^\*+$/);
  });
});

describe("configuration failure", () => {
  it("throws a clear error when the encryption key is not configured, rather than silently encrypting with nothing", () => {
    const savedKey = process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;
    delete process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;
    try {
      expect(() => encryptPaymentIdentifier("1234567890")).toThrow(/not configured/);
    } finally {
      process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = savedKey;
    }
  });

  it("throws a clear error when the configured key is not exactly 32 bytes", () => {
    const savedKey = process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;
    process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    try {
      expect(() => encryptPaymentIdentifier("1234567890")).toThrow(/32 bytes/);
    } finally {
      process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY = savedKey;
    }
  });
});
