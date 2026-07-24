import Studio from "./Studio";

// Deliberately not force-static: the Studio (via sanity.config.ts) reads
// env vars that don't exist until the Ordift-owned Sanity project is
// created (see CMS_MIGRATION.md), so this route must only be evaluated
// at request time, never during `next build`'s static generation pass.
// No other route imports sanity.config.ts, so nothing else is affected.
export const dynamic = "force-dynamic";

export default function StudioPage() {
  return <Studio />;
}
