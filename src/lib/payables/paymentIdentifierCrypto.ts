import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Payment Identifier Encryption (2026-09-04) — application-layer
// AES-256-GCM for public.payment_instructions.account_identifier /
// .routing_identifier, using Node's built-in crypto module (standard
// library, FIPS-recognized algorithm — no new dependency, no
// proprietary cryptography). Not pgcrypto: pgcrypto's pgp_sym_encrypt/
// decrypt require both the plaintext and the key to pass through
// Postgres as query parameters on every call, which can surface in
// hosted-Postgres query/connection-pooler logging outside this app's
// control — a well-documented pgcrypto caveat, and the exact reason
// Supabase's own guidance steers toward app-layer encryption for
// exactly this case. Here, encryption/decryption happen entirely
// inside the trusted server process; Postgres, its logs, and any
// backup only ever see ciphertext.
//
// Stored format (plain text, same existing columns — no migration):
//   "<version>:<iv_base64>:<authTag_base64>:<ciphertext_base64>"
// The version prefix is the key-rotation mechanism — see
// getKeyForVersion() below. AES-256-GCM is an AUTHENTICATED cipher:
// any tampering with the ciphertext or auth tag makes decryption fail
// loudly (GCM's tag verification), rather than silently returning
// corrupted plaintext.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // NIST-recommended IV length for GCM
const CURRENT_VERSION = "v1";

// Key resolution by version — the ONLY place a version string maps to
// an actual key. A future rotation adds a "v2" branch here (a second
// env var) while "v1" keeps resolving to the original key, so legacy
// rows keep decrypting through the transition; nothing ever "tries
// keys until one works" — the version prefix in the stored value
// always says exactly which key is required, deterministically.
function getKeyForVersion(version: string): Buffer {
  if (version === CURRENT_VERSION) {
    const raw = process.env.PAYMENT_IDENTIFIER_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error("PAYMENT_IDENTIFIER_ENCRYPTION_KEY is not configured.");
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("PAYMENT_IDENTIFIER_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256.");
    }
    return key;
  }
  throw new Error(`Unknown payment-identifier encryption key version: "${version}".`);
}

// Encrypts a plaintext financial identifier. Never called with a value
// that will be logged, returned to a client, or persisted anywhere
// except the returned ciphertext string going straight into the
// database column it replaces.
export function encryptPaymentIdentifier(plaintext: string): string {
  const key = getKeyForVersion(CURRENT_VERSION);
  const iv = randomBytes(IV_LENGTH_BYTES); // fresh, unique IV every call — see the "non-deterministic ciphertext" test
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

// Decrypts a stored value back to plaintext. Throws (never returns
// corrupted data) if the version is unrecognized, the format is
// malformed, the key is wrong, or the ciphertext/auth tag has been
// tampered with — every caller must treat a thrown error as "cannot
// display this value" and never surface the raw error text (which
// could theoretically embed fragments of the malformed input) to a
// client or a log in a way that risks the stored ciphertext appearing
// verbatim; callers log only that decryption failed, never the value.
export function decryptPaymentIdentifier(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted payment identifier — expected 4 colon-separated parts.");
  }
  const [version, ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKeyForVersion(version);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag); // GCM authentication — setAuthTag + final() together are what make tampering fail loudly
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Null-safe wrappers — account_identifier/routing_identifier are both
// nullable columns (routing_identifier especially: optional for every
// method, absent entirely for mobile money/other).
export function encryptPaymentIdentifierOrNull(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  return encryptPaymentIdentifier(plaintext);
}

export function decryptPaymentIdentifierOrNull(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  return decryptPaymentIdentifier(stored);
}
