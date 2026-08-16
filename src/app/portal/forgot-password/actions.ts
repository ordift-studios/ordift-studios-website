"use server";

import { checkRateLimit, getClientIp } from "@/lib/shared/rateLimit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export type ForgotPasswordState = {
  status: "idle" | "error" | "validated";
  error: string | null;
  email: string | null;
};

// Turnstile + rate-limit validation only — the actual
// supabase.auth.resetPasswordForEmail() call happens client-side (see
// ForgotPasswordForm.tsx) so its PKCE code_verifier persists in a
// cookie the browser can read back. @supabase/ssr's server client only
// flushes storage writes to real Set-Cookie headers on a narrow set of
// auth events (SIGNED_IN, TOKEN_REFRESHED, etc.) that
// resetPasswordForEmail() never fires, so calling it from here would
// silently lose the verifier — confirmed by tracing @supabase/ssr's
// createServerClient.js and auth-js's GoTrueClient.js (2026-08-15).
// This action's only job is to gate the request before the browser is
// allowed to proceed, exactly as before.
export async function validatePasswordResetRequestAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { status: "error", error: "Enter your email address.", email: null };
  }

  const rateLimit = await checkRateLimit(`forgot-password:${await getClientIp()}`);
  if (!rateLimit.allowed) {
    return { status: "error", error: "Too many attempts. Please try again shortly.", email: null };
  }

  const turnstileOk = await verifyTurnstileToken(
    String(formData.get("cf-turnstile-response") ?? "") || null
  );
  if (!turnstileOk) {
    return { status: "error", error: "Verification failed. Please try again.", email: null };
  }

  return { status: "validated", error: null, email };
}
