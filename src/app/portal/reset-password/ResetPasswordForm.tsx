"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { parseRecoveryLink } from "./parseRecoveryLink";

// Password-recovery root-cause fix (2026-09-09) — real Production
// failure, traced directly through @supabase/auth-js's own source
// rather than assumed: the actual cause lives in
// src/lib/supabase/client.ts's createPasswordRecoveryRequestClient()
// (see its own extensive comment) — the PKCE flow forced on the
// regular browser client makes resetPasswordForEmail() bind the
// recovery link to a code_verifier stored in the REQUESTING browser's
// own cookies, which the email link then needs again to redeem —
// something a genuine password-recovery flow can never guarantee,
// since the link is opened via email, often on a different browser or
// device entirely. Fixing the REQUEST side (using implicit flow there
// instead) means this page's already-correct fragment-handling path is
// what actually gets exercised for a real link going forward. The
// `code`/`token_hash` paths remain as fallbacks — reading the actual
// format is delegated to the pure, independently-tested
// parseRecoveryLink() (see its own file and tests) rather than parsed
// inline here.
type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    async function establishSession(): Promise<Status> {
      const supabase = createClient();
      const parsed = parseRecoveryLink(window.location.search, window.location.hash);

      let sessionError: { message: string } | null;
      switch (parsed.kind) {
        case "code": {
          ({ error: sessionError } = await supabase.auth.exchangeCodeForSession(parsed.code));
          break;
        }
        case "token_hash": {
          ({ error: sessionError } = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: "recovery" }));
          break;
        }
        case "fragment": {
          ({ error: sessionError } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken }));
          break;
        }
        case "none":
          // Genuinely nothing to try — never a premature "invalid"
          // while a real check is still in flight, since no async call
          // was ever started in this branch.
          return "invalid";
      }

      // Clear whatever recovery data was in the URL now that it's been
      // consumed (or definitively failed) — no reason to leave it
      // sitting in history either way.
      window.history.replaceState(null, "", window.location.pathname);
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
    return <p className="font-sans text-body-small text-ordift-ink-muted">Verifying reset link…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="max-w-sm space-y-5">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">
            This reset link is invalid or has expired.
          </p>
        </div>
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
