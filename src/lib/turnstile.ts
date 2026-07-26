// Cloudflare Turnstile verification — protects /portal/signup and
// /portal/login from automated abuse. Inert until TURNSTILE_SECRET_KEY is
// set: verifyTurnstileToken() short-circuits to true, and the client
// widget (src/components/TurnstileWidget.tsx) renders nothing when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset. Same "code complete, waiting
// on credentials" pattern already used for Google Sheets
// (src/lib/enquiry/storage.ts) — turning this on later needs only the two
// env vars, no further code change.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // Not configured yet — no-op, matches client widget's own gate.
  if (!token) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch (err) {
    console.error("[turnstile] verification request failed", err);
    return false;
  }
}
