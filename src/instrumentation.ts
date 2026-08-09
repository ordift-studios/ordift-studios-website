import * as Sentry from "@sentry/nextjs";

// Production error monitoring (Version 1.0.5 Workstream C). Inert until
// SENTRY_DSN is set — no DSN means Sentry.init() no-ops, matching the
// same "inert until configured" pattern already used for Turnstile.
//
// debug is temporarily forced on staging only (2026-08-09) while
// diagnosing why a deliberately-triggered test exception never reached
// Sentry's dashboard — Vercel runtime logs already surfaced one real
// "Invalid Sentry Dsn" parse failure this session, and debug mode
// surfaces the SDK's own transport/send diagnostics for the rest.
// Remove once Sentry is confirmed working; never runs in Production
// regardless (SITE_ENV is unset/"production" there).
const debug = process.env.SITE_ENV === "staging";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.SITE_ENV ?? "development",
      debug,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.SITE_ENV ?? "development",
      debug,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
