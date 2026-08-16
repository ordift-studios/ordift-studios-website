import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

// Narrow Basic-Auth exemption (2026-08-07) — Paystack's webhook
// delivery system has no way to send the staging Basic-Auth header, so
// without this exemption a real webhook POST would 401 before ever
// reaching the handler. Exempted from Basic Auth ONLY — every other
// protection stays in force: HMAC-SHA512 Paystack signature
// verification, the replay/age window, idempotency (fails closed),
// amount/currency validation, and payment_webhook_events audit
// logging all still run exactly as before, inside the route itself
// (src/app/api/payments/webhook/paystack/route.ts). Deliberately an
// exact-path match, not a prefix — /api/payments/** and /api/** stay
// fully gated.
//
// /portal/reset-password (2026-08-16) — the only page in the portal
// meant to be reached by a not-yet-authenticated external visitor
// (someone clicking a real password-recovery email). Without this
// exemption, the staging Basic-Auth gate can re-challenge mid-flow
// (e.g. via background same-origin Link-prefetch requests the NavBar
// issues) and interrupt an in-progress Supabase recovery session. With
// no valid `?code=`, this route only ever renders a static
// "invalid or expired" message, so exempting it exposes nothing.
const BASIC_AUTH_EXEMPT_PATHS = new Set(["/api/payments/webhook/paystack", "/portal/reset-password"]);

// Roles allowed to bypass the holding page below and see the real
// production site while it's gated — the same roles that already gate
// /admin (see isStaffOrAdmin in src/lib/portal/roles.ts).
const HOLDING_PAGE_BYPASS_ROLES = new Set(["staff", "admin", "super_admin"]);

/**
 * Staging access gate (Plan Part J). Next.js 16 renamed `middleware.ts` to
 * `proxy.ts` — this is that file, not legacy middleware.
 *
 * When SITE_ENV=staging: require HTTP Basic Auth on every request and mark
 * every response noindex, so a *deployed* staging site can never be reached
 * or indexed by the public. In production this function is a no-op
 * passthrough.
 *
 * Localhost is exempt from the Basic Auth requirement (2026-07-23) — the
 * dev server isn't publicly reachable, so the gate's actual purpose
 * (blocking public/search-engine access) doesn't apply there, and
 * requiring it locally only pushed toward embedding credentials in
 * preview URLs (`user:pass@localhost`), which is its own bad practice —
 * browsers warn on it and it risks leaking into history/logs. The real
 * staging deployment (any non-localhost hostname) stays fully gated,
 * except the one exact path in BASIC_AUTH_EXEMPT_PATHS above (the
 * Paystack webhook — see that constant's comment for why).
 */
export async function proxy(request: NextRequest) {
  const basicAuthExempt = BASIC_AUTH_EXEMPT_PATHS.has(request.nextUrl.pathname);

  if (process.env.SITE_ENV === "staging" && !LOCAL_HOSTNAMES.has(request.nextUrl.hostname) && !basicAuthExempt) {
    const expectedUser = process.env.STAGING_BASIC_AUTH_USER;
    const expectedPass = process.env.STAGING_BASIC_AUTH_PASS;

    // Fail closed: if staging is misconfigured without credentials, block
    // rather than silently allow public access to a staging deployment.
    if (!expectedUser || !expectedPass) {
      return new NextResponse("Staging is not configured correctly.", {
        status: 503,
      });
    }

    const authHeader = request.headers.get("authorization");
    let authorized = false;
    if (authHeader?.startsWith("Basic ")) {
      const decoded = atob(authHeader.slice("Basic ".length));
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      authorized = user === expectedUser && pass === expectedPass;
    }

    if (!authorized) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Ordift Studios Staging"' },
      });
    }
  }

  // Canonical domain redirect (Milestone 0, Phase 2) — www.ordiftstudios.com
  // 308-redirects to the apex, preserving path and query. Handled in
  // application code rather than a Vercel dashboard toggle so it's
  // portable, testable, and verifiable the same way as everything else
  // here. Scoped narrowly to an actual "www." host, so this can never
  // fire for staging, localhost, or the *.vercel.app fallback domain.
  if (request.nextUrl.hostname === "www.ordiftstudios.com") {
    const url = request.nextUrl.clone();
    url.hostname = "ordiftstudios.com";
    return NextResponse.redirect(url, 308);
  }

  // Session refresh (Version 1.3) — also redirects unauthenticated
  // /portal/** requests to /portal/login. Runs after the staging gate
  // above so a blocked staging visitor never even reaches this check.
  // Moved ahead of the holding-page block below (2026-08-06) so that
  // block can check the caller's session before deciding whether to
  // rewrite — see HOLDING_PAGE_BYPASS_ROLES.
  const { response, user, supabase } = await updateSession(request);

  // Temporary launch holding page (Milestone 0, Phase 3). When
  // LAUNCH_HOLDING_PAGE=true, every public route rewrites to
  // /coming-soon instead of the real site — used only for the window
  // between the domain first pointing at this deployment and launch
  // readiness (Phase 5) actually being verified. /studio, /admin,
  // /portal, and /api stay reachable throughout so staff/content work
  // and verification can continue behind the holding page. Off by
  // default (unset env var) — nothing changes until this is explicitly
  // turned on in production.
  const HOLDING_PAGE_ALLOWLIST = ["/coming-soon", "/studio", "/admin", "/portal", "/api", "/robots.txt", "/sitemap.xml"];
  if (
    process.env.LAUNCH_HOLDING_PAGE === "true" &&
    !HOLDING_PAGE_ALLOWLIST.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    // Admin preview bypass (2026-08-06): an authenticated staff/admin/
    // super_admin session lets the real site through instead of
    // /coming-soon, so the team can review the actual production
    // deployment while it stays hidden from everyone else. Reuses the
    // existing Supabase session + roles table — no separate password,
    // no new cookie. Fails closed on any error, missing session, or
    // unrecognized role: same /coming-soon rewrite as today.
    let authorized = false;
    if (user && supabase) {
      try {
        const [{ data: profile }, { data: userRoles }] = await Promise.all([
          supabase.from("profiles").select("access_status, access_expires_at").eq("id", user.id).maybeSingle(),
          supabase.from("user_roles").select("roles(slug)").eq("user_id", user.id),
        ]);

        const accessStatus = profile?.access_status ?? "active";
        const expired = Boolean(profile?.access_expires_at && new Date(profile.access_expires_at) <= new Date());

        if (accessStatus === "active" && !expired) {
          const roleSlugs = (userRoles ?? [])
            .map((r) => (r.roles as unknown as { slug: string } | null)?.slug)
            .filter((slug): slug is string => Boolean(slug));
          authorized = roleSlugs.some((slug) => HOLDING_PAGE_BYPASS_ROLES.has(slug));
        }
      } catch (err) {
        console.error("[proxy] Holding-page bypass check failed, falling back to Coming Soon", err);
        authorized = false;
      }
    }

    if (authorized) {
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/coming-soon";
    return NextResponse.rewrite(url);
  }

  if (process.env.SITE_ENV === "staging" && !LOCAL_HOSTNAMES.has(request.nextUrl.hostname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every request path except static asset files, so the gate
     * covers pages, the CMS at /studio, and API routes alike. Static
     * files (images, fonts, etc.) are excluded by extension — not just
     * `_next/*` — because Next's own image optimizer fetches `/public`
     * source files internally, and the auth gate was blocking that fetch
     * (surfaced as broken `next/image` renders in the component
     * showcase). This is a deliberate, narrow trade-off: raw asset bytes
     * are reachable without a guessed exact URL, but the HTML pages that
     * would let someone discover those URLs stay fully gated — see
     * STAGING.md.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|woff|woff2|ttf|mp4|webm)$).*)",
  ],
};
