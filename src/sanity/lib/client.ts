import { createClient, type SanityClient } from "next-sanity";

// Not usable until NEXT_PUBLIC_SANITY_PROJECT_ID is set (see
// CMS_MIGRATION.md "Finishing the connection").
export const apiVersion = process.env.SANITY_API_VERSION || "2025-01-01";

// Construction is deferred to first actual use (see the Proxy below),
// not done at module scope. @sanity/client's createClient() validates
// `projectId` synchronously and throws `Configuration must contain
// projectId` immediately if it's missing — it does NOT wait until the
// first query, despite what this file used to assume. Next.js's build
// step imports every route module (including purely dynamic API routes
// that only transitively reach this file) to collect page data, without
// needing a real Sanity client — so an eager top-level createClient()
// call here fails the whole build over routes that never even use it.
// Found live: Vercel build failure on /api/workshop-registration,
// 2026-07-25.
let cachedClient: SanityClient | undefined;

function getClient(): SanityClient {
  if (!cachedClient) {
    cachedClient = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "staging",
      apiVersion,
      // Both datasets are private (Plan Part J — no public "anyone with
      // the link" sharing), so reads need a token even for published
      // content; without this, queries against a private dataset
      // silently return no results rather than throwing, which is what
      // made this easy to miss — found live while verifying the
      // connection (2026-07-24).
      token: process.env.SANITY_API_TOKEN,
      // Staging/preview reads should always be fresh; the CDN cache is
      // a production-traffic optimization, not something to fight
      // while content is actively being edited and reviewed.
      useCdn: process.env.SITE_ENV === "production",
    });
  }
  return cachedClient;
}

// Proxy so every existing `client.fetch(...)` call site across the
// codebase keeps working unchanged — only the moment of construction
// (and projectId validation) moves from module-import time to first
// actual property access. Methods must be bound to the real instance
// (not the receiver/proxy) before being returned: SanityClient uses
// real JS private class fields internally, and `client.fetch(...)`
// calls the returned function with `this` bound to whatever object the
// property was accessed on — which would be this Proxy, not the real
// instance, causing "Cannot read private member #i from an object whose
// class did not declare it" the moment a method touches `this.#...`.
export const client: SanityClient = new Proxy({} as SanityClient, {
  get(_target, prop) {
    const real = getClient();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
