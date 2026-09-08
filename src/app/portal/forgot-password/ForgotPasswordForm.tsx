"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { createPasswordRecoveryRequestClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/shared/env";
import { validatePasswordResetRequestAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { status: "idle", error: null, email: null };

// Mirrors BookingForm.tsx/RegistrationForm.tsx's gate — without this,
// the submit button stays permanently disabled in any environment
// where NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (TurnstileWidget
// renders nothing, so onVerify never fires), with no error shown.
const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// Missing-success-confirmation fix (2026-09-09) — replaces the
// previous two overlapping booleans (`requesting`/`submitted`) with a
// single, explicit status. Not a change in what triggers success —
// the actual resetPasswordForEmail() call and its completion are the
// same as before — but a single enum makes it structurally impossible
// for the "sent" view to be skipped or shown only fleetingly: once
// `uiStatus` becomes "sent" it stays "sent" (nothing here ever
// transitions it back to "form"), and the render logic below has
// exactly one branch per status, not an assembled combination of
// independent booleans that could disagree with each other.
type UiStatus = "form" | "sending" | "sent";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(validatePasswordResetRequestAction, initialState);
  // Same submit-gating + forced-fresh-challenge pattern as LoginForm.tsx
  // — added 2026-08-10 (Workstream I security re-review): this was the
  // one auth-adjacent form with no CAPTCHA at all.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [prevState, setPrevState] = useState(state);
  const [uiStatus, setUiStatus] = useState<UiStatus>("form");
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

    const redirectTo = `${siteUrl()}/portal/reset-password`;

    setUiStatus("sending");
    // Root-cause fix (2026-09-09) — uses the dedicated implicit-flow
    // client (createPasswordRecoveryRequestClient(), see its own
    // comment in src/lib/supabase/client.ts) instead of the regular
    // createClient(), specifically so the emailed recovery link is
    // self-contained and doesn't depend on this browser's own cookies
    // still being present when the link is opened.
    createPasswordRecoveryRequestClient()
      .auth.resetPasswordForEmail(state.email, { redirectTo })
      // Same no-information-leak principle as before: the generic
      // "sent" result shows regardless of whether Supabase's own call
      // succeeded, so neither branch is distinguishable to a visitor
      // probing for registered emails. Deliberately unconditional —
      // this .finally() (not a .then()/.catch() split) is what
      // guarantees "sent" is reached even if the call rejects.
      .finally(() => {
        setUiStatus("sent");
      });
  }, [state]);

  if (uiStatus === "sent") {
    return (
      <div className="max-w-sm space-y-5">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="font-sans text-body-small text-ordift-ink">
            Password reset link sent. If an account exists for that email address, check your inbox (and spam
            folder) for a message from Ordift Studios.
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
        disabled={pending || uiStatus === "sending" || (turnstileRequired && !turnstileToken)}
        className="w-full"
      >
        {pending || uiStatus === "sending" ? "Sending…" : "Send reset link"}
      </Button>

      <p className="font-sans text-body-small text-ordift-ink-muted text-center">
        <Link href="/portal/login" className="text-ordift-gold-pressed underline underline-offset-4">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
