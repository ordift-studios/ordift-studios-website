// CMS-agnostic domain model. Every field here is plain data — no Sanity
// (or any other CMS) types, IDs, or query shapes leak into this file, so
// nothing that reads through `ContentRepository` (see repository.ts) has
// to know or care what's behind it. See CMS_MIGRATION.md for how a real
// CMS gets plugged in behind this same shape later.

export type ID = string;

export type WorkshopStatus =
  | "coming-soon"
  | "open"
  | "full"
  | "closed"
  | "completed";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "all-levels";

export type WorkshopFormat = "in-person" | "online" | "hybrid";

export type Category = {
  id: ID;
  slug: string;
  name: string;
  description: string;
};

export type Instructor = {
  id: ID;
  slug: string;
  name: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  credentials: string[];
  isPlaceholder: boolean;
};

export type Venue = {
  id: ID;
  name: string;
  addressLine: string | null; // null when format is "online"
  format: WorkshopFormat;
  mapUrl: string | null;
};

export type GalleryImage = {
  id: ID;
  // Null when the array item exists but no asset has been uploaded yet.
  url: string | null;
  alt: string;
  caption: string | null;
  // Sanity-generated image metadata, used by ResponsiveImage
  // (src/components/media/ResponsiveImage.tsx) for automatic aspect-ratio
  // sizing and blur-up loading placeholders. Optional so local dev
  // fixture data (src/lib/content/local/*) doesn't need real values.
  width?: number | null;
  height?: number | null;
  lqip?: string | null;
};

export type FAQ = {
  id: ID;
  question: string;
  answer: string;
};

export type CertificateInfo = {
  offered: boolean;
  description: string | null;
};

// Shared pool — referenced by ID from either Workshop.testimonialIds or
// PortfolioProject.testimonialIds, not owned by either. (Originally had a
// workshopId field; removed 2026-07-23 since lookups already go
// workshop -> testimonialIds, not testimonial -> workshopId, so the field
// was dead weight, and keeping it would have wrongly scoped testimonials
// to workshops only.)
export type Testimonial = {
  id: ID;
  quote: string;
  authorName: string;
  authorRole: string | null;
  isPlaceholder: boolean;
};

export type Sponsor = {
  id: ID;
  name: string;
  logoUrl: string | null;
  url: string | null;
  isPlaceholder: boolean;
};

export type AgendaItem = {
  id: ID;
  time: string; // free text — "Day 1, 9:00 AM", "10:30 AM – 12:00 PM"
  title: string;
  description: string | null;
};

export type Workshop = {
  id: ID;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  status: WorkshopStatus;
  categoryIds: ID[];
  instructorIds: ID[];
  venueId: ID | null;
  capacity: number;
  startDate: string | null; // ISO date
  endDate: string | null; // ISO date — supports multi-day workshops (null or equal to startDate for single-day)
  registrationDeadline: string | null; // ISO date
  experienceLevels: ExperienceLevel[];
  requiresPayment: boolean;
  learningOutcomes: string[];
  agenda: AgendaItem[];
  gallery: GalleryImage[];
  faqs: FAQ[];
  certificate: CertificateInfo;
  testimonialIds: ID[];
  sponsorIds: ID[];
  relatedWorkshopIds: ID[];
  isRecurring: boolean;
  recurrenceNote: string | null; // free text, e.g. "Runs monthly" — no structured RRULE yet, see CMS_MIGRATION.md
  isOnlineAttendancePossible: boolean; // true if a virtual seat exists alongside/instead of in-person
  hasRecordedSession: boolean; // true if a recording is made available after the fact
  isMembersOnly: boolean;
};

// --- Portfolio (Version 1.1) ---

// "draft"/"published" are the only two values ever returned to
// public-facing code (portfolioProjectsQuery filters to "published"
// only) — the three intermediate values exist for the Portfolio
// Management System's review workflow (/admin/portfolio) and are only
// ever seen there. See PORTFOLIO_MANAGEMENT.md.
export type PortfolioStatus = "draft" | "pending_review" | "approved" | "published" | "archived";

// Fixed to the site's existing department routes (/services/[slug]) —
// not a repository-backed entity, since these are structural to the site
// (defined by the department pages themselves), not admin-addable like a
// Category. Mirrors how WorkshopStatus/ExperienceLevel are plain unions.
export type PortfolioDiscipline =
  | "photography"
  | "videography"
  | "graphic-design"
  | "branding"
  | "content-creation"
  | "talent-management"
  | "production";

// "embed" = YouTube/Vimeo/etc — `url` is the embeddable URL, rendered as
// an iframe. "video" = a native file, rendered as <video>. Distinguished
// so the frontend knows which element to render without sniffing the URL.
export type MediaAsset = {
  // Null when the CMS field exists but no asset has been uploaded yet —
  // a content gap, not an error (see MediaAsset component's empty state).
  url: string | null;
  type: "image" | "video" | "embed";
  alt: string;
  // Only populated for type === "image" — a video file or embed URL has
  // no Sanity-generated image metadata. See GalleryImage above for the
  // same fields' purpose.
  width?: number | null;
  height?: number | null;
  lqip?: string | null;
};

export type SeoFields = {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
};

export type Collaborator = {
  id: ID;
  name: string;
  role: string; // free text — "Photographer", "Stylist", "Makeup Artist", "Assistant", etc.
};

// Covers both "Collections" (a curated, unordered grouping — e.g. a
// campaign) and "Project Series" (an ordered grouping — e.g. Part 1/2/3)
// as one concept rather than two overlapping ones. `isOrdered` signals
// which; when true, each project's position comes from
// PortfolioProject.seriesOrder within that collection.
export type Collection = {
  id: ID;
  slug: string;
  name: string;
  description: string;
  isOrdered: boolean;
};

export type Award = {
  id: ID;
  title: string;
  issuer: string;
  year: number | null;
};

export type Publication = {
  id: ID;
  name: string;
  url: string | null;
  year: number | null;
};

export type DownloadableAsset = {
  id: ID;
  label: string;
  url: string;
  fileType: string; // free text — "PDF", "ZIP", "Press Kit", etc.
};

export type BeforeAfterPair = {
  id: ID;
  before: MediaAsset;
  after: MediaAsset;
  caption: string | null;
};

export type PortfolioProject = {
  id: ID;
  slug: string;
  title: string;
  status: PortfolioStatus;
  scheduledFor: string | null; // ISO datetime — only visible publicly once status is "published" AND this has passed (or is unset)
  featured: boolean;
  heroMedia: MediaAsset;
  disciplines: PortfolioDiscipline[];
  categoryIds: ID[];
  collectionIds: ID[];
  seriesOrder: number | null; // position within an isOrdered collection; null otherwise
  client: string | null; // optional — shown only "when permitted"
  year: number | null;
  location: string | null;
  servicesProvided: string[];
  equipmentUsed: string[]; // optional
  tags: string[]; // freeform — distinct from disciplines/categories (structured) and collections (curated grouping)
  collaborators: Collaborator[];
  story: string; // project story / case-study narrative
  objective: string | null; // project objective
  strategy: string | null; // creative strategy
  challenges: string | null;
  solution: string | null;
  process: string | null; // creative process
  deliverables: string[];
  results: string | null; // results / impact, optional
  awards: Award[];
  publications: Publication[];
  gallery: GalleryImage[]; // final gallery
  behindTheScenesGallery: GalleryImage[];
  beforeAfterGallery: BeforeAfterPair[];
  videos: MediaAsset[];
  downloadableAssets: DownloadableAsset[];
  testimonialIds: ID[];
  relatedProjectIds: ID[];
  relatedWorkshopIds: ID[];
  // Metadata only — no enforcement exists yet (needs auth; see
  // ARCHITECTURE.md §4.3). A future authenticated flow reads this flag to
  // decide whether to gate the project; today it's informational.
  isPasswordProtected: boolean;
  seo: SeoFields;
};

// --- Journal (Version 1.1) ---
// Branded on-page as "Stories" per your 2026-07-23 recommendation — same
// route (/journal) and roadmap naming for continuity, different label in
// the UI. See JOURNAL_ARCHITECTURE section of MILESTONES.md.

export type JournalStatus = "draft" | "published";
export type JournalFormat = "written" | "video";

export type Author = {
  id: ID;
  slug: string;
  name: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  isPlaceholder: boolean;
};

export type JournalPost = {
  id: ID;
  slug: string;
  title: string;
  status: JournalStatus;
  featured: boolean;
  format: JournalFormat;
  authorId: ID;
  categoryIds: ID[];
  tags: string[];
  heroImage: MediaAsset;
  videoUrl: string | null; // set when format === "video"
  excerpt: string;
  body: string;
  publishedAt: string | null; // when it actually went live
  // Scheduled publishing: if set to a future date, the post stays hidden
  // from public listings/direct access even when status is "published" —
  // no cron job needed, just a comparison at query time (see
  // JournalHelpers.isPubliclyVisible).
  scheduledFor: string | null;
  relatedPostIds: ID[];
  relatedProjectIds: ID[];
  relatedWorkshopIds: ID[];
  // Data-readiness only for a future newsletter send — no email-sending
  // integration exists yet. A short, newsletter-formatted blurb distinct
  // from the on-page excerpt.
  newsletterExcerpt: string | null;
  seo: SeoFields;
};

// --- Site-wide content (Version 1.2.6) ---
// All singletons below hold real, already-approved copy (not [SAMPLE]
// placeholders) — see MILESTONES.md V1.2.6 for the migration record and
// CMS_MIGRATION.md for why this was sequenced after, not with, the
// original 29-schema pass.

export type CtaButton = {
  label: string;
  href: string;
};

export type SocialLink = {
  platform: string;
  url: string;
};

export type SiteSettings = {
  siteName: string;
  tagline: string | null;
  logoUrl: string | null;
  contactEmail: string;
  whatsappNumber: string;
  socialLinks: SocialLink[];
  defaultSeo: SeoFields;
};

export type HomePage = {
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroPrimaryCta: CtaButton;
  heroSecondaryCta: CtaButton;
  heroImage: MediaAsset;
  whoWeAreEyebrow: string;
  whoWeAreBody: string;
  originalsEyebrow: string;
  originalsHeadline: string;
  originalsBody: string;
  process: { step: string; copy: string }[];
  ctaHeadline: string;
  ctaBody: string;
  ctaPrimary: CtaButton;
  ctaSecondary: CtaButton;
  seo: SeoFields;
};

export type AboutPage = {
  heroEyebrow: string;
  heroHeadline: string;
  storyEyebrow: string;
  storyHeadline: string;
  storyBody: string[]; // one entry per paragraph
  mission: string;
  vision: string;
  values: { name: string; copy: string }[];
  teamEyebrow: string;
  teamHeadline: string;
  teamBody: string[];
  ctaHeadline: string;
  ctaBody: string;
  seo: SeoFields;
};

export type Founder = {
  name: string;
  title: string;
  photoUrl: string | null;
  bio: string[]; // one entry per paragraph
};

export type NavLink = {
  label: string;
  href: string;
};

export type Navigation = {
  links: NavLink[];
  primaryCta: CtaButton;
};

export type FooterColumn = {
  heading: string;
  links: NavLink[];
};

export type FooterSettings = {
  tagline: string;
  columns: FooterColumn[];
};

export type Service = {
  id: ID;
  slug: PortfolioDiscipline;
  name: string;
  summaryDescription: string; // used on the hub card
  heroEyebrow: string;
  heroHeadline: string;
  heroBody: string;
  offerings: string[]; // "What We Offer" category list
  offeringsHeadline: string;
  additionalHeading: string | null; // e.g. Content Creation's "Who It's For"
  additionalItems: string[]; // e.g. Content Creation's target list
  ctaEyebrow: string | null;
  ctaHeadline: string;
  ctaBody: string;
  ctaPrimaryLabel: string;
  ctaSecondaryLabel: string | null;
  isComingSoon: boolean; // Talent Management today
  displayOrder: number;
  seo: SeoFields;
};

export type LegalPageSlug = "privacy" | "terms" | "cookies" | "booking";

export type LegalPage = {
  slug: LegalPageSlug;
  title: string;
  body: string;
  isApproved: boolean;
  lastUpdated: string | null;
};

// --- Ordift Pulse — Creative Industry Hub (Version 4.0, architecture
// built ahead of schedule 2026-07-27; see PULSE_ARCHITECTURE.md) ---
//
// Three independent taxonomy axes, not one flat category list — same
// discipline already established for Role/Position/Grade/Engagement Type
// in the IAM system (see PRODUCT_ROADMAP.md Version 1.1): a category
// ("Photography News"), a region ("Ghana"), and — only for
// contentKind === "opportunity" — an opportunity type ("Grant") describe
// genuinely independent facts about a piece of content, and conflating
// them into one list would make filtering by any single axis impossible.
// All three reuse the existing `Category` shape (id/slug/name/description)
// rather than inventing a new one, backed by three separate Sanity
// document types (pulseCategory/pulseRegion/pulseOpportunityType) for
// independent admin management — exactly the journalCategory/
// portfolioCategory/workshopCategory precedent.

export type PulseContentKind = "article" | "opportunity";

// "editorial" = Ordift-authored (has an Author, no source); "curated" =
// sourced from a trusted PulseSource (has provenance fields, no Author);
// "community" = submitted by someone outside Ordift Studios, not yet
// backed by its own submitter-identity field — added only to drive the
// "Community Submitted" trust badge (see storiesFeed.ts) when the Stories
// hub embedding shipped (STORIES_PULSE_INTEGRATION.md). A dedicated
// submission flow, if built later, would add fields, not change this.
// See PulseArticle.body's own note on why curated/community content is
// always a written summary, never a raw reproduction of the source.
export type PulseOrigin = "editorial" | "curated" | "community";

// No "scheduled" status value — scheduling is a separate `scheduledFor`
// field, exactly like JournalPost, so the same proven visibility-gate
// logic (see pulseHelpers.ts) applies unchanged. "inReview" is the
// editorial-approval gate: curated content should always pass through it
// before "published"; editorial content may skip it if the author is
// already an approver. Enforced by Studio field guidance today, not a
// hard state machine — see PULSE_ARCHITECTURE.md §4.
export type PulseStatus = "draft" | "inReview" | "published" | "archived";

export type PulseSourceType = "rss" | "api" | "press-release" | "partner" | "manual";

// The trusted-source registry — the data layer's connection point for
// future ingestion (RSS/API/partner feeds). No fetching or scraping logic
// exists yet; this is purely the admin-managed allowlist a future
// ingestion step would read from and attribute against. See
// PULSE_ARCHITECTURE.md §3.
export type PulseSource = {
  id: ID;
  name: string;
  sourceType: PulseSourceType;
  url: string | null;
  licenseNotes: string | null; // usage-rights/attribution terms agreed with this source, if any
  isActive: boolean;
};

export type PulseArticle = {
  id: ID;
  slug: string;
  contentKind: PulseContentKind;
  origin: PulseOrigin;
  status: PulseStatus;
  featured: boolean;
  title: string;
  excerpt: string;
  heroMedia: MediaAsset;
  authorId: ID | null; // set only when origin === "editorial"
  categoryIds: ID[];
  regionIds: ID[];
  opportunityTypeIds: ID[]; // only meaningful when contentKind === "opportunity"
  tags: string[];
  // The displayed article body. For curated content this is always a
  // human-written (or AI-drafted, human-approved) summary in Ordift's own
  // words — never a raw reproduction of the external source — per this
  // project's standing copyright discipline (at most one short quote,
  // attributed; see the content-accuracy convention already applied to
  // Journal/Portfolio copy). The full original is one click away via
  // sourceUrl.
  body: string;
  // Curated-content provenance — set only when origin === "curated".
  sourceId: ID | null;
  sourceUrl: string | null; // the original article's canonical link — always shown as "read more at the source"
  sourceAttribution: string | null; // e.g. "via Vogue Business"
  // AI-assist future-proofing for the roadmap's "Source → AI
  // summarization → Draft → Admin Review → Publish" workflow. No
  // summarization actually runs yet — this is scratch space a future
  // automated step writes into; an editor turns it into (or approves it
  // as) `body` above before anything publishes. Never rendered publicly.
  aiSummary: string | null;
  aiSummaryApprovedAt: string | null;
  // Opportunity-only structured fields — null when contentKind === "article".
  applicationDeadline: string | null; // ISO date
  eventStartDate: string | null;
  eventEndDate: string | null;
  location: string | null;
  applyUrl: string | null;
  eligibility: string | null;
  publishedAt: string | null;
  // Scheduled publishing: identical mechanism to JournalPost.scheduledFor
  // — a future date keeps the article hidden even once status is
  // "published", no cron job needed. See pulseHelpers.isPubliclyVisible.
  scheduledFor: string | null;
  relatedArticleIds: ID[];
  relatedProjectIds: ID[]; // cross-links into Portfolio, same convention as Journal
  relatedWorkshopIds: ID[];
  // Data-readiness only for a future newsletter send — no email-sending
  // integration exists yet, same convention as JournalPost.
  newsletterExcerpt: string | null;
  seo: SeoFields;
};
