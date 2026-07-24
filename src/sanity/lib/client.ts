import { createClient } from "next-sanity";

// Not usable until NEXT_PUBLIC_SANITY_PROJECT_ID is set (see
// CMS_MIGRATION.md "Finishing the connection"). Importing this file is
// safe with empty env vars; only actually querying with it will fail,
// and only the code that calls it (the not-yet-activated
// SanityContentRepository) is affected.
export const apiVersion = process.env.SANITY_API_VERSION || "2025-01-01";

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "staging",
  apiVersion,
  // Both datasets are private (Plan Part J — no public "anyone with the
  // link" sharing), so reads need a token even for published content;
  // without this, queries against a private dataset silently return no
  // results rather than throwing, which is what made this easy to miss
  // — found live while verifying the connection (2026-07-24).
  token: process.env.SANITY_API_TOKEN,
  // Staging/preview reads should always be fresh; the CDN cache is a
  // production-traffic optimization, not something to fight while
  // content is actively being edited and reviewed.
  useCdn: process.env.SITE_ENV === "production",
});
