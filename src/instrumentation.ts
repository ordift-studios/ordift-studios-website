import * as Sentry from "@sentry/nextjs";

// Production error monitoring (Version 1.0.5 Workstream C). Inert until
// SENTRY_DSN is set — no DSN means Sentry.init() no-ops, matching the
// same "inert until configured" pattern already used for Turnstile.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.SITE_ENV ?? "development",
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.SITE_ENV ?? "development",
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
