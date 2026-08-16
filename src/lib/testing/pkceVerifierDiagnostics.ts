// TEMPORARY STAGING-ONLY DIAGNOSTIC (2026-08-16) — investigates why the
// PKCE verifier cookie can be visibly present in document.cookie/Chrome
// DevTools yet still resolve to "missing" inside auth-js's own
// exchangeCodeForSession(), producing AuthPKCECodeVerifierMissingError.
// Mirrors the exact decode chain @supabase/ssr and @supabase/auth-js use
// internally (base64url decode -> JSON.parse -> split('/')) so this can
// tell, before the real exchange call even runs, whether it will
// succeed or fail with that specific error — without ever reading,
// storing, or displaying the actual verifier value, the authorization
// code, or any session/access/refresh token. Only cookie *names*, byte
// *lengths*, and a SHA-256 fingerprint (irreversible) of the raw cookie
// value are ever captured.
//
// Delete this file (and its call sites in ForgotPasswordForm.tsx /
// ResetPasswordForm.tsx) once the PKCE recovery investigation is closed.

import { stringFromBase64URL } from "@supabase/ssr";
import type { createClient } from "@/lib/supabase/client";

type SupabaseClientType = ReturnType<typeof createClient>;

const BASE64_PREFIX = "base64-";
const VERIFIER_NAME_PATTERN = /-code-verifier(\.\d+)?$/;

export type PkceVerifierDiagnostic = {
  timestamp: string;
  hostname: string;
  verifierCookieNameFound: boolean;
  matchingCookieNames: string[];
  matchingCookieOccurrences: number;
  duplicateNameDetected: boolean;
  rawCookieExists: boolean;
  rawCookieLength: number | null;
  rawValueFingerprint: string | null;
  hasBase64Prefix: boolean;
  base64DecodeSucceeded: boolean;
  decodedIsValidJson: boolean;
  decodedValueType: string | null;
  decodedLooksLikeVerifier: boolean;
  decodedSegmentCount: number | null;
  storageGetItemResolved: boolean;
  storageGetItemLength: number | null;
  finalVerifierResolvable: boolean;
};

async function sha256Hex(value: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function parseDocumentCookiePairs(): Array<{ name: string; value: string }> {
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      if (eq === -1) return { name: entry, value: "" };
      return { name: entry.slice(0, eq), value: entry.slice(eq + 1) };
    });
}

export async function capturePkceVerifierDiagnostic(
  supabase: SupabaseClientType
): Promise<PkceVerifierDiagnostic> {
  const pairs = parseDocumentCookiePairs();
  const matches = pairs.filter((p) => VERIFIER_NAME_PATTERN.test(p.name));
  const nameCounts = new Map<string, number>();
  matches.forEach((m) => nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1));
  const duplicateNameDetected = Array.from(nameCounts.values()).some((c) => c > 1);

  // Unchunked-name match preferred for raw-value inspection — the
  // verifier is short enough that chunking (name.0, name.1, ...) is not
  // expected in practice. If it *is* chunked, matchingCookieNames below
  // already surfaces the .0/.1 suffixes and matchingCookieOccurrences /
  // duplicateNameDetected reveal that on their own.
  const primary = matches.find((m) => !/\.\d+$/.test(m.name)) ?? matches[0] ?? null;
  const rawValue = primary?.value ?? null;

  const rawCookieExists = Boolean(rawValue && rawValue.length > 0);
  const rawCookieLength = rawValue ? rawValue.length : null;
  const rawValueFingerprint = rawValue ? await sha256Hex(rawValue) : null;
  const hasBase64Prefix = Boolean(rawValue?.startsWith(BASE64_PREFIX));

  let base64DecodeSucceeded = false;
  let decodedJsonString: string | null = null;
  if (rawValue) {
    try {
      decodedJsonString = hasBase64Prefix
        ? stringFromBase64URL(rawValue.slice(BASE64_PREFIX.length))
        : rawValue;
      base64DecodeSucceeded = true;
    } catch {
      base64DecodeSucceeded = false;
    }
  }

  let decodedIsValidJson = false;
  let decodedValueType: string | null = null;
  let decodedLooksLikeVerifier = false;
  let decodedSegmentCount: number | null = null;
  if (decodedJsonString !== null) {
    try {
      const parsed: unknown = JSON.parse(decodedJsonString);
      decodedIsValidJson = true;
      decodedValueType = typeof parsed;
      if (typeof parsed === "string") {
        decodedSegmentCount = parsed.split("/").length;
        decodedLooksLikeVerifier = parsed.includes("/");
      }
    } catch {
      decodedIsValidJson = false;
    }
  }

  // Ground truth: reach into the same GoTrueClient internals
  // exchangeCodeForSession() itself uses. `storage`/`storageKey` are
  // TypeScript-private but plain runtime properties on the compiled
  // client (not real JS #private fields), so this exercises the
  // *actual* chunk-reconstruction + decode path rather than a
  // reimplementation of it that could subtly diverge.
  let storageGetItemResolved = false;
  let storageGetItemLength: number | null = null;
  let finalVerifierResolvable = false;
  try {
    const authInternals = supabase.auth as unknown as {
      storage: { getItem(key: string): Promise<string | null> };
      storageKey: string;
    };
    const storageItem = await authInternals.storage.getItem(`${authInternals.storageKey}-code-verifier`);
    storageGetItemResolved = storageItem !== null && storageItem !== undefined;
    storageGetItemLength = typeof storageItem === "string" ? storageItem.length : null;
    if (storageGetItemResolved && typeof storageItem === "string") {
      try {
        const parsed: unknown = JSON.parse(storageItem);
        if (typeof parsed === "string") {
          const [verifierPart] = parsed.split("/");
          finalVerifierResolvable = Boolean(verifierPart);
        }
      } catch {
        finalVerifierResolvable = false;
      }
    }
  } catch {
    storageGetItemResolved = false;
  }

  return {
    timestamp: new Date().toISOString(),
    hostname: window.location.hostname,
    verifierCookieNameFound: matches.length > 0,
    matchingCookieNames: matches.map((m) => m.name),
    matchingCookieOccurrences: matches.length,
    duplicateNameDetected,
    rawCookieExists,
    rawCookieLength,
    rawValueFingerprint,
    hasBase64Prefix,
    base64DecodeSucceeded,
    decodedIsValidJson,
    decodedValueType,
    decodedLooksLikeVerifier,
    decodedSegmentCount,
    storageGetItemResolved,
    storageGetItemLength,
    finalVerifierResolvable,
  };
}
