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
//
// makeLazyClient() generalizes this same deferred-construction Proxy so
// the explicit-perspective clients below (added for the Pulse
// native-draft architecture, 2026-08-27) get the identical guarantee:
// `configure` (a `.withConfig()` call) only ever runs on first actual
// property access of that specific export, never at module-import time
// — calling `.withConfig()` eagerly at module scope would force
// `getClient()` (and its synchronous `projectId` validation) to run on
// import, reintroducing the exact Vercel build failure this lazy
// pattern exists to prevent (see the comment above `getClient()`).
function makeLazyClient(configure?: (base: SanityClient) => SanityClient): SanityClient {
  let cached: SanityClient | undefined;
  return new Proxy({} as SanityClient, {
    get(_target, prop) {
      if (!cached) {
        const base = getClient();
        cached = configure ? configure(base) : base;
      }
      const value = Reflect.get(cached, prop, cached);
      return typeof value === "function" ? value.bind(cached) : value;
    },
  });
}

export const client: SanityClient = makeLazyClient();

// Explicit-perspective clients (Pulse native-draft architecture,
// 2026-08-27) — deliberately never rely on @sanity/client's
// apiVersion-dependent default perspective (which changed from `raw` to
// `published` at API version v2025-02-19) to decide what's safe to
// expose. Each consumer states its own required perspective outright,
// so a future apiVersion bump can never silently change Pulse (or any
// other content type's) draft/published visibility semantics.
//
// publicClient — every public-facing read (ContentRepository). Only
// ever sees genuinely published documents, regardless of apiVersion.
// This is Layer 1 of Pulse's defense-in-depth; the existing
// `status == "published"` query filter (Layer 4) stays in force
// unchanged alongside it — neither layer replaces the other.
export const publicClient: SanityClient = makeLazyClient((base) => base.withConfig({ perspective: "published" }));

// editorialClient — every admin/editorial read+write and Pulse
// discovery/dedup read. Sees draft documents (falling back to the
// published version where no draft exists), so admin review queues,
// article detail lookups, and discovery's own deduplication pool all
// correctly see genuine Sanity drafts.
export const editorialClient: SanityClient = makeLazyClient((base) => base.withConfig({ perspective: "drafts" }));
