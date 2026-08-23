import { client } from "@/sanity/lib/client";

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
