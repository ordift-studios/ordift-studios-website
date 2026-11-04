import { PORTFOLIO_IMAGES, type PortfolioImageRecord } from "./portfolioImages.generated";

// The photographs on the QR page: the 15 approved by management (see scripts/connect-portfolio/build-images.mjs for the list, the order and the alt text). They are static, pre-optimised
// files served from this site's own /connect/portfolio/ folder, so the page needs no CMS, database or image service, and nothing here is fetched, invented or taken from stock.

export const PORTFOLIO_BASE = "/connect/portfolio";

export type ConnectImage = Pick<PortfolioImageRecord, "id" | "alt" | "width" | "height" | "color" | "widths">;

export function getConnectGalleryImages(): ConnectImage[] {
  return PORTFOLIO_IMAGES.map(({ id, alt, width, height, color, widths }) => ({ id, alt, width, height, color, widths }));
}

export type ImageFormat = "avif" | "webp";
export const fileUrl = (img: Pick<ConnectImage, "id">, w: number, fmt: ImageFormat): string => `${PORTFOLIO_BASE}/${img.id}-${w}.${fmt}`;
export const srcSet = (img: Pick<ConnectImage, "id" | "widths">, fmt: ImageFormat, minWidth = 0): string =>
  img.widths.filter((w) => w >= minWidth).map((w) => `${fileUrl(img, w, fmt)} ${w}w`).join(", ");

// Columns filled so they stay level: each photograph goes into the currently shortest column (the left-most on a tie), in gallery order, so the first row reads 1, 2, 3 and the whole grid
// reads roughly left-to-right, top-to-bottom. Each photograph keeps its own proportions; nothing is cropped.
export function splitColumns<T extends { width: number; height: number }>(items: readonly T[], count = 2): T[][] {
  const cols: T[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array.from({ length: count }, () => 0);
  for (const item of items) {
    let c = 0;
    for (let k = 1; k < count; k++) if (heights[k] < heights[c]) c = k;
    cols[c].push(item);
    heights[c] += item.height / item.width;
  }
  return cols;
}
