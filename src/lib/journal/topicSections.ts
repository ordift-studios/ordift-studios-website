// Topic-first Journal architecture (Phase E, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md §2/§12). TOPIC is the primary
// public-facing axis on the redesigned /journal, per explicit direction
// — origin/trust (Ordift Original/Editorial/Curated/Verified Source)
// stays a secondary, card-level signal (already rendered by
// JournalPostCard's trust badge), never confused with a topic.
//
// This mapping is code, not CMS content — same reasoning storiesFeed.ts
// already uses for its own grouping logic: it's a presentation decision
// about how existing pulseCategory slugs bucket into public sections,
// not a fact an editor needs to maintain per-article. "People /
// Conversations" has no dedicated pulseCategory (deliberately — an
// interview about photography is still "Photography", just also a
// Conversation) and is therefore always empty until a future
// cross-cutting tag convention is introduced; listed here for
// completeness rather than omitted, so its "hide when empty" behavior
// is visible and correct rather than the section simply not existing.

export type JournalTopicSlug =
  | "photography"
  | "fashion"
  | "film-visual-culture"
  | "design-branding"
  | "creative-industry"
  | "people-conversations"
  | "culture-entertainment";

export const JOURNAL_TOPICS: { slug: JournalTopicSlug; label: string; categorySlugs: string[] }[] = [
  { slug: "photography", label: "Photography", categorySlugs: ["photography-news", "camera-equipment-releases"] },
  { slug: "fashion", label: "Fashion", categorySlugs: ["fashion-news"] },
  { slug: "film-visual-culture", label: "Film & Visual Culture", categorySlugs: ["videography-filmmaking-news"] },
  { slug: "design-branding", label: "Design & Branding", categorySlugs: ["design-branding"] },
  { slug: "creative-industry", label: "Creative Industry", categorySlugs: ["creative-industry-news", "creative-technology", "adobe-editing-software-updates"] },
  { slug: "people-conversations", label: "People / Conversations", categorySlugs: [] },
  { slug: "culture-entertainment", label: "Culture / Entertainment", categorySlugs: ["music-entertainment-news"] },
];
