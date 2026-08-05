import { renderBrandOgImage } from "@/lib/media/generateOgImage";

export const alt = "Ordift Studios — A Multidisciplinary Creative House";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return renderBrandOgImage();
}
