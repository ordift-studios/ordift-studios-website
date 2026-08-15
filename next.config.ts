import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline security headers — Next.js and Vercel don't set these by
// default.
const SECURITY_HEADERS = [
  // Blocks this site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stops browsers from MIME-sniffing a response away from its declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Sends only the origin (not the full URL/path) as a Referer header on cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disables browser features this site never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// TD-004, staging-only CSP (see PRODUCTION_READINESS_RECONCILIATION.md
// §16.4). Deliberately not nonce-based — that would force every page
// onto dynamic rendering, which is a separate, bigger decision than
// "add a CSP." Ran in Report-Only mode first (2026-08-13) with zero
// violations found across every route/embed/auth flow; promoted to
// enforcing mode on staging only (2026-08-15) after that full
// validation pass. Still gated to SITE_ENV=staging below — Production
// is a separate build and never evaluates this function at all.
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCsp(directives: Record<string, (string | null)[]>): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.filter((s): s is string => Boolean(s)).join(" ")}`)
    .join("; ");
}

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const SANITY_MEDIA_ORIGIN = "https://cdn.sanity.io";
// Sanity's own host-communication "bridge" script for Studio, loaded
// from a hashed filename (bridge-<hash>.js) — found as a genuine
// Report-Only violation on /studio; /studio-only, not needed elsewhere.
const SANITY_BRIDGE_ORIGIN = "https://core.sanity-cdn.com";

function stagingCsp(): { main: string; studio: string } | null {
  // Enforcing mode is staging-only — Production gets a completely
  // separate build with SITE_ENV=production, so this never applies
  // there regardless of what happens on this branch.
  if (process.env.SITE_ENV !== "staging") return null;

  // Built from the actual per-environment config, not hardcoded —
  // staging and Production have distinct Supabase projects and Sentry
  // DSNs (confirmed earlier in this engagement), so a literal string
  // here would silently be wrong the moment this pattern is ever
  // reused for Production.
  const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWsOrigin = supabaseOrigin?.replace(/^https:/, "wss:") ?? null;
  const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

  const sharedConnectSrc = ["'self'", supabaseOrigin, supabaseWsOrigin, sentryOrigin, TURNSTILE_ORIGIN];

  const mainCsp = buildCsp({
    "default-src": ["'self'"],
    // No nonce (out of scope for this pass) — 'unsafe-inline' is the
    // documented Next.js fallback for a static, non-nonce CSP. Kept
    // deliberately so this Report-Only pass surfaces genuinely missing
    // third-party origins rather than drowning in expected violations
    // from Next's own inline hydration scripts.
    "script-src": ["'self'", "'unsafe-inline'", TURNSTILE_ORIGIN],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", SANITY_MEDIA_ORIGIN],
    "media-src": ["'self'", SANITY_MEDIA_ORIGIN],
    "font-src": ["'self'"],
    "connect-src": sharedConnectSrc,
    // Turnstile's own challenge iframe, plus the two embed providers
    // portfolio/journal gallery items actually use today (TD-004
    // investigation: the schema's embed field is freeform, so this is
    // a known, separately-tracked gap, not solved here).
    "frame-src": ["'self'", TURNSTILE_ORIGIN, "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Mirrors the existing X-Frame-Options: SAMEORIGIN.
    "frame-ancestors": ["'self'"],
  });

  const sanityApiOrigin = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
    ? "https://api.sanity.io https://*.api.sanity.io"
    : "https://api.sanity.io";
  const sanityApiWsOrigin = sanityApiOrigin
    .split(" ")
    .map((o) => o.replace(/^https:/, "wss:"))
    .join(" ");

  const studioCsp = buildCsp({
    "default-src": ["'self'"],
    // No 'unsafe-eval' added preemptively — if Studio's own tooling
    // needs it, that will show up as an observed script-src violation
    // (see regression report) rather than being assumed here.
    // SANITY_BRIDGE_ORIGIN: confirmed genuine Report-Only violation —
    // Studio loads its host-communication bridge script from here.
    "script-src": ["'self'", "'unsafe-inline'", SANITY_BRIDGE_ORIGIN],
    // Sanity's @sanity/ui runs on styled-components, which injects
    // inline <style> tags with no CSP nonce support — this directive
    // is expected to need 'unsafe-inline' permanently on this route,
    // not just during Report-Only.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", SANITY_MEDIA_ORIGIN],
    "media-src": ["'self'", SANITY_MEDIA_ORIGIN],
    "font-src": ["'self'"],
    "connect-src": [...sharedConnectSrc, sanityApiOrigin, sanityApiWsOrigin],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  });

  return { main: mainCsp, studio: studioCsp };
}

const nextConfig: NextConfig = {
  async headers() {
    const csp = stagingCsp();
    const mainHeaders = csp
      ? [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: csp.main }]
      : SECURITY_HEADERS;
    const studioHeaders = csp
      ? [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: csp.studio }]
      : SECURITY_HEADERS;
    return [
      { source: "/((?!studio).*)", headers: mainHeaders },
      { source: "/studio", headers: studioHeaders },
      { source: "/studio/:path*", headers: studioHeaders },
    ];
  },
  images: {
    // Every real image on the site is Sanity-hosted (see
    // src/components/media/ResponsiveImage.tsx). Resizing is configured
    // here as a global custom loader — rather than a per-instance
    // `loader` prop — because ResponsiveImage is a Server Component and
    // this Next.js version requires custom loader functions to cross
    // the Client Component boundary (loaderFile itself is `"use
    // client"`; see src/lib/media/sanityLoader.ts). Swapping CDNs later
    // still means replacing that one file, not touching any page.
    loader: "custom",
    loaderFile: "./src/lib/media/sanityLoader.ts",
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
};

// Wraps the config to upload source maps to Sentry at build time —
// silently skips that step if SENTRY_AUTH_TOKEN isn't set (e.g. local
// dev, or before the org/project/token are configured), so this is
// safe to leave on unconditionally rather than gating it separately.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
