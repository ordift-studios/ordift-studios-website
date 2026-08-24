import type {
  AboutPage,
  Author,
  Category,
  Collection,
  Founder,
  FooterSettings,
  HomePage,
  Instructor,
  JournalPost,
  LegalPage,
  LegalPageSlug,
  Navigation,
  JournalSettings,
  PortfolioProject,
  PulseArticle,
  PulseSettings,
  PulseSource,
  Service,
  SiteSettings,
  Sponsor,
  Testimonial,
  Venue,
  Workshop,
} from "./types";

// The one seam every page/route reads content through. Every method
// returns a Promise even though today's implementation (LocalContentRepository)
// resolves synchronously — a real CMS adapter (Sanity or otherwise) is a
// network call, and this interface is written for that from day one so
// swapping the implementation never touches a caller's code. See
// CMS_MIGRATION.md for how to implement and swap in a new adapter.
export interface ContentRepository {
  getWorkshops(): Promise<Workshop[]>;
  getWorkshopBySlug(slug: string): Promise<Workshop | null>;
  getInstructors(): Promise<Instructor[]>;
  getInstructorBySlug(slug: string): Promise<Instructor | null>;
  getCategories(): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  getVenues(): Promise<Venue[]>;
  getVenueById(id: string): Promise<Venue | null>;
  getTestimonials(): Promise<Testimonial[]>;
  getSponsors(): Promise<Sponsor[]>;

  // Portfolio — both methods return published projects only (drafts are
  // never visible on the public site; there is no authenticated preview
  // mode yet — see ARCHITECTURE.md §4.3). A future admin/preview surface
  // would add separate methods rather than change these.
  getPortfolioProjects(): Promise<PortfolioProject[]>;
  getPortfolioProjectBySlug(slug: string): Promise<PortfolioProject | null>;
  getPortfolioCategories(): Promise<Category[]>;
  getPortfolioCollections(): Promise<Collection[]>;

  // Journal — public methods return only posts that are both published
  // and past their scheduled publish date (see JournalPost.scheduledFor).
  // Same "no admin preview yet" caveat as Portfolio drafts.
  getJournalPosts(): Promise<JournalPost[]>;
  getJournalPostBySlug(slug: string): Promise<JournalPost | null>;
  getJournalCategories(): Promise<Category[]>;
  getAuthors(): Promise<Author[]>;
  getAuthorBySlug(slug: string): Promise<Author | null>;
  // Phase E (2026-08-24) — the admin-picked Lead Story reference only.
  getJournalSettings(): Promise<JournalSettings>;

  // Site-wide content (Version 1.2.6) — all singletons except getServices
  // (repeatable, one per department) and getLegalPage (repeatable, one
  // per legal document). No "by slug" lookup needed for singletons since
  // there is exactly one of each.
  getSiteSettings(): Promise<SiteSettings>;
  getHomePage(): Promise<HomePage>;
  getAboutPage(): Promise<AboutPage>;
  getFounder(): Promise<Founder>;
  getNavigation(): Promise<Navigation>;
  getFooterSettings(): Promise<FooterSettings>;
  getServices(): Promise<Service[]>;
  getServiceBySlug(slug: string): Promise<Service | null>;
  getLegalPage(slug: LegalPageSlug): Promise<LegalPage | null>;

  // Ordift Pulse (architecture only, 2026-07-27 — see PULSE_ARCHITECTURE.md).
  // Public methods return only articles that are both published and past
  // their scheduled publish date, same "no admin preview yet" caveat as
  // Journal/Portfolio. getPulseSources is the trusted-source registry —
  // read-only here; no ingestion logic exists yet.
  getPulseArticles(): Promise<PulseArticle[]>;
  getPulseArticleBySlug(slug: string): Promise<PulseArticle | null>;
  getPulseCategories(): Promise<Category[]>;
  getPulseRegions(): Promise<Category[]>;
  getPulseOpportunityTypes(): Promise<Category[]>;
  getPulseSources(): Promise<PulseSource[]>;
  // Phase A foundation only (2026-08-24) — global discovery/publishing
  // controls, unread by any code path yet. See
  // PULSE_INGESTION_FOUNDATION.md.
  getPulseSettings(): Promise<PulseSettings>;
}
