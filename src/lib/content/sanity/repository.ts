import { client } from "@/sanity/lib/client";
import type { ContentRepository } from "../repository";
import type {
  AboutPage,
  Author,
  Category,
  Collection,
  Founder,
  FooterSettings,
  HomePage,
  HomepageSlideshowSlide,
  Instructor,
  JournalPost,
  LegalPage,
  Navigation,
  PortfolioProject,
  PulseArticle,
  PulseSource,
  Service,
  SiteSettings,
  Sponsor,
  Testimonial,
  Venue,
  Workshop,
} from "../types";
import {
  aboutPageQuery,
  authorBySlugQuery,
  authorsQuery,
  footerSettingsQuery,
  founderQuery,
  homePageQuery,
  instructorBySlugQuery,
  instructorsQuery,
  journalCategoriesQuery,
  journalPostBySlugQuery,
  journalPostsQuery,
  legalPageQuery,
  navigationQuery,
  portfolioCategoriesQuery,
  portfolioCollectionsQuery,
  portfolioProjectBySlugQuery,
  portfolioProjectsQuery,
  pulseArticleBySlugQuery,
  pulseArticlesQuery,
  pulseCategoriesQuery,
  pulseOpportunityTypesQuery,
  pulseRegionsQuery,
  pulseSourcesQuery,
  serviceBySlugQuery,
  servicesQuery,
  siteSettingsQuery,
  sponsorsQuery,
  testimonialsQuery,
  venueByIdQuery,
  venuesQuery,
  workshopBySlugQuery,
  workshopCategoriesQuery,
  workshopsQuery,
} from "./queries";

// Not active yet — src/lib/content/index.ts still points at
// localContentRepository until a live Sanity project exists (see
// CMS_MIGRATION.md "Finishing the connection"). Every query here is
// written and typechecked against the exact same domain types the local
// adapter returns, so switching index.ts to this repository is the only
// change required — no page, component, or API route changes.
//
// Note: getWorkshopCategoryBySlug / getPortfolioCategoryBySlug etc. exist
// on the local repository as implementation details but are NOT part of
// the ContentRepository interface — only getCategoryBySlug is (workshop
// categories). journalCategories/portfolioCollections currently have no
// "by slug" method in the interface either, matching what the frontend
// actually calls today.

// Homepage slideshow landscape/portrait fallback resolution (2026-08-23).
// homePageQuery fetches each curated slide's raw pieces (both orientation
// images, plus the referenced project's own heroMedia as a last-resort
// fallback); this turns that into the clean HomepageSlideshowSlide shape
// the frontend actually consumes, so no fallback logic lives in a
// component. Fallback order per orientation: that orientation's own
// image -> the other orientation's image -> the linked project's
// heroMedia (image-type only — a project's hero can be a video, which
// this slideshow has never supported). A slide with nothing usable at
// all (no images, no usable project fallback) is dropped entirely rather
// than ever rendering broken.
type RawSlideImage = {
  url: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  lqip: string | null;
};
type RawSlideshowSlide = {
  landscapeUrl: string | null;
  landscapeAlt: string | null;
  landscapeWidth: number | null;
  landscapeHeight: number | null;
  landscapeLqip: string | null;
  portraitUrl: string | null;
  portraitAlt: string | null;
  portraitWidth: number | null;
  portraitHeight: number | null;
  portraitLqip: string | null;
  projectFallback: (RawSlideImage & { type: string | null }) | null;
};
type RawHomePage = Omit<HomePage, "slideshowSlides"> & { slideshowSlides: RawSlideshowSlide[] };

function resolveSlideshowSlide(raw: RawSlideshowSlide): HomepageSlideshowSlide | null {
  const landscape: RawSlideImage | null = raw.landscapeUrl ? { url: raw.landscapeUrl, alt: raw.landscapeAlt, width: raw.landscapeWidth, height: raw.landscapeHeight, lqip: raw.landscapeLqip } : null;
  const portrait: RawSlideImage | null = raw.portraitUrl ? { url: raw.portraitUrl, alt: raw.portraitAlt, width: raw.portraitWidth, height: raw.portraitHeight, lqip: raw.portraitLqip } : null;
  const fallback: RawSlideImage | null =
    raw.projectFallback?.type === "image" && raw.projectFallback.url ? raw.projectFallback : null;

  const toMediaAsset = (img: RawSlideImage | null) =>
    img?.url ? { type: "image" as const, url: img.url, alt: img.alt ?? "", width: img.width, height: img.height, lqip: img.lqip } : null;

  const resolvedLandscape = toMediaAsset(landscape ?? portrait ?? fallback);
  const resolvedPortrait = toMediaAsset(portrait ?? landscape ?? fallback);
  if (!resolvedLandscape && !resolvedPortrait) return null;

  return { landscape: resolvedLandscape, portrait: resolvedPortrait };
}

export const sanityContentRepository: ContentRepository = {
  async getWorkshops() {
    return client.fetch<Workshop[]>(workshopsQuery);
  },
  async getWorkshopBySlug(slug) {
    return client.fetch<Workshop | null>(workshopBySlugQuery, { slug });
  },
  async getInstructors() {
    return client.fetch<Instructor[]>(instructorsQuery);
  },
  async getInstructorBySlug(slug) {
    return client.fetch<Instructor | null>(instructorBySlugQuery, { slug });
  },
  async getCategories() {
    return client.fetch<Category[]>(workshopCategoriesQuery);
  },
  async getCategoryBySlug(slug) {
    return client.fetch<Category | null>(
      `*[_type == "workshopCategory" && slug.current == $slug][0]{"id": _id, "slug": slug.current, name, description}`,
      { slug }
    );
  },
  async getVenues() {
    return client.fetch<Venue[]>(venuesQuery);
  },
  async getVenueById(id) {
    return client.fetch<Venue | null>(venueByIdQuery, { id });
  },
  async getTestimonials() {
    return client.fetch<Testimonial[]>(testimonialsQuery);
  },
  async getSponsors() {
    return client.fetch<Sponsor[]>(sponsorsQuery);
  },
  async getPortfolioProjects() {
    return client.fetch<PortfolioProject[]>(portfolioProjectsQuery);
  },
  async getPortfolioProjectBySlug(slug) {
    return client.fetch<PortfolioProject | null>(portfolioProjectBySlugQuery, { slug });
  },
  async getPortfolioCategories() {
    return client.fetch<Category[]>(portfolioCategoriesQuery);
  },
  async getPortfolioCollections() {
    return client.fetch<Collection[]>(portfolioCollectionsQuery);
  },
  async getJournalPosts() {
    return client.fetch<JournalPost[]>(journalPostsQuery);
  },
  async getJournalPostBySlug(slug) {
    return client.fetch<JournalPost | null>(journalPostBySlugQuery, { slug });
  },
  async getJournalCategories() {
    return client.fetch<Category[]>(journalCategoriesQuery);
  },
  async getAuthors() {
    return client.fetch<Author[]>(authorsQuery);
  },
  async getAuthorBySlug(slug) {
    return client.fetch<Author | null>(authorBySlugQuery, { slug });
  },
  async getSiteSettings() {
    return client.fetch<SiteSettings>(siteSettingsQuery);
  },
  async getHomePage() {
    const raw = await client.fetch<RawHomePage>(homePageQuery);
    // GROQ returns null (not []) for an array projection on a document
    // that has never had this field set — real, hit during this exact
    // build (`slideshowSlides` doesn't exist yet on the live `homepage`
    // document). Guard rather than assume.
    const slideshowSlides = (raw.slideshowSlides ?? [])
      .map(resolveSlideshowSlide)
      .filter((s): s is HomepageSlideshowSlide => s !== null);
    return { ...raw, slideshowSlides };
  },
  async getAboutPage() {
    return client.fetch<AboutPage>(aboutPageQuery);
  },
  async getFounder() {
    return client.fetch<Founder>(founderQuery);
  },
  async getNavigation() {
    return client.fetch<Navigation>(navigationQuery);
  },
  async getFooterSettings() {
    return client.fetch<FooterSettings>(footerSettingsQuery);
  },
  async getServices() {
    return client.fetch<Service[]>(servicesQuery);
  },
  async getServiceBySlug(slug) {
    return client.fetch<Service | null>(serviceBySlugQuery, { slug });
  },
  async getLegalPage(slug) {
    return client.fetch<LegalPage | null>(legalPageQuery, { slug });
  },
  async getPulseArticles() {
    return client.fetch<PulseArticle[]>(pulseArticlesQuery);
  },
  async getPulseArticleBySlug(slug) {
    return client.fetch<PulseArticle | null>(pulseArticleBySlugQuery, { slug });
  },
  async getPulseCategories() {
    return client.fetch<Category[]>(pulseCategoriesQuery);
  },
  async getPulseRegions() {
    return client.fetch<Category[]>(pulseRegionsQuery);
  },
  async getPulseOpportunityTypes() {
    return client.fetch<Category[]>(pulseOpportunityTypesQuery);
  },
  async getPulseSources() {
    return client.fetch<PulseSource[]>(pulseSourcesQuery);
  },
};
