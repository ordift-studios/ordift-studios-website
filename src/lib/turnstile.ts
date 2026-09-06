// Cloudflare Turnstile verification — protects every publicly accessible
// form capable of creating a record or triggering an email:
// /portal/signup, /portal/login, /portal/forgot-password (added
// 2026-08-10, Workstream I security re-review — this one anonymous,
// email-triggering form had no CAPTCHA at all), Contact Enquiry
// (/book), and Workshop Registration. Inert until TURNSTILE_SECRET_KEY
// is set: verifyTurnstileToken()
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

// Tier 1 Hardening, Batch C (2026-09-06) — replaces the old, coarser
// turnstileConfigured() (unused anywhere, now removed). The old
// verifyTurnstileToken() treated "secret key absent" as a single
// no-op case, matching the client widget's "site key absent → render
// nothing" gate — correct ONLY when both are absent together, e.g. a
// local dev environment with no Turnstile credentials at all. But the
// two vars can fall out of sync independently (an accidental Vercel
// env deletion, a half-configured new environment): if the site key is
// still present, the client widget still renders, real visitors still
// submit a token, and treating that as "disabled" would silently
// accept every submission with zero verification actually performed —
// exactly the dangerous state to fail closed on instead. The reverse
// (secret present, site key absent) is equally invalid and must not be
// read as "intentionally disabled" either, per explicit design
// instruction — a real token can never be produced without a rendered
// widget, so any submission reaching the server in that state is
// already suspect.
//
// Genuine full-outage/network-failure handling is deliberately
// UNCHANGED below — that path already failed closed (returns false)
// before this change and is not part of this correction; failing
// closed on a real Cloudflare outage is the correct, standard behavior
// for any challenge/response control (the alternative — accepting
// everything during a provider outage — defeats the point of having
// one), and TurnstileWidget.tsx's Try Again button (Phase K.2C)
// already gives a real visitor a fast, no-reload recovery path for a
// transient version of that.
export type TurnstileConfigState = "disabled" | "enabled" | "misconfigured";

export function turnstileConfigState(): TurnstileConfigState {
  const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const hasSecretKey = Boolean(process.env.TURNSTILE_SECRET_KEY);
  if (!hasSiteKey && !hasSecretKey) return "disabled";
  if (hasSiteKey && hasSecretKey) return "enabled";
  return "misconfigured";
}

// Cloudflare returns the same "timeout-or-duplicate" error code for both
// an expired token and a token that's already been redeemed once — a
// token is single-use by design, so there's no separate "expired" vs
// "reused" distinction to make on our side; both are simply invalid on
// this second attempt.
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const state = turnstileConfigState();
  if (state === "disabled") return true; // Both vars absent together — a deliberately Turnstile-free environment (e.g. local dev), matches the client widget's own gate.
  if (state === "misconfigured") {
    // Never log which variable specifically, or any value — presence/absence only, no secret material.
    console.error("[turnstile] misconfigured: site key and secret key presence do not agree — rejecting to fail safe");
    return false;
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY as string;
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
