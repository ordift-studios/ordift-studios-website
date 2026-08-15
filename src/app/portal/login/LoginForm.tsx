"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

// Mirrors BookingForm.tsx/RegistrationForm.tsx's gate — without this,
// the submit button stays permanently disabled in any environment
// where NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (TurnstileWidget
// renders nothing, so onVerify never fires), with no error shown.
const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function LoginForm({
  next,
  passwordReset,
  confirmEmail,
}: {
  next: string;
  passwordReset?: boolean;
  confirmEmail?: boolean;
}) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  // Same submit-gating fix as SignupForm.tsx — see that file's comment.
  const [turnstileToken, setTurnstileToken] = useState("");

  // A failed attempt (wrong password, etc.) must force a fresh
  // Turnstile challenge before the next retry — a token is single-use,
  // so silently allowing a retry with the same one produces a
  // misleading "Verification failed" even when the real problem was
  // something else entirely. See TurnstileWidget.tsx's resetSignal doc.
  // Reset during render (React's documented "adjusting state when a
  // prop changes" pattern), not in an effect — avoids an extra
  // cascading render for what's ultimately synchronous, derived state.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.error) setTurnstileToken("");
  }

  return (
    <form action={formAction} className="space-y-5 max-w-sm">
      <input type="hidden" name="next" value={next} />

      {passwordReset && !state.error && (
        <div className="rounded-lg border border-black/10 bg-ordift-offwhite px-4 py-3">
          <p className="font-sans text-body-small text-ordift-ink">
            Your password has been updated. Sign in with your new password.
          </p>
        </div>
      )}

      {confirmEmail && !state.error && (
        <div className="rounded-lg border border-black/10 bg-ordift-offwhite px-4 py-3">
          <p className="font-sans text-body-small text-ordift-ink">
            Account created. Check your email to confirm your address before signing in.
          </p>
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{state.error}</p>
        </div>
      )}

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

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="password" className="block font-sans text-body-small font-medium text-ordift-ink">
            Password
          </label>
          <Link
            href="/portal/forgot-password"
            className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
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
        disabled={pending || (turnstileRequired && !turnstileToken)}
        className="w-full"
      >
        {pending ? "Signing in…" : "Sign In"}
      </Button>

      <p className="font-sans text-body-small text-ordift-ink-muted text-center">
        New here?{" "}
        <Link href="/portal/signup" className="text-ordift-gold-pressed underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
