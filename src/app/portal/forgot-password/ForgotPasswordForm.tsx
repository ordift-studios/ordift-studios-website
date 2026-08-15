"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/shared/env";
import { validatePasswordResetRequestAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle", error: null, email: null };

// TEMPORARY DIAGNOSTIC (2026-08-15) — remove once the PKCE recovery
// investigation is closed. Companion to ResetPasswordForm.tsx's
// diagnostic block: this one observes the *origin* side (immediately
// after resetPasswordForEmail() resolves) instead of the callback
// side. Only presence of the verifier cookie is checked (substring
// match on the cookie name), never its value. The Supabase error
// object's name/code/status/message are auth-js's own short, static,
// non-secret classification strings (e.g. "captcha_failed") — never a
// token, verifier, authorization code, session, or API key. The
// Supabase project hostname is derived from NEXT_PUBLIC_SUPABASE_URL,
// which is already public in the client bundle to any visitor
// regardless of this diagnostic.
type OriginDiagnostic = {
  requestExecuted: boolean;
  resetResult: "success" | "error";
  errorName: string | null;
  errorCode: string | null;
  errorStatus: number | null;
  errorMessage: string | null;
  captchaTokenSupplied: boolean;
  redirectToHostname: string;
  redirectToPath: string;
  supabaseProjectHostname: string;
  hostname: string;
  storageMechanism: string;
  verifierPresentImmediately: boolean;
  verifierPresentAfterDelay: boolean;
};

// Mirrors BookingForm.tsx/RegistrationForm.tsx's gate — without this,
// the submit button stays permanently disabled in any environment
// where NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (TurnstileWidget
// renders nothing, so onVerify never fires), with no error shown.
const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(validatePasswordResetRequestAction, initialState);
  // Same submit-gating + forced-fresh-challenge pattern as LoginForm.tsx
  // — added 2026-08-10 (Workstream I security re-review): this was the
  // one auth-adjacent form with no CAPTCHA at all.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [prevState, setPrevState] = useState(state);
  const [requesting, setRequesting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [originDiagnostic, setOriginDiagnostic] = useState<OriginDiagnostic | null>(null);
  // Guards against re-firing the Supabase call if this same "validated"
  // state object is seen again across re-renders (React effect
  // semantics, not a real second submission — `state` is otherwise
  // referentially stable until the next action dispatch).
  const handledState = useRef<ForgotPasswordState | null>(null);

  if (state !== prevState) {
    setPrevState(state);
    if (state.status === "error") setTurnstileToken("");
  }

  useEffect(() => {
    if (state.status !== "validated" || !state.email) return;
    if (handledState.current === state) return;
    handledState.current = state;

    const hasVerifierCookie = () => document.cookie.includes("-code-verifier=");
    const redirectTo = `${siteUrl()}/portal/reset-password`;
    const supabaseProjectHostname = (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
      } catch {
        return "(unresolvable)";
      }
    })();

    setRequesting(true);
    createClient()
      .auth.resetPasswordForEmail(state.email, { redirectTo })
      // Same no-information-leak principle as before: the generic
      // "submitted" result shows regardless of whether Supabase's own
      // call succeeded, so neither branch is distinguishable to a
      // visitor probing for registered emails.
      .then(async ({ error: resetError }) => {
        const verifierPresentImmediately = hasVerifierCookie();
        // Await the re-check in-line (rather than a detached
        // setTimeout) so the diagnostic box only ever renders once
        // both values are fully resolved — never stuck on "checking".
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const verifierPresentAfterDelay = hasVerifierCookie();
        let redirectToHostname = "(unresolvable)";
        let redirectToPath = "(unresolvable)";
        try {
          const parsed = new URL(redirectTo);
          redirectToHostname = parsed.hostname;
          redirectToPath = parsed.pathname;
        } catch {
          // leave as unresolvable
        }
        setOriginDiagnostic({
          requestExecuted: true,
          resetResult: resetError ? "error" : "success",
          errorName: resetError?.name ?? null,
          errorCode: resetError?.code ?? null,
          errorStatus: resetError?.status ?? null,
          errorMessage: resetError?.message ?? null,
          captchaTokenSupplied: false, // this call passes no options.captchaToken
          redirectToHostname,
          redirectToPath,
          supabaseProjectHostname,
          hostname: window.location.hostname,
          storageMechanism: "document.cookie (createBrowserClient default)",
          verifierPresentImmediately,
          verifierPresentAfterDelay,
        });
      })
      .finally(() => {
        setRequesting(false);
        setSubmitted(true);
      });
  }, [state]);

  if (submitted) {
    return (
      <div className="max-w-sm space-y-5">
        <div className="rounded-lg border border-black/10 bg-ordift-offwhite px-4 py-3">
          <p className="font-sans text-body-small text-ordift-ink">
            If an account exists for that email address, we&apos;ve sent a link to reset your
            password. Check your inbox (and spam folder).
          </p>
        </div>
        {originDiagnostic && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-1">
            <p className="font-sans text-caption font-semibold text-amber-900">
              Temporary diagnostic (staging investigation only)
            </p>
            <p className="font-sans text-caption text-amber-900">
              reset request executed: {String(originDiagnostic.requestExecuted)}
            </p>
            <p className="font-sans text-caption text-amber-900">
              Supabase reset result: {originDiagnostic.resetResult}
            </p>
            {originDiagnostic.resetResult === "error" && (
              <>
                <p className="font-sans text-caption text-amber-900">error name: {originDiagnostic.errorName}</p>
                <p className="font-sans text-caption text-amber-900">error code: {originDiagnostic.errorCode ?? "(none)"}</p>
                <p className="font-sans text-caption text-amber-900">
                  error status: {originDiagnostic.errorStatus ?? "(none)"}
                </p>
                <p className="font-sans text-caption text-amber-900">error message: {originDiagnostic.errorMessage}</p>
              </>
            )}
            <p className="font-sans text-caption text-amber-900">
              captcha token supplied to Supabase: {String(originDiagnostic.captchaTokenSupplied)}
            </p>
            <p className="font-sans text-caption text-amber-900">
              redirectTo: {originDiagnostic.redirectToHostname}
              {originDiagnostic.redirectToPath}
            </p>
            <p className="font-sans text-caption text-amber-900">
              Supabase project hostname: {originDiagnostic.supabaseProjectHostname}
            </p>
            <p className="font-sans text-caption text-amber-900">page hostname: {originDiagnostic.hostname}</p>
            <p className="font-sans text-caption text-amber-900">
              storage mechanism: {originDiagnostic.storageMechanism}
            </p>
            <p className="font-sans text-caption text-amber-900">
              verifier present immediately after request: {String(originDiagnostic.verifierPresentImmediately)}
            </p>
            <p className="font-sans text-caption text-amber-900">
              verifier present ~2s later (same page): {String(originDiagnostic.verifierPresentAfterDelay)}
            </p>
          </div>
        )}
        <Link
          href="/portal/login"
          className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5 max-w-sm">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{state.error}</p>
        </div>
      )}

      <p className="font-sans text-body-small text-ordift-ink-muted">
        Enter the email address on your account and we&apos;ll send you a link to reset your
        password.
      </p>

      <div>
        <label htmlFor="email" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
        />
      </div>

      <TurnstileWidget
        resetSignal={state}
        onVerify={(token) => setTurnstileToken(token)}
        onExpire={() => setTurnstileToken("")}
      />

      {turnstileRequired && !turnstileToken && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Complete the verification above to continue.
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending || requesting || (turnstileRequired && !turnstileToken)}
        className="w-full"
      >
        {pending || requesting ? "Sending…" : "Send reset link"}
      </Button>

      <p className="font-sans text-body-small text-ordift-ink-muted text-center">
        <Link href="/portal/login" className="text-ordift-gold-pressed underline underline-offset-4">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
