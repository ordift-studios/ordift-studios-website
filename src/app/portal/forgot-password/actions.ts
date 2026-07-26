"use server";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/shared/env";

export type ForgotPasswordState = { submitted: boolean; error: string | null };

// Always returns the same generic "submitted" result regardless of
// whether the email is registered — same no-information-leak principle
// as signInAction's generic "Invalid email or password." error.
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { submitted: false, error: "Enter your email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/portal/reset-password`,
  });
  if (error) {
    console.error("[portal] password reset request failed", error.message);
  }

  return { submitted: true, error: null };
}
