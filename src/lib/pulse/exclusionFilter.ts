// Political/general-news exclusion architecture for Ordift Pulse (Phase A,
// 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md §4). Rules-based only —
// no AI/paid provider required for this to function, per explicit
// direction. A future ingestion step (not built in Phase A) would call
// classifyForExclusion() on each discovered candidate before it's even
// saved as a draft, and only ever "exclude" outright when the signal is
// unambiguous; anything genuinely uncertain routes to human review
// instead of being silently discarded, exactly as instructed.
//
// Ordift is a photography/multidisciplinary creative house, not a news
// outlet — this filter exists to keep politics, elections, crime, sports,
// unrelated finance/technology, and generic celebrity gossip out of the
// editorial queue by default, while still allowing genuinely
// creative-sector-relevant government/regulatory material through (e.g.
// copyright law, photography permits, advertising regulation, creative
// funding, cultural policy, talent/model regulation).

export type ExclusionDecision = "include" | "exclude" | "review";

export type ExclusionInput = {
  title: string;
  excerpt: string;
  // Slugs of pulseCategory documents already assigned (by a source's own
  // `disciplines` or prior classification) — trusted over keyword
  // matching when present, since taxonomy is a stronger signal than text.
  categorySlugs?: string[];
};

// Deliberately generic terms, not specific people/parties/countries —
// this is a topic filter, not a viewpoint filter, and stays that way so
// it can't be read as taking a political position.
const GENERAL_EXCLUSION_TERMS = [
  "election",
  "elections",
  "political party",
  "parliament",
  "president",
  "prime minister",
  "government dispute",
  "coup",
  "protest",
  "crime",
  "murder",
  "shooting",
  "robbery",
  "breaking news",
  "stock market",
  "interest rate",
  "cryptocurrency price",
  "smartphone launch",
  "football",
  "basketball",
  "cricket match",
  "olympics",
  "celebrity divorce",
  "celebrity scandal",
  "reality tv drama",
];

// If a general-exclusion term is present ALONGSIDE one of these, the
// story is ambiguous rather than clearly out-of-scope — e.g. "government
// announces new copyright rules for photographers" — and should go to
// review, not be auto-excluded or auto-included.
const CREATIVE_SECTOR_OVERRIDE_TERMS = [
  "copyright",
  "intellectual property",
  "photography permit",
  "filming permit",
  "film permit",
  "advertising regulation",
  "advertising standards",
  "creative funding",
  "arts council",
  "arts grant",
  "cultural policy",
  "creative industry policy",
  "talent regulation",
  "model regulation",
  "fashion week",
  "exhibition",
  "gallery",
  "photographer",
  "filmmaker",
  "cinematography",
  "designer",
  "creative director",
  "branding",
  "campaign shoot",
];

const KNOWN_CREATIVE_CATEGORY_SLUGS = new Set([
  "creative-industry-news",
  "fashion-news",
  "photography-news",
  "videography-filmmaking-news",
  "music-entertainment-news",
  "creative-technology",
  "camera-equipment-releases",
  "adobe-editing-software-updates",
]);

function containsAny(haystack: string, terms: string[]): boolean {
  const lower = haystack.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/**
 * Rules-based only — no AI/paid provider required. Trusts an already-
 * assigned creative-sector category over keyword matching; otherwise
 * scans title+excerpt for general-exclusion terms and a creative-sector
 * override. Ambiguous signals resolve to "review", never a silent
 * discard.
 */
export function classifyForExclusion(input: ExclusionInput): ExclusionDecision {
  if (input.categorySlugs?.some((slug) => KNOWN_CREATIVE_CATEGORY_SLUGS.has(slug))) {
    return "include";
  }

  const text = `${input.title} ${input.excerpt}`;
  const hasGeneralExclusionSignal = containsAny(text, GENERAL_EXCLUSION_TERMS);
  if (!hasGeneralExclusionSignal) return "include";

  const hasCreativeOverride = containsAny(text, CREATIVE_SECTOR_OVERRIDE_TERMS);
  return hasCreativeOverride ? "review" : "exclude";
}
