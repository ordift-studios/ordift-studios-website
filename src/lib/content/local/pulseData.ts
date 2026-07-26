import type { Category, PulseArticle, PulseSource } from "../types";

// Taxonomy lookups are real category/region/opportunity-type labels (the
// same list requested for Ordift Pulse), not fabricated facts, so these
// are seeded directly rather than [SAMPLE]-prefixed. PULSE_SOURCES and
// PULSE_ARTICLES below follow the same [SAMPLE] convention as
// journalData.ts/portfolioData.ts: placeholder content for architecture
// review only, never a real news source or claim. See
// PULSE_ARCHITECTURE.md.

export const PULSE_CATEGORIES: Category[] = [
  { id: "pcat-creative-industry", slug: "creative-industry-news", name: "Creative Industry News", description: "General creative-industry news." },
  { id: "pcat-fashion", slug: "fashion-news", name: "Fashion News", description: "Fashion industry news." },
  { id: "pcat-photography", slug: "photography-news", name: "Photography News", description: "Photography industry news." },
  { id: "pcat-film", slug: "videography-filmmaking-news", name: "Videography & Filmmaking News", description: "Videography and filmmaking industry news." },
  { id: "pcat-music", slug: "music-entertainment-news", name: "Music & Entertainment News", description: "Music and entertainment industry news." },
  { id: "pcat-tech", slug: "creative-technology", name: "Creative Technology", description: "Emerging tools and technology for creatives." },
  { id: "pcat-gear", slug: "camera-equipment-releases", name: "Camera & Equipment Releases", description: "New camera and equipment releases." },
  { id: "pcat-software", slug: "adobe-editing-software-updates", name: "Adobe & Editing Software Updates", description: "Adobe and other editing-software updates." },
];

export const PULSE_REGIONS: Category[] = [
  { id: "pregion-ghana", slug: "ghana", name: "Ghana", description: "Ghana creative industry." },
  { id: "pregion-qatar", slug: "qatar", name: "Qatar", description: "Qatar creative industry." },
  { id: "pregion-africa", slug: "africa", name: "Africa", description: "African creative industry." },
  { id: "pregion-international", slug: "international", name: "International", description: "International creative industry." },
];

export const PULSE_OPPORTUNITY_TYPES: Category[] = [
  { id: "potype-exhibition", slug: "exhibition", name: "Exhibition", description: "Upcoming exhibitions." },
  { id: "potype-fashion-week", slug: "fashion-week", name: "Fashion Week", description: "Fashion weeks." },
  { id: "potype-festival", slug: "festival", name: "Festival", description: "Festivals." },
  { id: "potype-award", slug: "award", name: "Award", description: "Awards." },
  { id: "potype-workshop", slug: "workshop", name: "Workshop", description: "External workshops (distinct from Ordift Academy's own Workshops platform)." },
  { id: "potype-masterclass", slug: "masterclass", name: "Masterclass", description: "Masterclasses." },
  { id: "potype-grant", slug: "grant", name: "Grant", description: "Grants." },
  { id: "potype-competition", slug: "competition", name: "Competition", description: "Competitions." },
  { id: "potype-casting-call", slug: "casting-call", name: "Casting Call", description: "Casting calls." },
  { id: "potype-collaboration", slug: "collaboration-opportunity", name: "Collaboration Opportunity", description: "Collaboration opportunities." },
];

// No real trusted-source relationships exist yet — inventing one here
// would misrepresent a partnership that doesn't exist, unlike the
// taxonomy above which is just organizational labeling. Stays empty
// until a real source is agreed and added via Sanity Studio.
export const PULSE_SOURCES: PulseSource[] = [];

export const PULSE_ARTICLES: PulseArticle[] = [
  {
    id: "pulse-sample-article",
    slug: "sample-editorial-article",
    contentKind: "article",
    origin: "editorial",
    status: "published",
    featured: true,
    title: "[SAMPLE] Editorial Article Title",
    excerpt: "Placeholder excerpt for architecture review only — demonstrates an Ordift-authored editorial piece.",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    authorId: "author-sample-1",
    categoryIds: ["pcat-creative-industry"],
    regionIds: ["pregion-ghana"],
    opportunityTypeIds: [],
    tags: ["sample"],
    body: "Placeholder body for architecture review only. Real editorial content, written and approved by Ordift Studios, will replace this before launch.",
    sourceId: null,
    sourceUrl: null,
    sourceAttribution: null,
    aiSummary: null,
    aiSummaryApprovedAt: null,
    applicationDeadline: null,
    eventStartDate: null,
    eventEndDate: null,
    location: null,
    applyUrl: null,
    eligibility: null,
    publishedAt: "2026-07-27T00:00:00.000Z",
    scheduledFor: null,
    relatedArticleIds: [],
    relatedProjectIds: [],
    relatedWorkshopIds: [],
    newsletterExcerpt: null,
    seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null },
  },
  {
    id: "pulse-sample-opportunity",
    slug: "sample-opportunity-listing",
    contentKind: "opportunity",
    origin: "curated",
    status: "published",
    featured: false,
    title: "[SAMPLE] Opportunity Listing Title",
    excerpt: "Placeholder excerpt for architecture review only — demonstrates a curated opportunity listing (e.g. a grant or casting call).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    authorId: null,
    categoryIds: [],
    regionIds: ["pregion-africa"],
    opportunityTypeIds: ["potype-grant"],
    tags: ["sample"],
    body: "Placeholder written summary for architecture review only, standing in for a real curated opportunity write-up sourced from a trusted PulseSource.",
    sourceId: null,
    sourceUrl: "https://example.org/sample-source-placeholder",
    sourceAttribution: "[SAMPLE] via Placeholder Source",
    aiSummary: null,
    aiSummaryApprovedAt: null,
    applicationDeadline: "2026-12-31T00:00:00.000Z",
    eventStartDate: null,
    eventEndDate: null,
    location: "Remote",
    applyUrl: "https://example.org/sample-apply-placeholder",
    eligibility: "[SAMPLE] Placeholder eligibility text.",
    publishedAt: "2026-07-27T00:00:00.000Z",
    scheduledFor: null,
    relatedArticleIds: [],
    relatedProjectIds: [],
    relatedWorkshopIds: [],
    newsletterExcerpt: null,
    seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null },
  },
];
