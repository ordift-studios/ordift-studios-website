import { client } from "@/sanity/lib/client";

// Admin-only Sanity read/write for Work Landing Images (2026-08-23) —
// the discipline-band image on /work (WorkDisciplineBands), one per
// Service document. Mirrors homepageSlideshowAdmin.ts's established
// pattern exactly: thin, generic write layer, server-only, reuses an
// already-uploaded Sanity asset by id rather than duplicating upload
// logic. Unlike the Homepage Slideshow (one array on a single
// `homepage` document), each Service document holds its own single
// image field directly, so there's no whole-array replace here — each
// discipline is set independently.

export type WorkLandingImageAdmin = {
  serviceId: string;
  discipline: string;
  name: string;
  url: string | null;
  alt: string | null;
};

const WORK_LANDING_IMAGES_QUERY = `*[_type == "service"] | order(displayOrder asc){
  "serviceId": _id,
  "discipline": slug.current,
  name,
  "url": workLandingImage.asset->url,
  "alt": workLandingImageAlt
}`;

export async function getWorkLandingImagesAdmin(): Promise<WorkLandingImageAdmin[]> {
  return client.fetch<WorkLandingImageAdmin[]>(WORK_LANDING_IMAGES_QUERY);
}

export async function setServiceWorkLandingImage(
  serviceId: string,
  image: { assetId: string; alt: string } | null
): Promise<void> {
  if (image) {
    await client
      .patch(serviceId)
      .set({
        workLandingImage: { _type: "image", asset: { _type: "reference", _ref: image.assetId } },
        workLandingImageAlt: image.alt,
      })
      .commit();
  } else {
    await client.patch(serviceId).unset(["workLandingImage", "workLandingImageAlt"]).commit();
  }
}
