import type { PulseArticle } from "./types";

// Mirrors journalHelpers.isPubliclyVisible, adapted to Pulse's richer
// status enum (draft/inReview/published/archived vs. Journal's
// draft/published) — an article is visible once "published" OR
// "archived" (archived items stay visible with a dimmed "Archived" badge
// rather than disappearing — see storiesFeed.ts), AND either no
// scheduledFor is set, or it's already in the past.
export function isPubliclyVisible(article: PulseArticle): boolean {
  if (article.status !== "published" && article.status !== "archived") return false;
  if (!article.scheduledFor) return true;
  return new Date(article.scheduledFor).getTime() <= Date.now();
}

// Sitemap eligibility (closure refinement, 2026-08-25) — deliberately
// narrower than isPubliclyVisible above: "archived" is publicly
// reachable (still renders, dimmed) but not sitemap-eligible, since it's
// stale content Ordift isn't actively promoting for fresh indexing.
// Mirrors pulseArticlesForSitemapQuery's Sanity-side filter exactly.
export function isSitemapEligible(article: PulseArticle): boolean {
  if (article.status !== "published") return false;
  if (!article.scheduledFor) return true;
  return new Date(article.scheduledFor).getTime() <= Date.now();
}

// Opportunities (grants, competitions, casting calls, etc.) are
// deadline-driven — this is the one piece of derived logic genuinely
// specific to contentKind === "opportunity" that a future listing page
// will need (e.g. to grey out or exclude a closed opportunity).
export function isOpportunityExpired(article: PulseArticle): boolean {
  if (article.contentKind !== "opportunity" || !article.applicationDeadline) return false;
  return new Date(article.applicationDeadline).getTime() < Date.now();
}

export function matchesSearch(article: PulseArticle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [article.title, article.excerpt, article.body, ...article.tags].join(" ").toLowerCase();
  return haystack.includes(q);
}
