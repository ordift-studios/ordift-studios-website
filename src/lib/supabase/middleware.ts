import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request (access tokens
// are short-lived; without this, a session silently expires mid-visit).
// Called from proxy.ts so it runs before the Basic Auth gate's various
// return paths, using the same response object so cookie updates aren't
// lost. Also enforces the one thing worth checking at the middleware
// layer: /portal/** requires *a* session at all. Which role can see
// which sub-route is a per-page check (needs a DB query, not just JWT
// presence — kept out of middleware to stay fast).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isPortalRoute = request.nextUrl.pathname.startsWith("/portal");

  // Guards the whole site, not just /portal: proxy.ts runs on every
  // request, so if Supabase isn't configured yet, every page must still
  // load normally — only /portal itself should be affected. Found while
  // wiring this up (2026-07-24): without this guard, an unset
  // NEXT_PUBLIC_SUPABASE_URL would break every route on the site, not
  // just the portal that actually needs it.
  if (!supabaseUrl || !supabasePublishableKey) {
    if (isPortalRoute) {
      return {
        response: new NextResponse("The Client Portal is not configured yet.", { status: 503 }),
        user: null,
      };
    }
    return { response, user: null };
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Both auth entry points must stay reachable without a session —
  // signup was missing here (found during live functional verification,
  // 2026-07-24): only /portal/login was exempt, so /portal/signup
  // redirected an unauthenticated visitor straight to /portal/login,
  // making self-service signup completely unreachable.
  const isPublicAuthRoute =
    request.nextUrl.pathname.startsWith("/portal/login") ||
    request.nextUrl.pathname.startsWith("/portal/signup");

  if (isPortalRoute && !isPublicAuthRoute && !user) {
    const loginUrl = new URL("/portal/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return { response: NextResponse.redirect(loginUrl), user };
  }

  return { response, user };
}
