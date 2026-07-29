// Cloudflare Turnstile verification — protects every publicly accessible
// form capable of creating a record or triggering an email:
// /portal/signup, /portal/login, Contact Enquiry (/book), and Workshop
// Registration. Inert until TURNSTILE_SECRET_KEY is set: verifyTurnstileToken()
// short-circuits to true, and the client widget
// (src/components/TurnstileWidget.tsx) renders nothing when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset. Same "code complete, waiting
// on credentials" pattern already used for Google Sheets
// (src/lib/enquiry/storage.ts) — turning this on later needs only the two
// env vars, no further code change.
//
// Server-side only — the secret key must never reach client code (never
// prefixed NEXT_PUBLIC_, never returned in any API response).

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
};

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

// Cloudflare returns the same "timeout-or-duplicate" error code for both
// an expired token and a token that's already been redeemed once — a
// token is single-use by design, so there's no separate "expired" vs
// "reused" distinction to make on our side; both are simply invalid on
// this second attempt.
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // Not configured yet — no-op, matches client widget's own gate.
  if (!token) {
    console.warn("[turnstile] rejected: no token provided");
    return false;
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    const result = (await response.json()) as SiteverifyResponse;
    if (!result.success) {
      console.warn("[turnstile] rejected:", result["error-codes"]?.join(", ") ?? "unknown");
    }
    return result.success === true;
  } catch (err) {
    console.error("[turnstile] verification request failed", err);
    return false;
  }
}
