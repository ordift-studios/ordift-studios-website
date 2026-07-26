"use client";

import { useActionState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import { requestPasswordResetAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { submitted: false, error: null };

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.submitted) {
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

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="font-sans text-body-small text-ordift-ink-muted text-center">
        <Link href="/portal/login" className="text-ordift-gold-pressed underline underline-offset-4">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
