// Reusable GROQ projection fragments — each one shapes a Sanity
// sub-document to match the corresponding domain type in
// src/lib/content/types.ts exactly, so the query result can be used
// as-is without further JS-side mapping. See CMS_MIGRATION.md.

// MediaAsset { url, type, alt, width, height, lqip } — url resolves from
// whichever of image/file/url is set, based on `type`. width/height/lqip
// are only meaningful (and only fetched) for type == "image" — a video
// file or embed URL has no Sanity-generated image metadata to read, so
// those come back null rather than a wrong/misleading value. Consumed by
// src/components/media/ResponsiveImage.tsx for automatic aspect-ratio
// sizing and blur-up placeholders (see MEDIA_ARCHITECTURE.md).
export const mediaAssetFragment = `{
  type,
  "url": select(
    type == "image" => image.asset->url,
    type == "video" => file.asset->url,
    type == "embed" => url
  ),
  alt,
  "width": select(type == "image" => image.asset->metadata.dimensions.width),
  "height": select(type == "image" => image.asset->metadata.dimensions.height),
  "lqip": select(type == "image" => image.asset->metadata.lqip)
}`;

// GalleryImage { id, url, alt, caption, width, height, lqip } — id comes
// from the array item's auto-generated _key, not a stored field. Always
// an image (unlike MediaAsset), so metadata is unconditional.
export const galleryImageFragment = `{
  "id": _key,
  "url": image.asset->url,
  alt,
  caption,
  "width": image.asset->metadata.dimensions.width,
  "height": image.asset->metadata.dimensions.height,
  "lqip": image.asset->metadata.lqip
}`;

// SeoFields { metaTitle, metaDescription, ogImageUrl, canonicalUrl }
const seoShape = `{
  metaTitle,
  metaDescription,
  "ogImageUrl": ogImage.asset->url,
  canonicalUrl
}`;
const defaultSeo = `{"metaTitle": null, "metaDescription": null, "ogImageUrl": null, "canonicalUrl": null}`;

// SeoFields (and CertificateInfo below) are non-nullable object types in
// the domain model, but the corresponding Sanity field is optional (an
// editor can leave the whole panel blank) — a plain projection then
// returns `null` for the field, which crashes any page that does
// `project.seo.metaTitle` etc. `coalesce()` guarantees a well-formed
// object either way. Found live while verifying the connection
// (2026-07-24) — the first seeded portfolio project had no `seo` set and
// crashed the detail page until this fix.
export function seoFragment(outputKey: string, fieldPath: string = outputKey): string {
  return `"${outputKey}": coalesce(${fieldPath}${seoShape}, ${defaultSeo})`;
}

const defaultCertificate = `{"offered": false, "description": null}`;
export function certificateFragment(fieldPath: string): string {
  return `"certificate": coalesce(${fieldPath}, ${defaultCertificate})`;
}

// MediaAsset is also non-nullable wherever it's used as a required field
// (Workshop has none; PortfolioProject.heroMedia and JournalPost.heroImage
// do) — same defensive treatment.
const defaultMediaAsset = `{"type": "image", "url": null, "alt": "", "width": null, "height": null, "lqip": null}`;
export function requiredMediaAssetFragment(fieldName: string, fieldPath: string): string {
  return `"${fieldName}": coalesce(${fieldPath}${mediaAssetFragment}, ${defaultMediaAsset})`;
}

// PresentationImage { url, alt, width, height, lqip } — a single plain
// Sanity `image` field (not the polymorphic MediaAsset union), used for
// admin-chosen presentation-only images (Service.workLandingImage,
// PortfolioProject.coverImage). Alt text lives in a separate sibling
// field (`${fieldName}Alt`, matching homepageSlideshowSlide's own
// landscapeAlt/portraitAlt convention), not nested inside the image
// object, so every reference is a full path from the document root
// rather than relying on GROQ's projection scope. `select(defined(...))`
// returns null outright when the field was never set, rather than an
// object of all-null sub-fields, so callers can use a simple `?? fallback`
// check.
export function optionalImageFragment(fieldName: string): string {
  return `"${fieldName}": select(defined(${fieldName}.asset) => {
    "url": ${fieldName}.asset->url,
    "alt": ${fieldName}Alt,
    "width": ${fieldName}.asset->metadata.dimensions.width,
    "height": ${fieldName}.asset->metadata.dimensions.height,
    "lqip": ${fieldName}.asset->metadata.lqip
  })`;
}

// Category { id, slug, name, description } — shared shape across the
// three separate category document types (workshopCategory,
// portfolioCategory, journalCategory).
export const categoryFragment = `{
  "id": _id,
  "slug": slug.current,
  name,
  description
}`;
