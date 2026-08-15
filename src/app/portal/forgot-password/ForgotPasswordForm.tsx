"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/shared/env";
import { validatePasswordResetRequestAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle", error: null, email: null };

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

    setRequesting(true);
    createClient()
      .auth.resetPasswordForEmail(state.email, {
        redirectTo: `${siteUrl()}/portal/reset-password`,
      })
      // Same no-information-leak principle as before: the generic
      // "submitted" result shows regardless of whether Supabase's own
      // call succeeded, so neither branch is distinguishable to a
      // visitor probing for registered emails.
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
