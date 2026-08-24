// Country-level regional relevance for Ordift Pulse (Phase A, 2026-08-24
// — see PULSE_INGESTION_FOUNDATION.md §F). Privacy-minimal by design: this
// module never requests GPS, never persists an IP address, and works from
// nothing more than the two-letter country code Vercel's edge already
// attaches to every request (read via the `x-vercel-ip-country` header in
// the caller — this module itself is a pure, header-agnostic lookup).
//
// A country resolves to an ordered chain of pulseRegion slugs, broadest
// last — e.g. Ghana -> ["ghana", "west-africa", "africa", "global"]. This
// is a RANKING signal for a future relevance score (see
// relevanceScoring.ts), never a visibility gate: a globally significant
// story is never hidden just because a visitor's country isn't in its
// chain, and any country not in this table (or no header at all — local
// dev, a non-Vercel environment, a bot) safely falls back to ["global"]
// rather than throwing or silently matching nothing.
//
// Deliberately a small, hand-maintained table rather than a full
// ISO-3166 country->region dataset — extending coverage later is adding a
// row, never a structural change. Region slugs here must match real
// pulseRegion Sanity documents (seeded alongside this file — see the
// Phase A delivery report for the exact list created on Staging).

export const GLOBAL_REGION_SLUG = "global";

const COUNTRY_REGION_CHAINS: Record<string, string[]> = {
  // West Africa
  GH: ["ghana", "west-africa", "africa"],
  NG: ["nigeria", "west-africa", "africa"],
  // East Africa
  KE: ["kenya", "east-africa", "africa"],
  // Other Africa
  ZA: ["south-africa", "africa"],
  EG: ["egypt", "mena", "africa"],
  // GCC / MENA
  QA: ["qatar", "gcc", "mena"],
  AE: ["uae", "gcc", "mena"],
  SA: ["saudi-arabia", "gcc", "mena"],
  // Europe
  GB: ["united-kingdom", "europe"],
  FR: ["france", "europe"],
  DE: ["germany", "europe"],
};

/**
 * Resolves a two-letter ISO country code (as provided by Vercel's
 * `x-vercel-ip-country` request header) to an ordered chain of
 * pulseRegion slugs, most-specific first, always ending in "global".
 * Never throws; an unrecognized or missing code returns just ["global"].
 */
export function resolveRegionChain(countryCode: string | null | undefined): string[] {
  if (!countryCode) return [GLOBAL_REGION_SLUG];
  const normalized = countryCode.trim().toUpperCase();
  const chain = COUNTRY_REGION_CHAINS[normalized];
  if (!chain) return [GLOBAL_REGION_SLUG];
  return [...chain, GLOBAL_REGION_SLUG];
}

/**
 * True when a story's own regionIds/slugs share anything with the
 * visitor's resolved chain, OR the story is itself tagged "global" —
 * i.e. a story never needs a visitor-specific match to remain eligible.
 */
export function hasRegionOverlap(storyRegionSlugs: string[], visitorRegionChain: string[]): boolean {
  if (storyRegionSlugs.length === 0) return true; // untagged = always relevant, never penalized
  if (storyRegionSlugs.includes(GLOBAL_REGION_SLUG)) return true;
  return storyRegionSlugs.some((slug) => visitorRegionChain.includes(slug));
}
