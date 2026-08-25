import { isPubliclyVisible } from "../journalHelpers";
import { isPubliclyVisible as isPulseArticlePubliclyVisible, isSitemapEligible as isPulseArticleSitemapEligible } from "../pulseHelpers";
import type { ContentRepository } from "../repository";
import {
  CATEGORIES,
  INSTRUCTORS,
  SPONSORS,
  TESTIMONIALS,
  VENUES,
  WORKSHOPS,
} from "./data";
import { AUTHORS, JOURNAL_CATEGORIES, JOURNAL_POSTS } from "./journalData";
import {
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_COLLECTIONS,
  PORTFOLIO_PROJECTS,
  PORTFOLIO_TESTIMONIALS,
} from "./portfolioData";
import {
  PULSE_ARTICLES,
  PULSE_CATEGORIES,
  PULSE_OPPORTUNITY_TYPES,
  PULSE_REGIONS,
  PULSE_SETTINGS,
  PULSE_SOURCES,
} from "./pulseData";
import {
  ABOUT_PAGE,
  FOOTER_SETTINGS,
  FOUNDER,
  HOME_PAGE,
  LEGAL_PAGES,
  NAVIGATION,
  SERVICES,
  SITE_SETTINGS,
} from "./siteWideData";

// Reads from the in-memory sample arrays in ./data.ts. Every method
// returns a Promise to match the ContentRepository contract, even though
// nothing here actually awaits I/O — this keeps every caller identical
// to how it will look once a real CMS adapter (a genuine network call)
// is swapped in. See CMS_MIGRATION.md.
export const localContentRepository: ContentRepository = {
  async getWorkshops() {
    return WORKSHOPS;
  },
  async getWorkshopBySlug(slug) {
    return WORKSHOPS.find((w) => w.slug === slug) ?? null;
  },
  async getInstructors() {
    return INSTRUCTORS;
  },
  async getInstructorBySlug(slug) {
    return INSTRUCTORS.find((i) => i.slug === slug) ?? null;
  },
  async getCategories() {
    return CATEGORIES;
  },
  async getCategoryBySlug(slug) {
    return CATEGORIES.find((c) => c.slug === slug) ?? null;
  },
  async getVenues() {
    return VENUES;
  },
  async getVenueById(id) {
    return VENUES.find((v) => v.id === id) ?? null;
  },
  async getTestimonials() {
    // Shared pool — Workshop.testimonialIds and PortfolioProject.testimonialIds
    // both resolve against this same combined list.
    return [...TESTIMONIALS, ...PORTFOLIO_TESTIMONIALS];
  },
  async getSponsors() {
    return SPONSORS;
  },
  async getPortfolioProjects() {
    return PORTFOLIO_PROJECTS.filter((p) => p.status === "published");
  },
  async getPortfolioProjectBySlug(slug) {
    const project = PORTFOLIO_PROJECTS.find((p) => p.slug === slug);
    return project && project.status === "published" ? project : null;
  },
  async getPortfolioCategories() {
    return PORTFOLIO_CATEGORIES;
  },
  async getPortfolioCollections() {
    return PORTFOLIO_COLLECTIONS;
  },
  async getJournalPosts() {
    return JOURNAL_POSTS.filter(isPubliclyVisible);
  },
  async getJournalPostBySlug(slug) {
    const post = JOURNAL_POSTS.find((p) => p.slug === slug);
    return post && isPubliclyVisible(post) ? post : null;
  },
  async getJournalCategories() {
    return JOURNAL_CATEGORIES;
  },
  async getAuthors() {
    return AUTHORS;
  },
  async getAuthorBySlug(slug) {
    return AUTHORS.find((a) => a.slug === slug) ?? null;
  },
  async getJournalSettings() {
    return { leadStoryId: null };
  },
  async getSiteSettings() {
    return SITE_SETTINGS;
  },
  async getHomePage() {
    return HOME_PAGE;
  },
  async getAboutPage() {
    return ABOUT_PAGE;
  },
  async getFounder() {
    return FOUNDER;
  },
  async getNavigation() {
    return NAVIGATION;
  },
  async getFooterSettings() {
    return FOOTER_SETTINGS;
  },
  async getServices() {
    return SERVICES;
  },
  async getServiceBySlug(slug) {
    return SERVICES.find((s) => s.slug === slug) ?? null;
  },
  async getLegalPage(slug) {
    return LEGAL_PAGES.find((p) => p.slug === slug) ?? null;
  },
  async getPulseArticles() {
    return PULSE_ARTICLES.filter(isPulseArticlePubliclyVisible);
  },
  async getPulseArticleBySlug(slug) {
    const article = PULSE_ARTICLES.find((a) => a.slug === slug);
    return article && isPulseArticlePubliclyVisible(article) ? article : null;
  },
  async getPulseArticleSlugsForSitemap() {
    return PULSE_ARTICLES.filter(isPulseArticleSitemapEligible).map((a) => ({ slug: a.slug, lastModified: a.publishedAt }));
  },
  async getPulseCategories() {
    return PULSE_CATEGORIES;
  },
  async getPulseRegions() {
    return PULSE_REGIONS;
  },
  async getPulseOpportunityTypes() {
    return PULSE_OPPORTUNITY_TYPES;
  },
  async getPulseSources() {
    return PULSE_SOURCES;
  },
  async getPulseSettings() {
    return PULSE_SETTINGS;
  },
};
