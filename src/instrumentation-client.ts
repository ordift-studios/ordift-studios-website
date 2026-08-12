import * as Sentry from "@sentry/nextjs";

// Client-side half of production error monitoring (Version 1.0.5
// Workstream C). Same inert-until-configured behavior as the server
// side in instrumentation.ts — Sentry.init() no-ops without a DSN.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // NODE_ENV is "production" on every optimized Vercel build, staging
  // included — it can't distinguish which deployment an event came from.
  // NEXT_PUBLIC_SITE_ENV mirrors the server-only SITE_ENV already used
  // correctly in instrumentation.ts (TD-032).
  environment: process.env.NEXT_PUBLIC_SITE_ENV ?? "development",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
