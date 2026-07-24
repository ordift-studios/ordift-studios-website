import { formatDate } from "./formatters";
import type { JournalPost } from "./types";

export { formatDate };

const WORDS_PER_MINUTE = 200;

// Derived, not stored — recomputed from `body` rather than kept as a
// stale stored field that could drift out of sync with edits.
export function estimateReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// A post is publicly visible only once its scheduled date (if any) has
// passed — this is what makes "scheduled publishing" work without a cron
// job: the gate is just a comparison at query time.
export function isPubliclyVisible(post: JournalPost): boolean {
  if (post.status !== "published") return false;
  if (!post.scheduledFor) return true;
  return new Date(post.scheduledFor).getTime() <= Date.now();
}

export function matchesSearch(post: JournalPost, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [post.title, post.excerpt, post.body, ...post.tags].join(" ").toLowerCase();
  return haystack.includes(q);
}
