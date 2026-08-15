"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

// TEMPORARY DIAGNOSTIC (2026-08-15) — remove once the PKCE recovery
// failure is root-caused. Captures only safe, non-secret metadata:
// error name/code/status/message (all short, static, human-readable
// strings from auth-js's own error classes — never the auth code,
// verifier, or any token), a same-origin cookie *presence* check
// (substring match only, never reads the cookie's value), and the
// runtime hostname. None of this is normally shown to visitors.
type Diagnostic = {
  attempt: number;
  hostname: string;
  hasCode: boolean;
  hasHashTokens: boolean;
  verifierCookiePresentBefore: boolean;
  verifierCookiePresentAfter: boolean;
  error: { name: string; code: string | null; status: number | null; message: string } | null;
};

// createBrowserClient (@supabase/ssr) defaults to the PKCE flow, so the
// live recovery link redirects here with a `?code=...` query parameter,
// redeemed via exchangeCodeForSession(). The legacy implicit-flow shape
// (`#access_token=...&refresh_token=...` in the URL *fragment*, never
// sent to the server) is kept as a fallback for compatibility rather
// than assumed — confirmed via code audit (2026-08-15) that this
// project's Supabase clients never override the default flowType.
type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  // Proves (or disproves) whether establishSession's exchange/setSession
  // call runs more than once for a single page load.
  const attemptCount = useRef(0);

  useEffect(() => {
    async function establishSession(): Promise<Status> {
      const supabase = createClient();
      const hasVerifierCookie = () => document.cookie.includes("-code-verifier=");

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        attemptCount.current += 1;
        const attempt = attemptCount.current;
        const verifierCookiePresentBefore = hasVerifierCookie();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        const verifierCookiePresentAfter = hasVerifierCookie();
        // Clear the code out of the URL now that it's been redeemed —
        // no reason to leave it sitting in history.
        window.history.replaceState(null, "", window.location.pathname);
        setDiagnostic({
          attempt,
          hostname: window.location.hostname,
          hasCode: true,
          hasHashTokens: false,
          verifierCookiePresentBefore,
          verifierCookiePresentAfter,
          error: exchangeError
            ? {
                name: exchangeError.name,
                code: exchangeError.code ?? null,
                status: exchangeError.status ?? null,
                message: exchangeError.message,
              }
            : null,
        });
        return exchangeError ? "invalid" : "ready";
      }

      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setDiagnostic({
          attempt: attemptCount.current,
          hostname: window.location.hostname,
          hasCode: false,
          hasHashTokens: false,
          verifierCookiePresentBefore: hasVerifierCookie(),
          verifierCookiePresentAfter: hasVerifierCookie(),
          error: null,
        });
        return "invalid";
      }

      attemptCount.current += 1;
      const attempt = attemptCount.current;
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      // Clear the tokens out of the URL now that the session is
      // established — no reason to leave them sitting in history.
      window.history.replaceState(null, "", window.location.pathname);
      setDiagnostic({
        attempt,
        hostname: window.location.hostname,
        hasCode: false,
        hasHashTokens: true,
        verifierCookiePresentBefore: hasVerifierCookie(),
        verifierCookiePresentAfter: hasVerifierCookie(),
        error: sessionError
          ? {
              name: sessionError.name,
              code: sessionError.code ?? null,
              status: sessionError.status ?? null,
              message: sessionError.message,
            }
          : null,
      });
      return sessionError ? "invalid" : "ready";
    }

    establishSession().then(setStatus);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error("[portal] password update failed", updateError.message);
      setError("Couldn't update your password. Please try again.");
      setPending(false);
      return;
    }

    // Sign out the recovery session deliberately — the client re-signs
    // in with their new password, rather than silently continuing under
    // a session that started from an emailed link.
    await supabase.auth.signOut();
    router.push("/portal/login?passwordReset=1");
  }

  if (status === "checking") {
    return <p className="font-sans text-body-small text-ordift-ink-muted">Checking your link…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="max-w-sm space-y-5">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">
            This reset link is invalid or has expired.
          </p>
        </div>
        {diagnostic && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-1">
            <p className="font-sans text-caption font-semibold text-amber-900">
              Temporary diagnostic (staging investigation only)
            </p>
            <p className="font-sans text-caption text-amber-900">hostname: {diagnostic.hostname}</p>
            <p className="font-sans text-caption text-amber-900">
              mode: {diagnostic.hasCode ? "code (PKCE)" : diagnostic.hasHashTokens ? "hash (implicit)" : "neither"}
            </p>
            <p className="font-sans text-caption text-amber-900">exchange attempt #: {diagnostic.attempt}</p>
            <p className="font-sans text-caption text-amber-900">
              verifier cookie present before: {String(diagnostic.verifierCookiePresentBefore)}
            </p>
            <p className="font-sans text-caption text-amber-900">
              verifier cookie present after: {String(diagnostic.verifierCookiePresentAfter)}
            </p>
            {diagnostic.error && (
              <>
                <p className="font-sans text-caption text-amber-900">error name: {diagnostic.error.name}</p>
                <p className="font-sans text-caption text-amber-900">error code: {diagnostic.error.code ?? "(none)"}</p>
                <p className="font-sans text-caption text-amber-900">error status: {diagnostic.error.status ?? "(none)"}</p>
                <p className="font-sans text-caption text-amber-900">error message: {diagnostic.error.message}</p>
              </>
            )}
          </div>
        )}
        <Link
          href="/portal/forgot-password"
          className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-sm">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="password" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
        />
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">At least 8 characters.</p>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block font-sans text-body-small font-medium text-ordift-ink mb-2"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
        />
      </div>

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
