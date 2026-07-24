// Reusable GROQ projection fragments — each one shapes a Sanity
// sub-document to match the corresponding domain type in
// src/lib/content/types.ts exactly, so the query result can be used
// as-is without further JS-side mapping. See CMS_MIGRATION.md.

// MediaAsset { url, type, alt } — url resolves from whichever of
// image/file/url is set, based on `type`.
export const mediaAssetFragment = `{
  type,
  "url": select(
    type == "image" => image.asset->url,
    type == "video" => file.asset->url,
    type == "embed" => url
  ),
  alt
}`;

// GalleryImage { id, url, alt, caption } — id comes from the array
// item's auto-generated _key, not a stored field.
export const galleryImageFragment = `{
  "id": _key,
  "url": image.asset->url,
  alt,
  caption
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
const defaultMediaAsset = `{"type": "image", "url": null, "alt": ""}`;
export function requiredMediaAssetFragment(fieldName: string, fieldPath: string): string {
  return `"${fieldName}": coalesce(${fieldPath}${mediaAssetFragment}, ${defaultMediaAsset})`;
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
