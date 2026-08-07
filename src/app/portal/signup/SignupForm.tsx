"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";
import { signUpAction, type SignupState } from "./actions";

const initialState: SignupState = { error: null };

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  // Turnstile still relies on Cloudflare's implicit hidden-field
  // injection for the actual server-side check (see
  // TurnstileWidget.tsx's doc comment) — this token is only tracked
  // client-side to gate the submit button, so a click can't fire
  // before the widget has actually finished its challenge (the same
  // pattern BookingForm.tsx/RegistrationForm.tsx already use).
  const [turnstileToken, setTurnstileToken] = useState("");

  return (
    <form action={formAction} className="space-y-5 max-w-sm">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="fullName" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
        />
      </div>

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
        <label htmlFor="password" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
        />
        <p className="mt-1.5 font-sans text-caption text-ordift-ink-muted">At least 8 characters.</p>
      </div>

      <TurnstileWidget
        onVerify={(token) => setTurnstileToken(token)}
        onExpire={() => setTurnstileToken("")}
      />

      <Button type="submit" variant="primary" disabled={pending || !turnstileToken} className="w-full">
        {pending ? "Creating account…" : "Create Account"}
      </Button>

      <p className="font-sans text-body-small text-ordift-ink-muted text-center">
        Already have an account?{" "}
        <Link href="/portal/login" className="text-ordift-gold-pressed underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
