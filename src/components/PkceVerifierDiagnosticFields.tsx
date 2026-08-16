// TEMPORARY STAGING-ONLY DIAGNOSTIC (2026-08-16) — shared render for
// PkceVerifierDiagnostic (see src/lib/testing/pkceVerifierDiagnostics.ts).
// Used by ForgotPasswordForm.tsx and ResetPasswordForm.tsx so a capture
// taken on one page is displayed identically to a capture taken on the
// other, making the two directly comparable. Delete alongside that
// module once the PKCE recovery investigation is closed.

import type { PkceVerifierDiagnostic } from "@/lib/testing/pkceVerifierDiagnostics";

export default function PkceVerifierDiagnosticFields({
  label,
  diagnostic,
}: {
  label: string;
  diagnostic: PkceVerifierDiagnostic;
}) {
  return (
    <div className="space-y-0.5">
      <p className="font-sans text-caption font-semibold text-amber-900 mt-2">
        verifier diagnostic ({label}) — {diagnostic.timestamp}
      </p>
      <p className="font-sans text-caption text-amber-900">
        verifier cookie name found: {String(diagnostic.verifierCookieNameFound)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        matching cookie name(s): {diagnostic.matchingCookieNames.length > 0 ? diagnostic.matchingCookieNames.join(", ") : "(none)"}
      </p>
      <p className="font-sans text-caption text-amber-900">
        occurrences in document.cookie: {diagnostic.matchingCookieOccurrences}
      </p>
      <p className="font-sans text-caption text-amber-900">
        duplicate name detected: {String(diagnostic.duplicateNameDetected)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        raw cookie exists: {String(diagnostic.rawCookieExists)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        raw cookie length: {diagnostic.rawCookieLength ?? "(n/a)"}
      </p>
      <p className="font-sans text-caption text-amber-900">
        raw value fingerprint (sha-256): {diagnostic.rawValueFingerprint ?? "(n/a)"}
      </p>
      <p className="font-sans text-caption text-amber-900">
        has base64- prefix: {String(diagnostic.hasBase64Prefix)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        base64url decode succeeded: {String(diagnostic.base64DecodeSucceeded)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        decoded content is valid JSON: {String(diagnostic.decodedIsValidJson)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        decoded value type: {diagnostic.decodedValueType ?? "(n/a)"}
      </p>
      <p className="font-sans text-caption text-amber-900">
        decoded looks like verifier/redirectType shape: {String(diagnostic.decodedLooksLikeVerifier)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        decoded segment count: {diagnostic.decodedSegmentCount ?? "(n/a)"}
      </p>
      <p className="font-sans text-caption text-amber-900">
        Supabase storage.getItem resolved: {String(diagnostic.storageGetItemResolved)}
      </p>
      <p className="font-sans text-caption text-amber-900">
        Supabase storage.getItem length: {diagnostic.storageGetItemLength ?? "(n/a)"}
      </p>
      <p className="font-sans text-caption font-semibold text-amber-900">
        would exchangeCodeForSession find a verifier: {String(diagnostic.finalVerifierResolvable)}
      </p>
    </div>
  );
}
