import {
  categoryFragment,
  certificateFragment,
  galleryImageFragment,
  mediaAssetFragment,
  requiredMediaAssetFragment,
  seoFragment,
} from "./groqFragments";

export const workshopFragment = `{
  "id": _id,
  "slug": slug.current,
  title,
  shortDescription,
  description,
  status,
  "categoryIds": categories[]._ref,
  "instructorIds": instructors[]._ref,
  "venueId": venue._ref,
  capacity,
  startDate,
  endDate,
  registrationDeadline,
  experienceLevels,
  requiresPayment,
  learningOutcomes,
  "agenda": agenda[]{"id": _key, time, title, description},
  "gallery": gallery[]${galleryImageFragment},
  "faqs": faqs[]{"id": _key, question, answer},
  ${certificateFragment("certificate")},
  "testimonialIds": testimonials[]._ref,
  "sponsorIds": sponsors[]._ref,
  "relatedWorkshopIds": relatedWorkshops[]._ref,
  isRecurring,
  recurrenceNote,
  isOnlineAttendancePossible,
  hasRecordedSession,
  isMembersOnly,
  ${seoFragment("seo")}
}`;

export const workshopsQuery = `*[_type == "workshop"] | order(startDate asc) ${workshopFragment}`;
export const workshopBySlugQuery = `*[_type == "workshop" && slug.current == $slug][0] ${workshopFragment}`;

export const instructorFragment = `{
  "id": _id,
  "slug": slug.current,
  name,
  "title": jobTitle,
  bio,
  "photoUrl": photo.asset->url,
  credentials,
  isPlaceholder
}`;
export const instructorsQuery = `*[_type == "instructor"] ${instructorFragment}`;
export const instructorBySlugQuery = `*[_type == "instructor" && slug.current == $slug][0] ${instructorFragment}`;

export const venueFragment = `{
  "id": _id,
  name,
  addressLine,
  format,
  mapUrl
}`;
export const venuesQuery = `*[_type == "venue"] ${venueFragment}`;
export const venueByIdQuery = `*[_type == "venue" && _id == $id][0] ${venueFragment}`;

export const testimonialFragment = `{
  "id": _id,
  quote,
  authorName,
  authorRole,
  isPlaceholder
}`;
export const testimonialsQuery = `*[_type == "testimonial"] ${testimonialFragment}`;

export const sponsorFragment = `{
  "id": _id,
  name,
  "logoUrl": logo.asset->url,
  url,
  isPlaceholder
}`;
export const sponsorsQuery = `*[_type == "sponsor"] ${sponsorFragment}`;

export const workshopCategoriesQuery = `*[_type == "workshopCategory"] ${categoryFragment}`;
export const workshopCategoryBySlugQuery = `*[_type == "workshopCategory" && slug.current == $slug][0] ${categoryFragment}`;

export const portfolioProjectFragment = `{
  "id": _id,
  "slug": slug.current,
  title,
  status,
  featured,
  ${requiredMediaAssetFragment("heroMedia", "heroMedia")},
  disciplines,
  "categoryIds": categories[]._ref,
  "collectionIds": collections[]._ref,
  seriesOrder,
  client,
  year,
  location,
  servicesProvided,
  equipmentUsed,
  tags,
  "collaborators": collaborators[]{"id": _key, name, role},
  story,
  objective,
  strategy,
  challenges,
  solution,
  process,
  deliverables,
  results,
  "awards": awards[]{"id": _key, title, issuer, year},
  "publications": publications[]{"id": _key, name, url, year},
  "gallery": gallery[]${galleryImageFragment},
  "behindTheScenesGallery": behindTheScenesGallery[]${galleryImageFragment},
  "beforeAfterGallery": beforeAfterGallery[]{
    "id": _key,
    "before": before${mediaAssetFragment},
    "after": after${mediaAssetFragment},
    caption
  },
  "videos": videos[]${mediaAssetFragment},
  "downloadableAssets": downloadableAssets[]{"id": _key, label, "url": file.asset->url, fileType},
  "testimonialIds": testimonials[]._ref,
  "relatedProjectIds": relatedProjects[]._ref,
  "relatedWorkshopIds": relatedWorkshops[]._ref,
  isPasswordProtected,
  ${seoFragment("seo")}
}`;

export const portfolioProjectsQuery = `*[_type == "portfolioProject" && status == "published"] | order(_createdAt desc) ${portfolioProjectFragment}`;
export const portfolioProjectBySlugQuery = `*[_type == "portfolioProject" && slug.current == $slug && status == "published"][0] ${portfolioProjectFragment}`;

export const portfolioCategoriesQuery = `*[_type == "portfolioCategory"] ${categoryFragment}`;
export const portfolioCategoryBySlugQuery = `*[_type == "portfolioCategory" && slug.current == $slug][0] ${categoryFragment}`;

export const portfolioCollectionFragment = `{
  "id": _id,
  "slug": slug.current,
  name,
  description,
  isOrdered
}`;
export const portfolioCollectionsQuery = `*[_type == "portfolioCollection"] ${portfolioCollectionFragment}`;

export const authorFragment = `{
  "id": _id,
  "slug": slug.current,
  name,
  "title": jobTitle,
  bio,
  "photoUrl": photo.asset->url,
  isPlaceholder
}`;
export const authorsQuery = `*[_type == "author"] ${authorFragment}`;
export const authorBySlugQuery = `*[_type == "author" && slug.current == $slug][0] ${authorFragment}`;

export const journalCategoriesQuery = `*[_type == "journalCategory"] ${categoryFragment}`;
export const journalCategoryBySlugQuery = `*[_type == "journalCategory" && slug.current == $slug][0] ${categoryFragment}`;

// Scheduled publishing gate: visible once status is "published" AND
// either no scheduledFor is set, or it's already in the past — mirrors
// isPubliclyVisible() in journalHelpers.ts exactly, just evaluated in
// GROQ instead of JS. now() is GROQ's server-evaluated current timestamp.
const journalVisibilityFilter = `status == "published" && (!defined(scheduledFor) || scheduledFor <= now())`;

export const journalPostFragment = `{
  "id": _id,
  "slug": slug.current,
  title,
  status,
  featured,
  format,
  "authorId": author._ref,
  "categoryIds": categories[]._ref,
  tags,
  ${requiredMediaAssetFragment("heroImage", "heroImage")},
  videoUrl,
  excerpt,
  body,
  publishedAt,
  scheduledFor,
  "relatedPostIds": relatedPosts[]._ref,
  "relatedProjectIds": relatedProjects[]._ref,
  "relatedWorkshopIds": relatedWorkshops[]._ref,
  newsletterExcerpt,
  ${seoFragment("seo")}
}`;

export const journalPostsQuery = `*[_type == "journalPost" && ${journalVisibilityFilter}] | order(publishedAt desc) ${journalPostFragment}`;
export const journalPostBySlugQuery = `*[_type == "journalPost" && slug.current == $slug && ${journalVisibilityFilter}][0] ${journalPostFragment}`;

// --- Site-wide content (Version 1.2.6) ---

export const siteSettingsQuery = `*[_type == "siteSettings"][0]{
  siteName,
  tagline,
  "logoUrl": logo.asset->url,
  contactEmail,
  whatsappNumber,
  socialLinks,
  ${seoFragment("defaultSeo")}
}`;

export const homePageQuery = `*[_type == "homepage"][0]{
  heroEyebrow, heroHeadline, heroSubheadline, heroPrimaryCta, heroSecondaryCta,
  whoWeAreEyebrow, whoWeAreBody,
  originalsEyebrow, originalsHeadline, originalsBody,
  process,
  ctaHeadline, ctaBody, ctaPrimary, ctaSecondary,
  ${seoFragment("seo")}
}`;

export const aboutPageQuery = `*[_type == "aboutPage"][0]{
  heroEyebrow, heroHeadline,
  storyEyebrow, storyHeadline, storyBody,
  mission, vision, values,
  teamEyebrow, teamHeadline, teamBody,
  ctaHeadline, ctaBody,
  ${seoFragment("seo")}
}`;

export const founderQuery = `*[_type == "founder"][0]{
  name,
  "title": jobTitle,
  "photoUrl": photo.asset->url,
  bio
}`;

export const navigationQuery = `*[_type == "navigation"][0]{links, primaryCta}`;

export const footerSettingsQuery = `*[_type == "footerSettings"][0]{tagline, columns}`;

export const serviceFragment = `{
  "id": _id,
  "slug": slug.current,
  name,
  summaryDescription,
  heroEyebrow, heroHeadline, heroBody,
  offeringsHeadline, offerings,
  additionalHeading, additionalItems,
  ctaEyebrow, ctaHeadline, ctaBody, ctaPrimaryLabel, ctaSecondaryLabel,
  isComingSoon,
  displayOrder,
  ${seoFragment("seo")}
}`;
export const servicesQuery = `*[_type == "service"] | order(displayOrder asc) ${serviceFragment}`;
export const serviceBySlugQuery = `*[_type == "service" && slug.current == $slug][0] ${serviceFragment}`;

export const legalPageQuery = `*[_type == "legalPage" && slug.current == $slug][0]{
  "slug": slug.current,
  title,
  body,
  isApproved,
  lastUpdated
}`;

// --- Ordift Pulse — Creative Industry Hub (architecture, 2026-07-27) ---
// See PULSE_ARCHITECTURE.md. Three independent taxonomy lookups reuse
// categoryFragment (same {id, slug, name, description} shape as
// journalCategory/portfolioCategory/workshopCategory).

export const pulseCategoriesQuery = `*[_type == "pulseCategory"] ${categoryFragment}`;
export const pulseRegionsQuery = `*[_type == "pulseRegion"] ${categoryFragment}`;
export const pulseOpportunityTypesQuery = `*[_type == "pulseOpportunityType"] ${categoryFragment}`;

export const pulseSourceFragment = `{
  "id": _id,
  name,
  sourceType,
  url,
  licenseNotes,
  isActive
}`;
export const pulseSourcesQuery = `*[_type == "pulseSource"] | order(name asc) ${pulseSourceFragment}`;

// Same scheduled-publishing gate as Journal (journalVisibilityFilter
// above), duplicated rather than shared since Pulse's status enum
// differs (draft/inReview/published/archived vs. Journal's
// draft/published) — see PULSE_ARCHITECTURE.md §4 and
// pulseHelpers.isPubliclyVisible for the equivalent JS-side check.
const pulseVisibilityFilter = `status == "published" && (!defined(scheduledFor) || scheduledFor <= now())`;

export const pulseArticleFragment = `{
  "id": _id,
  "slug": slug.current,
  contentKind,
  origin,
  status,
  featured,
  title,
  excerpt,
  ${requiredMediaAssetFragment("heroMedia", "heroMedia")},
  "authorId": author._ref,
  "categoryIds": categories[]._ref,
  "regionIds": regions[]._ref,
  "opportunityTypeIds": opportunityTypes[]._ref,
  tags,
  body,
  "sourceId": source._ref,
  sourceUrl,
  sourceAttribution,
  aiSummary,
  aiSummaryApprovedAt,
  applicationDeadline,
  eventStartDate,
  eventEndDate,
  location,
  applyUrl,
  eligibility,
  publishedAt,
  scheduledFor,
  "relatedArticleIds": relatedArticles[]._ref,
  "relatedProjectIds": relatedProjects[]._ref,
  "relatedWorkshopIds": relatedWorkshops[]._ref,
  newsletterExcerpt,
  ${seoFragment("seo")}
}`;

export const pulseArticlesQuery = `*[_type == "pulseArticle" && ${pulseVisibilityFilter}] | order(coalesce(publishedAt, _createdAt) desc) ${pulseArticleFragment}`;
export const pulseArticleBySlugQuery = `*[_type == "pulseArticle" && slug.current == $slug && ${pulseVisibilityFilter}][0] ${pulseArticleFragment}`;
