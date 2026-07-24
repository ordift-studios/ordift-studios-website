import createImageUrlBuilder from "@sanity/image-url";
import type { Image } from "sanity";
import { client } from "./client";

const builder = createImageUrlBuilder(client);

// Sanity's image pipeline (resize/crop/format via URL params) is the
// "image optimization" requested for this milestone — Next.js's own
// <Image> component then serves the resulting URL, so both layers
// compose rather than compete.
export function urlForImage(source: Image) {
  return builder.image(source);
}
