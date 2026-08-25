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
  city: string | null; // null when format is "online"
  country: string | null; // null when format is "online"
  format: WorkshopFormat;
  mapUrl: string | null;
};

// Photography adaptive justified gallery (2026-08-23) — an optional,
// admin-set hint on individual gallery images. "automatic" (or unset)
// means the layout engine decides; every other value is a deliberate
// override. Only Photography's own gallery reads this — every other
// discipline's gallery rendering ignores it entirely.
export type GalleryImagePresentation = "automatic" | "featured" | "wide" | "portrait-pair" | "standard";

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
  // Optional — absent (or "automatic") for every image until an
  // Admin/Super Admin deliberately sets one. Optional key so the local
  // fixture repository's gallery arrays don't need updating.
  presentation?: GalleryImagePresentation | null;
  // Graphic Design case study (2026-08-24) — routes a gallery image
  // into "Selected Work" (unset/"automatic"), the Identity/System
  // breakdown, or Applications/Mockups on the Graphic Design project
  // page. Unused by every other discipline. Optional key so the local
  // fixture repository's gallery arrays don't need updating.
  assetRole?: GalleryAssetRole | null;
};

export type GalleryAssetRole =
  | "automatic"
  | "logo"
  | "secondary-mark"
  | "color-palette"
  | "typography"
  | "visual-element"
  | "application";

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
  // Workshop Management V1, Phase B (2026-08-25) — coverImage follows the
  // same PresentationImage convention as Portfolio's coverImage
  // (optionalImageFragment), not a new media type. displayCurrency is
  // informational only — never used to compute the actual amount
  // charged (that stays USD-referenced via ticket_types.price_usd,
  // matching payments.reference_amount_usd's existing convention).
  coverImage: PresentationImage | null;
  displayCurrency: string | null;
  timezone: string | null;
  startDate: string | null; // ISO date
  endDate: string | null; // ISO date — supports multi-day workshops (null or equal to startDate for single-day)
  registrationOpensAt: string | null; // ISO date
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
  attendeeTerms: string | null; // shown publicly — terms/important information for registrants
  seo: SeoFields;
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

// A single admin-chosen presentation image (2026-08-23) — used for the
// Portfolio Hero/Cover Image Management feature (Service.workLandingImage,
// PortfolioProject.coverImage). Deliberately not MediaAsset: always an
// image (no video/embed union), and always optional/absent until an
// Admin/Super Admin explicitly picks one via Admin → Portfolio. Distinct
// from Homepage Slideshow's own landscape/portrait images and from a
// project's Hero Media — each presentation role can hold a different
// image on purpose.
export type PresentationImage = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  lqip: string | null;
  // Image Repositioning (2026-08-23) — reuses Sanity's native image
  // hotspot as a focal point. Both 0–100, (0,0) is the image's top-left.
  // Always present (defaults to 50/50 — dead center — when no hotspot
  // has been saved), so every consumer can use it unconditionally as an
  // object-position percentage without a fallback check.
  focalX: number;
  focalY: number;
  // Not a secret — already embedded in `url` itself (Sanity CDN URLs
  // encode the asset id in the filename). Exposed here only so the
  // Admin UI can re-save this exact same underlying asset (e.g. when
  // repositioning an already-chosen image) without a duplicate upload.
  assetId: string;
};

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
  // Videography (2026-08-23) — an admin-chosen poster shown before
  // playback instead of the video's (often black/blank) first frame.
  // Only meaningful for type "video"/"embed"; absent for type "image".
  // A project's own Main Film (heroMedia) prefers PortfolioProject's
  // existing coverImage instead of this — this field is specifically
  // for individual Additional Films/Reels within a project, each of
  // which needs its own poster. Optional key so non-video MediaAsset
  // usages (image galleries, hero images) never need it.
  poster?: PresentationImage | null;
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
  // Optional (2026-08-23) — absent until an Admin/Super Admin picks one
  // from Admin → Portfolio for this specific project. Used by discipline
  // index pages (e.g. /work/photography) instead of heroMedia when set;
  // never affects this project's own detail page. Optional key (not just
  // nullable) so the local fixture repository's PORTFOLIO_PROJECTS array
  // doesn't need updating.
  coverImage?: PresentationImage | null;
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
  // Videography (2026-08-23) — off by default; when false, the public
  // Videography page never renders `collaborators` even if the array is
  // populated (ordinary client work stays minimal). Optional key so the
  // local fixture repository's projects don't need updating.
  showCollaborationCredits?: boolean;
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
  videos: MediaAsset[]; // "Additional Films" on the public Videography page
  // Videography (2026-08-23) — optional short-form/vertical video.
  // Optional key so the local fixture repository's projects don't need
  // updating.
  reels?: MediaAsset[];
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

// One resolved homepage-slideshow slide, already run through the
// landscape/portrait fallback chain (see getHomePage() in
// src/lib/content/sanity/repository.ts) — by the time this reaches the
// frontend, `landscape`/`portrait` are each either a real, ready-to-render
// image or null (never a half-broken reference). A slide with neither
// resolved is dropped entirely upstream, never reaches here.
export type HomepageSlideshowSlide = {
  landscape: MediaAsset | null;
  portrait: MediaAsset | null;
};

export type HomePage = {
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroPrimaryCta: CtaButton;
  heroSecondaryCta: CtaButton;
  heroImage: MediaAsset;
  // Curated slides only (already fallback-resolved, already filtered to
  // enabled). Empty when no admin-curated slides exist yet — the homepage
  // itself decides whether to fall back to getSlideshowProjects() based
  // on whether this is empty, not this type.
  slideshowSlides: HomepageSlideshowSlide[];
  whoWeAreEyebrow: string;
  whoWeAreBody: string;
  // Homepage About Preview background photography (2026-08-24) —
  // admin-assigned only (Admin -> Portfolio -> Homepage About Visuals),
  // never auto-populated from Portfolio content. null until an admin
  // sets one; the public page falls back to a solid-color treatment.
  aboutMissionImage?: PresentationImage | null;
  aboutVisionImage?: PresentationImage | null;
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
  // Optional (2026-08-23) — absent for every service until an
  // Admin/Super Admin deliberately picks one from Admin → Portfolio →
  // Work Landing Images. Optional key (not just nullable) so the local
  // fixture repository's existing SERVICES array doesn't need updating.
  workLandingImage?: PresentationImage | null;
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

// Legal/licensing fact — may Ordift use this source's material the way it
// intends to? Deliberately independent of PulseEditorialTrustLevel below
// (2026-08-24 direction — never collapse the two into one field/score).
// "green" = syndication permitted; "blue" = discovery/linking only, no
// reproduction; "amber" = permission unclear, always human-reviewed,
// never auto-published; "red" = do not ingest. See
// PULSE_INGESTION_FOUNDATION.md.
export type PulsePermissionClassification = "green" | "blue" | "amber" | "red";

// Editorial/reputation fact — is this source's own journalism reliable?
// Independent of PulsePermissionClassification: a highly reputable
// publication can still be Amber/Blue legally, and vice versa.
export type PulseEditorialTrustLevel = "high" | "standard" | "unverified" | "flagged";

// The trusted-source registry — the data layer's connection point for
// future ingestion (RSS/API/partner feeds). No fetching or scraping logic
// runs yet (Phase A, 2026-08-24, builds the adapter interfaces only — see
// PULSE_INGESTION_FOUNDATION.md); this is purely the admin-managed
// allowlist a future ingestion step would read from and attribute
// against. See PULSE_ARCHITECTURE.md §3.
export type PulseSource = {
  id: ID;
  name: string;
  sourceType: PulseSourceType;
  url: string | null; // the publisher's main site
  feedUrl: string | null; // the actual RSS/Atom/API endpoint, if any
  termsUrl: string | null; // link to the publisher's terms/syndication policy — the evidence behind permissionClassification
  licenseNotes: string | null; // freeform usage-rights or attribution terms agreed with this source, if any
  lastPolicyReviewDate: string | null; // ISO date — when a human last actually checked the terms; never set by automation
  permissionClassification: PulsePermissionClassification;
  imageUsePermitted: boolean;
  commercialUsePermitted: boolean;
  attributionRequirement: string | null;
  editorialTrustLevel: PulseEditorialTrustLevel;
  disciplineIds: ID[]; // pulseCategory references this source typically covers
  geographyIds: ID[]; // pulseRegion references this source's coverage is relevant to
  editorialPriority: number;
  isActive: boolean;
  autoPublishEligible: boolean; // schema-enforced: only meaningful when permissionClassification === "green"
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
  // Discovery/dedup foundation (Phase A, 2026-08-24) — written by a future
  // ingestion step, never by an editor. See PULSE_INGESTION_FOUNDATION.md.
  possibleDuplicateOfId: ID | null;
  relevanceScore: number | null;
  discoveryRunId: string | null;
};

// Journal V1 presentation (Phase E, 2026-08-24) — see
// PULSE_INGESTION_FOUNDATION.md. Admin-picked Lead Story reference only;
// resolved against the merged Stories feed at the page layer.
export type JournalSettings = {
  leadStoryId: ID | null;
};

// Global operational controls for Pulse discovery/publishing (Phase A,
// 2026-08-24). Nothing reads this yet — see PULSE_INGESTION_FOUNDATION.md.
export type PulseSettings = {
  discoveryEnabled: boolean;
  globalAutoPublishEnabled: boolean;
  maxPostsPerDay: number;
  minimumRelevanceScore: number;
  regionWeight: number;
  topicWeight: number;
  freshnessWeight: number;
  trustWeight: number;
  priorityWeight: number;
};
