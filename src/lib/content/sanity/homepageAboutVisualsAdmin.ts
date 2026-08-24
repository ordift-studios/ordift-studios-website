import { client } from "@/sanity/lib/client";

// Admin-only Sanity read/write for the Homepage About Preview's
// background photography (2026-08-24) — Our Mission/Our Vision. Same
// "thin, generic write layer, reuses an already-uploaded Sanity asset
// by id" pattern as workLandingImagesAdmin.ts, deliberately a
// standalone copy rather than a shared import so this feature can
// never regress Work Landing Images or vice versa. Unlike Work Landing
// Images (one field per Service document), both fields live on the
// single `homepage` singleton, so writes are two independent
// set()/unset() patches against the same document id.
export type HomepageAboutImageField = "aboutMissionImage" | "aboutVisionImage";

export type HomepageAboutImageAdmin = {
  fieldKey: HomepageAboutImageField;
  label: string;
  url: string | null;
  alt: string | null;
  assetId: string | null;
  focalX: number | null;
  focalY: number | null;
};

const HOMEPAGE_ABOUT_VISUALS_QUERY = `*[_type == "homepage"][0]{
  "aboutMissionUrl": aboutMissionImage.asset->url,
  "aboutMissionAlt": aboutMissionImageAlt,
  "aboutMissionAssetId": aboutMissionImage.asset->_id,
  "aboutMissionFocalX": aboutMissionImage.hotspot.x * 100,
  "aboutMissionFocalY": aboutMissionImage.hotspot.y * 100,
  "aboutVisionUrl": aboutVisionImage.asset->url,
  "aboutVisionAlt": aboutVisionImageAlt,
  "aboutVisionAssetId": aboutVisionImage.asset->_id,
  "aboutVisionFocalX": aboutVisionImage.hotspot.x * 100,
  "aboutVisionFocalY": aboutVisionImage.hotspot.y * 100
}`;

export async function getHomepageAboutVisualsAdmin(): Promise<HomepageAboutImageAdmin[]> {
  const doc = await client.fetch<{
    aboutMissionUrl: string | null;
    aboutMissionAlt: string | null;
    aboutMissionAssetId: string | null;
    aboutMissionFocalX: number | null;
    aboutMissionFocalY: number | null;
    aboutVisionUrl: string | null;
    aboutVisionAlt: string | null;
    aboutVisionAssetId: string | null;
    aboutVisionFocalX: number | null;
    aboutVisionFocalY: number | null;
  }>(HOMEPAGE_ABOUT_VISUALS_QUERY);

  return [
    {
      fieldKey: "aboutMissionImage",
      label: "Our Mission",
      url: doc.aboutMissionUrl,
      alt: doc.aboutMissionAlt,
      assetId: doc.aboutMissionAssetId,
      focalX: doc.aboutMissionFocalX,
      focalY: doc.aboutMissionFocalY,
    },
    {
      fieldKey: "aboutVisionImage",
      label: "Our Vision",
      url: doc.aboutVisionUrl,
      alt: doc.aboutVisionAlt,
      assetId: doc.aboutVisionAssetId,
      focalX: doc.aboutVisionFocalX,
      focalY: doc.aboutVisionFocalY,
    },
  ];
}

export async function setHomepageAboutImage(
  fieldKey: HomepageAboutImageField,
  image: { assetId: string; alt: string; focalX?: number; focalY?: number } | null
): Promise<void> {
  const altFieldKey = fieldKey === "aboutMissionImage" ? "aboutMissionImageAlt" : "aboutVisionImageAlt";

  if (image) {
    await client
      .patch("homepage")
      .set({
        [fieldKey]: {
          _type: "image",
          asset: { _type: "reference", _ref: image.assetId },
          ...(image.focalX !== undefined && image.focalY !== undefined
            ? { hotspot: { _type: "sanity.imageHotspot", x: image.focalX / 100, y: image.focalY / 100, height: 0.1, width: 0.1 } }
            : {}),
        },
        [altFieldKey]: image.alt,
      })
      .commit();
  } else {
    await client.patch("homepage").unset([fieldKey, altFieldKey]).commit();
  }
}
