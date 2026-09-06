import type { Metadata } from "next";
import Studio from "./Studio";

// Deliberately not force-static: the Studio (via sanity.config.ts) reads
// env vars that don't exist until the Ordift-owned Sanity project is
// created (see CMS_MIGRATION.md), so this route must only be evaluated
// at request time, never during `next build`'s static generation pass.
// No other route imports sanity.config.ts, so nothing else is affected.
export const dynamic = "force-dynamic";

// Tier 1 Hardening (2026-09-06) — every other internal surface
// (admin/**, portal/**, style-preview/**) already sets this explicitly
// as defense-in-depth on top of robots.txt's disallow list; Studio was
// the one exception, relying on disallow-only, which is weaker than an
// explicit noindex (a disallowed URL discovered via an inbound link can
// still surface in search results as "indexed, though blocked").
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return <Studio />;
}
