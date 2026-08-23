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
  // Not a secret — already embedded in `url` (Sanity CDN URLs encode
  // the asset id). Exposed so "Reposition" can re-save this exact same
  // asset without a duplicate upload.
  assetId: string | null;
  // Image Repositioning (2026-08-23) — Sanity's native hotspot,
  // converted to a 0–100 focal point; null when never set (renders as
  // dead center, same as before this feature existed).
  focalX: number | null;
  focalY: number | null;
};

const WORK_LANDING_IMAGES_QUERY = `*[_type == "service"] | order(displayOrder asc){
  "serviceId": _id,
  "discipline": slug.current,
  name,
  "url": workLandingImage.asset->url,
  "alt": workLandingImageAlt,
  "assetId": workLandingImage.asset->_id,
  "focalX": workLandingImage.hotspot.x * 100,
  "focalY": workLandingImage.hotspot.y * 100
}`;

export async function getWorkLandingImagesAdmin(): Promise<WorkLandingImageAdmin[]> {
  return client.fetch<WorkLandingImageAdmin[]>(WORK_LANDING_IMAGES_QUERY);
}

export async function setServiceWorkLandingImage(
  serviceId: string,
  image: { assetId: string; alt: string; focalX?: number; focalY?: number } | null
): Promise<void> {
  if (image) {
    await client
      .patch(serviceId)
      .set({
        workLandingImage: {
          _type: "image",
          asset: { _type: "reference", _ref: image.assetId },
          ...(image.focalX !== undefined && image.focalY !== undefined
            ? { hotspot: { _type: "sanity.imageHotspot", x: image.focalX / 100, y: image.focalY / 100, height: 0.1, width: 0.1 } }
            : {}),
        },
        workLandingImageAlt: image.alt,
      })
      .commit();
  } else {
    await client.patch(serviceId).unset(["workLandingImage", "workLandingImageAlt"]).commit();
  }
}
