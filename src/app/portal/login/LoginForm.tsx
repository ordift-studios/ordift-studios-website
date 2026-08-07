"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginForm({
  next,
  passwordReset,
}: {
  next: string;
  passwordReset?: boolean;
}) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  // Same submit-gating fix as SignupForm.tsx — see that file's comment.
  const [turnstileToken, setTurnstileToken] = useState("");

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
        onVerify={(token) => setTurnstileToken(token)}
        onExpire={() => setTurnstileToken("")}
      />

      <Button type="submit" variant="primary" disabled={pending || !turnstileToken} className="w-full">
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
