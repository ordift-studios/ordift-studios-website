import type { PulseArticle } from "./types";

// Mirrors journalHelpers.isPubliclyVisible exactly, adapted to Pulse's
// richer status enum (draft/inReview/published/archived vs. Journal's
// draft/published) — an article is visible once "published" AND either
// no scheduledFor is set, or it's already in the past.
export function isPubliclyVisible(article: PulseArticle): boolean {
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
