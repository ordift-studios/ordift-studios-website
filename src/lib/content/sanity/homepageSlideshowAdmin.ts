// Native-draft architecture (2026-08-27) — admin/editorial code binds
// explicitly to editorialClient (perspective: "drafts") rather than the
// bare, apiVersion-dependent-default client. Aliased to `client` so
// every call site below is unchanged (client/perspective swap only —
// no query, mutation, or business-logic change).
import { editorialClient as client } from "@/sanity/lib/client";

// Admin-only Sanity read/write for the Homepage Slideshow Manager
// (src/app/admin/homepage-slideshow/**) — mirrors portfolioAdmin.ts's
// established pattern exactly (thin, generic write layer; every export
// here is server-only, SANITY_API_TOKEN never reaches a Client
// Component). Whole-array replace on save (matching the array's own
// nature — add/remove/reorder/edit all happen together in one form
// submission), so no per-slide _key tracking is needed; Sanity assigns
// fresh _key values to array items automatically on write.

export type AdminSlideshowSlide = {
  projectId: string | null;
  projectTitle: string | null;
  landscapeAssetId: string | null;
  landscapeUrl: string | null;
  landscapeAlt: string | null;
  portraitAssetId: string | null;
  portraitUrl: string | null;
  portraitAlt: string | null;
  enabled: boolean;
};

const ADMIN_SLIDES_QUERY = `*[_type == "homepage"][0]{
  _id,
  "slides": slideshowSlides[]{
    "projectId": project._ref,
    "projectTitle": project->title,
    "landscapeAssetId": landscapeImage.asset->_id,
    "landscapeUrl": landscapeImage.asset->url,
    landscapeAlt,
    "portraitAssetId": portraitImage.asset->_id,
    "portraitUrl": portraitImage.asset->url,
    portraitAlt,
    enabled
  }
}`;

export async function getHomepageSlideshowSlidesAdmin(): Promise<{
  homepageId: string;
  slides: AdminSlideshowSlide[];
}> {
  const result = await client.fetch<{ _id: string; slides: AdminSlideshowSlide[] | null }>(ADMIN_SLIDES_QUERY);
  return { homepageId: result._id, slides: result.slides ?? [] };
}

// Minimal reference-picker list — id, title, slug only, published
// projects only (draft/pending_review projects aren't meaningful
// slideshow candidates yet). Deliberately not reusing
// getAllPortfolioProjectsAdmin() (returns the full heavy PortfolioProject
// shape used by the Portfolio editor) since this only ever needs three
// fields for a dropdown.
export type PortfolioProjectRefOption = { id: string; title: string; slug: string };

const PUBLISHED_PROJECT_OPTIONS_QUERY = `*[_type == "portfolioProject" && status == "published"] | order(title asc){
  "id": _id,
  title,
  "slug": slug.current
}`;

export async function getPublishedPortfolioProjectOptions(): Promise<PortfolioProjectRefOption[]> {
  return client.fetch<PortfolioProjectRefOption[]>(PUBLISHED_PROJECT_OPTIONS_QUERY);
}

// "Choose from Portfolio" picker data (2026-08-23) — an existing
// project's hero + gallery images, so an admin can reuse an
// already-uploaded asset as a slideshow image instead of only ever
// uploading a fresh file. Fetched lazily, one project at a time (not
// joined onto the options list above), since a project's full gallery
// can be large and most projects are never opened in the picker.
export type PickableProjectImage = { assetId: string; url: string; alt: string | null };
export type ProjectPickableImages = { hero: PickableProjectImage | null; gallery: PickableProjectImage[] };

const PROJECT_PICKABLE_IMAGES_QUERY = `*[_type == "portfolioProject" && _id == $id][0]{
  "hero": select(heroMedia.type == "image" => {
    "assetId": heroMedia.image.asset->_id,
    "url": heroMedia.image.asset->url,
    "alt": heroMedia.alt
  }),
  "gallery": gallery[defined(image.asset)]{
    "assetId": image.asset->_id,
    "url": image.asset->url,
    alt
  }
}`;

export async function getPortfolioProjectImagesForPicker(projectId: string): Promise<ProjectPickableImages> {
  const result = await client.fetch<ProjectPickableImages | null>(PROJECT_PICKABLE_IMAGES_QUERY, { id: projectId });
  return result ?? { hero: null, gallery: [] };
}

export type SlideInput = {
  projectId: string | null;
  landscapeAssetId: string | null;
  landscapeAlt: string;
  portraitAssetId: string | null;
  portraitAlt: string;
  enabled: boolean;
};

export async function saveHomepageSlideshowSlides(homepageId: string, slides: SlideInput[]): Promise<void> {
  const doc = slides.map((s) => ({
    _type: "homepageSlideshowSlide",
    ...(s.projectId ? { project: { _type: "reference", _ref: s.projectId } } : {}),
    ...(s.landscapeAssetId
      ? { landscapeImage: { _type: "image", asset: { _type: "reference", _ref: s.landscapeAssetId } }, landscapeAlt: s.landscapeAlt }
      : {}),
    ...(s.portraitAssetId
      ? { portraitImage: { _type: "image", asset: { _type: "reference", _ref: s.portraitAssetId } }, portraitAlt: s.portraitAlt }
      : {}),
    enabled: s.enabled,
  }));
  await client.patch(homepageId).set({ slideshowSlides: doc }).commit();
}
