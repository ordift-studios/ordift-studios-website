import type { SchemaTypeDefinition } from "sanity";

// Objects (reusable field sets, not top-level documents)
import ctaButton from "./objects/ctaButton";
import galleryImage from "./objects/galleryImage";
import homepageSlideshowSlide from "./objects/homepageSlideshowSlide";
import mediaAsset from "./objects/mediaAsset";
import seo from "./objects/seo";
import socialLink from "./objects/socialLink";

// Documents — Workshops, Portfolio, Stories ecosystem (mirror the
// existing ContentRepository domain model 1:1; see CMS_MIGRATION.md)
import author from "./documents/author";
import instructor from "./documents/instructor";
import journalCategory from "./documents/journalCategory";
import journalPost from "./documents/journalPost";
import journalSettings from "./documents/journalSettings";
import portfolioCategory from "./documents/portfolioCategory";
import portfolioCollection from "./documents/portfolioCollection";
import portfolioProject from "./documents/portfolioProject";
import pulseArticle from "./documents/pulseArticle";
import pulseCategory from "./documents/pulseCategory";
import pulseOpportunityType from "./documents/pulseOpportunityType";
import pulseRegion from "./documents/pulseRegion";
import pulseSettings from "./documents/pulseSettings";
import pulseSource from "./documents/pulseSource";
import sponsor from "./documents/sponsor";
import tag from "./documents/tag";
import testimonial from "./documents/testimonial";
import venue from "./documents/venue";
import workshop from "./documents/workshop";
import workshopCategory from "./documents/workshopCategory";

// Documents — site-wide content (schema-prepared this milestone; not yet
// wired to ContentRepository/pages — see MILESTONES.md V "CMS Integration")
import aboutPage from "./documents/aboutPage";
import announcementBanner from "./documents/announcementBanner";
import brand from "./documents/brand";
import certificate from "./documents/certificate";
import client from "./documents/client";
import faq from "./documents/faq";
import footerSettings from "./documents/footerSettings";
import founder from "./documents/founder";
import gallery from "./documents/gallery";
import homepage from "./documents/homepage";
import landingPage from "./documents/landingPage";
import legalPage from "./documents/legalPage";
import navigation from "./documents/navigation";
import partner from "./documents/partner";
import pricingPackage from "./documents/pricing";
import service from "./documents/service";
import siteSettings from "./documents/siteSettings";
import teamMember from "./documents/teamMember";

export const schemaTypes: SchemaTypeDefinition[] = [
  // objects
  ctaButton,
  galleryImage,
  homepageSlideshowSlide,
  mediaAsset,
  seo,
  socialLink,
  // connected documents
  author,
  instructor,
  journalCategory,
  journalPost,
  journalSettings,
  portfolioCategory,
  portfolioCollection,
  portfolioProject,
  pulseArticle,
  pulseCategory,
  pulseOpportunityType,
  pulseRegion,
  pulseSettings,
  pulseSource,
  sponsor,
  tag,
  testimonial,
  venue,
  workshop,
  workshopCategory,
  // site-wide documents
  aboutPage,
  announcementBanner,
  brand,
  certificate,
  client,
  faq,
  footerSettings,
  founder,
  gallery,
  homepage,
  landingPage,
  legalPage,
  navigation,
  partner,
  pricingPackage,
  service,
  siteSettings,
  teamMember,
];

// Document type names that are intended to have exactly one instance
// (pinned in the Studio desk structure — see sanity.config.ts).
export const SINGLETON_TYPES = new Set([
  "siteSettings",
  "homepage",
  "aboutPage",
  "founder",
  "navigation",
  "footerSettings",
  "announcementBanner",
  "pulseSettings",
  "journalSettings",
]);
