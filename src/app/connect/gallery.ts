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

// Two columns, filled so they stay level: each photograph goes into the currently shorter column (left on a tie), in gallery order, so the first row reads 1, 2 and the whole grid
// reads roughly left-to-right, top-to-bottom. Each photograph keeps its own proportions; nothing is cropped.
export function splitColumns<T extends { width: number; height: number }>(items: readonly T[]): [T[], T[]] {
  const cols: [T[], T[]] = [[], []];
  const heights: [number, number] = [0, 0];
  for (const item of items) {
    const c = heights[1] < heights[0] ? 1 : 0;
    cols[c].push(item);
    heights[c] += item.height / item.width;
  }
  return cols;
}
