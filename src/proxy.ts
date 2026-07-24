import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

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
 * staging deployment (any non-localhost hostname) stays fully gated.
 */
export async function proxy(request: NextRequest) {
  if (process.env.SITE_ENV === "staging" && !LOCAL_HOSTNAMES.has(request.nextUrl.hostname)) {
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

  // Session refresh (Version 1.3) — also redirects unauthenticated
  // /portal/** requests to /portal/login. Runs after the staging gate
  // above so a blocked staging visitor never even reaches this check.
  const { response } = await updateSession(request);

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
