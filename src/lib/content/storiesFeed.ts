import { estimateReadingTime } from "./journalHelpers";
import type { Category, ID, JournalPost, MediaAsset, PulseArticle, PulseSource } from "./types";

// Merges JournalPost + PulseArticle into one normalized shape so the
// existing Stories/Journal hub and card component can render both
// without knowing which underlying Sanity document type produced each
// item. See STORIES_PULSE_INTEGRATION.md for why this stays a read-layer
// merge rather than a schema merge — journalPost and pulseArticle remain
// two separate, independently evolvable Sanity document types.

export type StoriesGrouping =
  | "studio-stories"
  | "editorial"
  | "creative-news"
  | "industry-updates"
  | "opportunities"
  | "upcoming-events";

export const GROUPING_LABEL: Record<StoriesGrouping, string> = {
  "studio-stories": "Studio Stories",
  editorial: "Editorial",
  "creative-news": "Creative News",
  "industry-updates": "Industry Updates",
  opportunities: "Opportunities",
  "upcoming-events": "Upcoming Events",
};

export const ALL_GROUPINGS: StoriesGrouping[] = [
  "studio-stories",
  "editorial",
  "creative-news",
  "industry-updates",
  "opportunities",
  "upcoming-events",
];

// The four trust indicators requested — a plain lookup, not a state
// machine. "archived" always wins over origin, since a stale item's
// staleness is the more useful thing to signal at a glance.
export type TrustBadge = "verified" | "official" | "community" | "archived";

export const TRUST_BADGE_LABEL: Record<TrustBadge, string> = {
  verified: "Verified by Ordift Studios",
  official: "Official Source",
  community: "Community Submitted",
  archived: "Archived",
};

// Event/venue-driven opportunity types route to "Upcoming Events";
// deadline-driven ones (grants, competitions, casting calls,
// collaboration asks) route to "Opportunities". Matched by
// pulseOpportunityType slug — see pulseData.ts for the full list.
const EVENT_OPPORTUNITY_SLUGS = new Set([
  "exhibition",
  "fashion-week",
  "festival",
  "workshop",
  "masterclass",
  "award",
]);

// Sources of these types read as formal/institutional (press releases,
// direct partner relationships) — grouped as "Industry Updates" rather
// than the more general "Creative News" bucket. Purely a grouping signal,
// not the trust badge (curated content is "Official Source" regardless
// of which sub-group it lands in — see getPulseTrustBadge).
const OFFICIAL_SOURCE_TYPES = new Set(["partner", "press-release"]);

export type StoriesFeedItem = {
  kind: "journalPost" | "pulseArticle";
  id: ID;
  slug: string;
  href: string;
  title: string;
  excerpt: string;
  heroMedia: MediaAsset;
  authorId: ID | null;
  categoryIds: ID[];
  tags: string[];
  featured: boolean;
  publishedAt: string | null;
  grouping: StoriesGrouping;
  trustBadge: TrustBadge;
  isVideo: boolean;
  readingTimeMinutes: number;
  searchBlob: string; // title + excerpt + body + tags, lowercased once
};

export function fromJournalPost(post: JournalPost): StoriesFeedItem {
  return {
    kind: "journalPost",
    id: post.id,
    slug: post.slug,
    href: `/journal/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt,
    heroMedia: post.heroImage,
    authorId: post.authorId,
    categoryIds: post.categoryIds,
    tags: post.tags,
    featured: post.featured,
    publishedAt: post.publishedAt,
    grouping: "studio-stories",
    trustBadge: "verified",
    isVideo: post.format === "video",
    readingTimeMinutes: estimateReadingTime(post.body),
    searchBlob: [post.title, post.excerpt, post.body, ...post.tags].join(" ").toLowerCase(),
  };
}

function getPulseGrouping(
  article: PulseArticle,
  opportunityTypeById: Map<ID, Category>,
  sourceById: Map<ID, PulseSource>
): StoriesGrouping {
  if (article.contentKind === "opportunity") {
    const isEvent = article.opportunityTypeIds.some((id) => {
      const slug = opportunityTypeById.get(id)?.slug;
      return slug ? EVENT_OPPORTUNITY_SLUGS.has(slug) : false;
    });
    return isEvent ? "upcoming-events" : "opportunities";
  }
  if (article.origin === "editorial") return "editorial";
  if (article.origin === "curated") {
    const source = article.sourceId ? sourceById.get(article.sourceId) : null;
    if (source && OFFICIAL_SOURCE_TYPES.has(source.sourceType)) return "industry-updates";
  }
  return "creative-news"; // curated (non-official source) or community
}

function getPulseTrustBadge(article: PulseArticle): TrustBadge {
  if (article.status === "archived") return "archived";
  if (article.origin === "editorial") return "verified";
  if (article.origin === "community") return "community";
  return "official"; // curated — sourced from the vetted pulseSource registry
}

export function fromPulseArticle(
  article: PulseArticle,
  opportunityTypeById: Map<ID, Category>,
  sourceById: Map<ID, PulseSource>
): StoriesFeedItem {
  return {
    kind: "pulseArticle",
    id: article.id,
    slug: article.slug,
    href: `/journal/${article.slug}`,
    title: article.title,
    excerpt: article.excerpt,
    heroMedia: article.heroMedia,
    authorId: article.authorId,
    categoryIds: article.categoryIds,
    tags: article.tags,
    featured: article.featured,
    publishedAt: article.publishedAt,
    grouping: getPulseGrouping(article, opportunityTypeById, sourceById),
    trustBadge: getPulseTrustBadge(article),
    isVideo: false,
    readingTimeMinutes: estimateReadingTime(article.body),
    searchBlob: [article.title, article.excerpt, article.body, ...article.tags].join(" ").toLowerCase(),
  };
}

export function matchesStoriesSearch(item: StoriesFeedItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.searchBlob.includes(q);
}
