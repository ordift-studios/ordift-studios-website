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
    return client.fetch<HomePage>(homePageQuery);
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
