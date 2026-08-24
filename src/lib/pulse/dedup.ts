// Deduplication heuristic for Ordift Pulse discovery (Phase A, 2026-08-24
// — see PULSE_INGESTION_FOUNDATION.md §G). Pure functions only; nothing
// here queries Sanity or writes anything. A future ingestion step (not
// built in Phase A) is expected to: fetch recent pulseArticle documents
// within the comparison window, run isDuplicateCandidate() against each,
// and — on a match — set possibleDuplicateOf rather than skip/delete the
// new item, exactly as approved: never auto-delete, always leave both for
// an editor to resolve.
//
// Deliberately structured so a future semantic/embedding-based check can
// slot in as an additional signal (see the `similarity` parameter on
// isDuplicateCandidate) without restructuring how callers use this
// module — the token-overlap heuristic below is one strategy behind a
// small interface, not the only one this module can ever support.

export type DedupCandidate = {
  sourceUrl: string | null;
  title: string;
  publishedAt: string | null; // ISO datetime
};

const DEFAULT_WINDOW_DAYS = 30;

/** Lowercased, punctuation-stripped, whitespace-collapsed. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Token-overlap ratio (Jaccard) over normalized titles, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return unionSize === 0 ? 0 : overlap / unionSize;
}

function withinWindow(a: string | null, b: string | null, windowDays: number): boolean {
  if (!a || !b) return true; // missing dates never exclude a match on their own
  const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diffMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * Returns the first existing item the candidate appears to duplicate, or
 * null. Checked in order: exact source URL match, then a normalized-title
 * match, then fuzzy title similarity above threshold — all constrained to
 * `windowDays` around the candidate's publish date.
 */
export function findDuplicate(
  candidate: DedupCandidate,
  existing: DedupCandidate[],
  options: { windowDays?: number; similarityThreshold?: number } = {}
): DedupCandidate | null {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const similarityThreshold = options.similarityThreshold ?? 0.6;
  const candidateNormalized = normalizeTitle(candidate.title);

  const inWindow = existing.filter((item) => withinWindow(candidate.publishedAt, item.publishedAt, windowDays));

  if (candidate.sourceUrl) {
    const urlMatch = inWindow.find((item) => item.sourceUrl && item.sourceUrl === candidate.sourceUrl);
    if (urlMatch) return urlMatch;
  }

  const titleMatch = inWindow.find((item) => normalizeTitle(item.title) === candidateNormalized);
  if (titleMatch) return titleMatch;

  const fuzzyMatch = inWindow.find((item) => titleSimilarity(candidate.title, item.title) >= similarityThreshold);
  return fuzzyMatch ?? null;
}
