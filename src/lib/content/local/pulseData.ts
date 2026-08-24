import type { Category, PulseArticle, PulseSettings, PulseSource } from "../types";

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

// Intermediate/regional tiers (West Africa, East Africa, GCC, MENA,
// Europe) and a few more countries were added 2026-08-24 alongside the
// geoRegion.ts country→region mapping (see PULSE_INGESTION_FOUNDATION.md
// §F) — a country resolves to a chain like
// [country, sub-region, continent, "global"], never just one flat value.
// "global" is the new canonical top-level fallback slug; "international"
// is left as-is (unused by any current code) rather than renamed, since
// this file is a local dev fixture only, never read by the live site.
export const PULSE_REGIONS: Category[] = [
  { id: "pregion-ghana", slug: "ghana", name: "Ghana", description: "Ghana creative industry." },
  { id: "pregion-nigeria", slug: "nigeria", name: "Nigeria", description: "Nigeria creative industry." },
  { id: "pregion-kenya", slug: "kenya", name: "Kenya", description: "Kenya creative industry." },
  { id: "pregion-south-africa", slug: "south-africa", name: "South Africa", description: "South Africa creative industry." },
  { id: "pregion-egypt", slug: "egypt", name: "Egypt", description: "Egypt creative industry." },
  { id: "pregion-qatar", slug: "qatar", name: "Qatar", description: "Qatar creative industry." },
  { id: "pregion-uae", slug: "uae", name: "United Arab Emirates", description: "UAE creative industry." },
  { id: "pregion-saudi-arabia", slug: "saudi-arabia", name: "Saudi Arabia", description: "Saudi Arabia creative industry." },
  { id: "pregion-uk", slug: "united-kingdom", name: "United Kingdom", description: "UK creative industry." },
  { id: "pregion-france", slug: "france", name: "France", description: "France creative industry." },
  { id: "pregion-germany", slug: "germany", name: "Germany", description: "Germany creative industry." },
  { id: "pregion-west-africa", slug: "west-africa", name: "West Africa", description: "West African creative industry." },
  { id: "pregion-east-africa", slug: "east-africa", name: "East Africa", description: "East African creative industry." },
  { id: "pregion-africa", slug: "africa", name: "Africa", description: "African creative industry." },
  { id: "pregion-gcc", slug: "gcc", name: "GCC", description: "Gulf Cooperation Council creative industry." },
  { id: "pregion-mena", slug: "mena", name: "MENA", description: "Middle East & North Africa creative industry." },
  { id: "pregion-europe", slug: "europe", name: "Europe", description: "European creative industry." },
  { id: "pregion-global", slug: "global", name: "Global", description: "Global creative industry — the fallback region for any visitor/story without a more specific match." },
  { id: "pregion-international", slug: "international", name: "International", description: "International creative industry." },
];

// Phase A foundation only — no code reads this yet. Mirrors the schema's
// own conservative initialValues exactly.
export const PULSE_SETTINGS: PulseSettings = {
  discoveryEnabled: false,
  globalAutoPublishEnabled: false,
  maxPostsPerDay: 5,
  minimumRelevanceScore: 50,
  regionWeight: 20,
  topicWeight: 30,
  freshnessWeight: 20,
  trustWeight: 20,
  priorityWeight: 10,
};

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

// Clearly [SAMPLE]/Placeholder-labeled, same as every other local dev
// fixture in this project (e.g. journalData.ts's "[SAMPLE] Guest
// Contributor" author) — doesn't misrepresent a real partnership, unlike
// leaving this populated with an unlabeled/plausible-looking source
// would. Used only to exercise the "Official Source" grouping split (see
// storiesFeed.ts's OFFICIAL_SOURCE_TYPES) locally; never shown in
// production, which reads from Sanity, not this file.
const defaultPulseSourceFields = {
  feedUrl: null as string | null,
  termsUrl: null as string | null,
  lastPolicyReviewDate: null as string | null,
  imageUsePermitted: false,
  commercialUsePermitted: false,
  attributionRequirement: null as string | null,
  editorialTrustLevel: "unverified" as const,
  disciplineIds: [] as string[],
  geographyIds: [] as string[],
  editorialPriority: 0,
  autoPublishEligible: false,
};

// isActive: false and permissionClassification: "amber" on both — matches
// the schema's own safe defaults exactly (2026-08-24 direction: a working
// feed must never imply permission). Local dev fixtures only; never read
// by the live site, which reads from Sanity.
export const PULSE_SOURCES: PulseSource[] = [
  {
    ...defaultPulseSourceFields,
    id: "psource-sample-official",
    name: "[SAMPLE] Placeholder Official Source",
    sourceType: "press-release",
    url: "https://example.org",
    licenseNotes: "Placeholder for architecture review only — no real source relationship exists.",
    permissionClassification: "amber",
    isActive: false,
  },
  {
    ...defaultPulseSourceFields,
    id: "psource-sample-general",
    name: "[SAMPLE] Placeholder Aggregated Source",
    sourceType: "rss",
    url: "https://example.org",
    licenseNotes: "Placeholder for architecture review only — no real source relationship exists.",
    permissionClassification: "amber",
    isActive: false,
  },
];

const defaultPulseFields = {
  authorId: null as string | null,
  categoryIds: [] as string[],
  regionIds: [] as string[],
  opportunityTypeIds: [] as string[],
  tags: ["sample"],
  sourceId: null as string | null,
  sourceUrl: null as string | null,
  sourceAttribution: null as string | null,
  aiSummary: null,
  aiSummaryApprovedAt: null,
  applicationDeadline: null as string | null,
  eventStartDate: null as string | null,
  eventEndDate: null as string | null,
  location: null as string | null,
  applyUrl: null as string | null,
  eligibility: null as string | null,
  scheduledFor: null,
  relatedArticleIds: [] as string[],
  relatedProjectIds: [] as string[],
  relatedWorkshopIds: [] as string[],
  newsletterExcerpt: null,
  seo: { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null },
  possibleDuplicateOfId: null as string | null,
  relevanceScore: null as number | null,
  discoveryRunId: null as string | null,
};

// Six entries, one per Stories grouping / trust badge combination that
// storiesFeed.ts's getPulseGrouping/getPulseTrustBadge can produce — see
// STORIES_PULSE_INTEGRATION.md for the grouping/badge mapping this
// exercises locally.
export const PULSE_ARTICLES: PulseArticle[] = [
  {
    ...defaultPulseFields,
    id: "pulse-sample-editorial",
    slug: "sample-editorial-article",
    contentKind: "article",
    origin: "editorial",
    status: "published",
    featured: true,
    title: "[SAMPLE] Editorial Article Title",
    excerpt: "Placeholder excerpt — demonstrates an Ordift-authored editorial piece (grouping: Editorial, badge: Verified by Ordift Studios).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    authorId: "author-sample-1",
    categoryIds: ["pcat-creative-industry"],
    regionIds: ["pregion-ghana"],
    body: "Placeholder body for architecture review only. Real editorial content, written and approved by Ordift Studios, will replace this before launch.",
    publishedAt: "2026-07-27T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-creative-news",
    slug: "sample-creative-news-article",
    contentKind: "article",
    origin: "curated",
    status: "published",
    featured: false,
    title: "[SAMPLE] Creative News Article Title",
    excerpt: "Placeholder excerpt — demonstrates curated content from a general/aggregated source (grouping: Creative News, badge: Official Source).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    categoryIds: ["pcat-fashion"],
    regionIds: ["pregion-international"],
    body: "Placeholder written summary for architecture review only, standing in for a real curated write-up.",
    sourceId: "psource-sample-general",
    sourceUrl: "https://example.org/sample-creative-news-placeholder",
    sourceAttribution: "[SAMPLE] via Placeholder Aggregated Source",
    publishedAt: "2026-07-26T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-industry-update",
    slug: "sample-industry-update",
    contentKind: "article",
    origin: "curated",
    status: "published",
    featured: false,
    title: "[SAMPLE] Industry Update Title",
    excerpt: "Placeholder excerpt — demonstrates curated content from an official/press-release source (grouping: Industry Updates, badge: Official Source).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    categoryIds: ["pcat-software"],
    regionIds: ["pregion-international"],
    body: "Placeholder written summary for architecture review only, standing in for a real curated write-up of an official announcement.",
    sourceId: "psource-sample-official",
    sourceUrl: "https://example.org/sample-industry-update-placeholder",
    sourceAttribution: "[SAMPLE] via Placeholder Official Source",
    publishedAt: "2026-07-25T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-opportunity",
    slug: "sample-opportunity-listing",
    contentKind: "opportunity",
    origin: "curated",
    status: "published",
    featured: false,
    title: "[SAMPLE] Opportunity Listing Title",
    excerpt: "Placeholder excerpt — demonstrates a deadline-driven opportunity listing (grouping: Opportunities, badge: Official Source).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    regionIds: ["pregion-africa"],
    opportunityTypeIds: ["potype-grant"],
    body: "Placeholder written summary for architecture review only, standing in for a real curated opportunity write-up sourced from a trusted PulseSource.",
    sourceUrl: "https://example.org/sample-source-placeholder",
    sourceAttribution: "[SAMPLE] via Placeholder Source",
    applicationDeadline: "2026-12-31T00:00:00.000Z",
    location: "Remote",
    applyUrl: "https://example.org/sample-apply-placeholder",
    eligibility: "[SAMPLE] Placeholder eligibility text.",
    publishedAt: "2026-07-24T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-event",
    slug: "sample-upcoming-event",
    contentKind: "opportunity",
    origin: "curated",
    status: "published",
    featured: false,
    title: "[SAMPLE] Upcoming Event Title",
    excerpt: "Placeholder excerpt — demonstrates an event-type opportunity listing (grouping: Upcoming Events, badge: Official Source).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    regionIds: ["pregion-qatar"],
    opportunityTypeIds: ["potype-festival"],
    body: "Placeholder written summary for architecture review only, standing in for a real curated event write-up.",
    sourceUrl: "https://example.org/sample-event-placeholder",
    sourceAttribution: "[SAMPLE] via Placeholder Source",
    eventStartDate: "2026-11-10T00:00:00.000Z",
    eventEndDate: "2026-11-14T00:00:00.000Z",
    location: "Doha, Qatar",
    applyUrl: "https://example.org/sample-event-info-placeholder",
    publishedAt: "2026-07-23T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-community",
    slug: "sample-community-submission",
    contentKind: "article",
    origin: "community",
    status: "published",
    featured: false,
    title: "[SAMPLE] Community Submitted Title",
    excerpt: "Placeholder excerpt — demonstrates a community-submitted item (grouping: Creative News, badge: Community Submitted).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    categoryIds: ["pcat-photography"],
    regionIds: ["pregion-ghana"],
    body: "Placeholder written summary for architecture review only, standing in for a real community-submitted item.",
    sourceUrl: "https://example.org/sample-community-placeholder",
    sourceAttribution: "[SAMPLE] Submitted by @placeholder-handle",
    publishedAt: "2026-07-22T00:00:00.000Z",
  },
  {
    ...defaultPulseFields,
    id: "pulse-sample-archived",
    slug: "sample-archived-item",
    contentKind: "opportunity",
    origin: "curated",
    status: "archived",
    featured: false,
    title: "[SAMPLE] Archived Item Title",
    excerpt: "Placeholder excerpt — demonstrates an archived item still reachable on the public site (grouping: Opportunities, badge: Archived).",
    heroMedia: { url: null, type: "image", alt: "[SAMPLE] Placeholder hero image" },
    opportunityTypeIds: ["potype-competition"],
    body: "Placeholder written summary for architecture review only — an expired competition kept visible for historical reference.",
    sourceUrl: "https://example.org/sample-archived-placeholder",
    applicationDeadline: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
  },
];
