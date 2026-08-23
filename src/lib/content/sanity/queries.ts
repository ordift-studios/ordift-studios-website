import {
  categoryFragment,
  certificateFragment,
  galleryImageFragment,
  mediaAssetFragment,
  optionalImageFragment,
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

// Scheduled publishing gate: visible once status is "published" AND
// either no scheduledFor is set, or it's already in the past — same
// pattern as journalVisibilityFilter above (defined ahead of first
// use so both this and journalPostsQuery can share the exact wording).
const portfolioVisibilityFilter = `status == "published" && (!defined(scheduledFor) || scheduledFor <= now())`;

// Every array field below is wrapped in coalesce(..., []) — Sanity
// returns null (not []) for an array field that was never initialized
// at all, as opposed to one saved empty. Found live (2026-08-05): a
// project created via the native Admin Portal wizard crashed its own
// public page with "Cannot read properties of null (reading
// 'includes')" because relatedWorkshops/beforeAfterGallery are
// deliberately Studio-only fields the wizard never touches, so they
// stayed fully unset rather than merely empty. Defended at the query
// layer (not just the wizard) since a Studio editor can just as
// easily leave any optional array field untouched.
export const portfolioProjectFragment = `{
  "id": _id,
  "slug": slug.current,
  title,
  status,
  scheduledFor,
  featured,
  ${requiredMediaAssetFragment("heroMedia", "heroMedia")},
  ${optionalImageFragment("coverImage")},
  "disciplines": coalesce(disciplines, []),
  "categoryIds": coalesce(categories[]._ref, []),
  "collectionIds": coalesce(collections[]._ref, []),
  seriesOrder,
  client,
  year,
  location,
  "servicesProvided": coalesce(servicesProvided, []),
  "equipmentUsed": coalesce(equipmentUsed, []),
  "tags": coalesce(tags, []),
  "collaborators": coalesce(collaborators[]{"id": _key, name, role}, []),
  story,
  objective,
  strategy,
  challenges,
  solution,
  process,
  "deliverables": coalesce(deliverables, []),
  results,
  "awards": coalesce(awards[]{"id": _key, title, issuer, year}, []),
  "publications": coalesce(publications[]{"id": _key, name, url, year}, []),
  "gallery": coalesce(gallery[]${galleryImageFragment}, []),
  "behindTheScenesGallery": coalesce(behindTheScenesGallery[]${galleryImageFragment}, []),
  "beforeAfterGallery": coalesce(beforeAfterGallery[]{
    "id": _key,
    "before": before${mediaAssetFragment},
    "after": after${mediaAssetFragment},
    caption
  }, []),
  "videos": coalesce(videos[]${mediaAssetFragment}, []),
  "downloadableAssets": coalesce(downloadableAssets[]{"id": _key, label, "url": file.asset->url, fileType}, []),
  "testimonialIds": coalesce(testimonials[]._ref, []),
  "relatedProjectIds": coalesce(relatedProjects[]._ref, []),
  "relatedWorkshopIds": coalesce(relatedWorkshops[]._ref, []),
  isPasswordProtected,
  ${seoFragment("seo")}
}`;

export const portfolioProjectsQuery = `*[_type == "portfolioProject" && ${portfolioVisibilityFilter}] | order(_createdAt desc) ${portfolioProjectFragment}`;
export const portfolioProjectBySlugQuery = `*[_type == "portfolioProject" && slug.current == $slug && ${portfolioVisibilityFilter}][0] ${portfolioProjectFragment}`;

// Admin Portal (/admin/portfolio) — every project regardless of status,
// for the management dashboard/list. Never used by public-facing code.
export const allPortfolioProjectsQuery = `*[_type == "portfolioProject"] | order(_createdAt desc) ${portfolioProjectFragment}`;
export const portfolioProjectByIdQuery = `*[_type == "portfolioProject" && _id == $id][0] ${portfolioProjectFragment}`;

// Native creation/editing (2026-08-05) — slug-uniqueness check for the
// wizard's Project Basics step.
export const portfolioSlugExistsQuery = `*[_type == "portfolioProject" && slug.current == $slug][0]._id`;

// Edit-mode fetch — unlike portfolioProjectFragment (resolved read
// shape, used everywhere else), this keeps each image field's raw
// asset id + hotspot alongside the resolved preview URL, so the
// wizard (PortfolioProjectForm.tsx) can round-trip an unmodified image
// back into a Sanity patch without the user having to re-upload it.
const editImageShape = `{
  type, alt,
  "assetId": image.asset._ref,
  "url": image.asset->url,
  "hotspotX": image.hotspot.x,
  "hotspotY": image.hotspot.y
}`;
const editGalleryItemShape = `{
  "key": _key, alt, caption, productionNotes,
  "assetId": image.asset._ref,
  "url": image.asset->url,
  "hotspotX": image.hotspot.x,
  "hotspotY": image.hotspot.y
}`;

export const portfolioProjectEditQuery = `*[_type == "portfolioProject" && _id == $id][0]{
  _id, title, "slug": slug.current, status,
  disciplines, year, location, client, isPasswordProtected,
  "heroMedia": heroMedia${editImageShape},
  "gallery": gallery[]${editGalleryItemShape},
  "behindTheScenesGallery": behindTheScenesGallery[]${editGalleryItemShape},
  "videos": videos[]{type, url, alt},
  "downloadableAssets": downloadableAssets[]{"key": _key, label, fileType, "assetId": file.asset._ref, "url": file.asset->url},
  "categoryIds": categories[]._ref,
  "collectionIds": collections[]._ref,
  seriesOrder, tags, servicesProvided, equipmentUsed,
  story, objective, strategy, challenges, solution, process, results, deliverables,
  "awards": awards[]{"key": _key, title, issuer, year},
  "publications": publications[]{"key": _key, name, url, year},
  "collaborators": collaborators[]{"key": _key, name, role},
  "testimonialIds": testimonials[]._ref,
  "relatedProjectIds": relatedProjects[]._ref,
  "seoTitle": seo.metaTitle,
  "seoDescription": seo.metaDescription
}`;

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

// Raw slide shape, pre-fallback-resolution — resolveSlideshowSlide() in
// repository.ts turns this into the clean HomepageSlideshowSlide the
// frontend actually consumes. Only enabled slides are fetched at all
// (filtered here, not in JS) so array order — which drives display
// order — is preserved exactly as curated in Studio. `projectFallback`
// is only ever used when BOTH landscapeImage and portraitImage are unset
// on this slide; guarded to type == "image" since a project's heroMedia
// can be a video, which this slideshow has never supported.
export const homePageQuery = `*[_type == "homepage"][0]{
  heroEyebrow, heroHeadline, heroSubheadline, heroPrimaryCta, heroSecondaryCta,
  ${requiredMediaAssetFragment("heroImage", "heroImage")},
  "slideshowSlides": slideshowSlides[enabled == true]{
    "landscapeUrl": landscapeImage.asset->url,
    "landscapeAlt": landscapeAlt,
    "landscapeWidth": landscapeImage.asset->metadata.dimensions.width,
    "landscapeHeight": landscapeImage.asset->metadata.dimensions.height,
    "landscapeLqip": landscapeImage.asset->metadata.lqip,
    "portraitUrl": portraitImage.asset->url,
    "portraitAlt": portraitAlt,
    "portraitWidth": portraitImage.asset->metadata.dimensions.width,
    "portraitHeight": portraitImage.asset->metadata.dimensions.height,
    "portraitLqip": portraitImage.asset->metadata.lqip,
    "projectFallback": project->{
      "type": heroMedia.type,
      "url": heroMedia.image.asset->url,
      "alt": heroMedia.alt,
      "width": heroMedia.image.asset->metadata.dimensions.width,
      "height": heroMedia.image.asset->metadata.dimensions.height,
      "lqip": heroMedia.image.asset->metadata.lqip
    }
  },
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
  ${optionalImageFragment("workLandingImage")},
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
// "archived" is included deliberately (unlike "draft"/"inReview") — an
// archived item stays visible on the public Stories/Journal hub, shown
// with an "Archived" trust badge (see storiesFeed.ts) rather than
// disappearing, per STORIES_PULSE_INTEGRATION.md.
const pulseVisibilityFilter = `(status == "published" || status == "archived") && (!defined(scheduledFor) || scheduledFor <= now())`;

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
