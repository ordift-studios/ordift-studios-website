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
  url: string;
  alt: string;
  caption: string | null;
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

export type PortfolioStatus = "draft" | "published";

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
  url: string;
  type: "image" | "video" | "embed";
  alt: string;
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
