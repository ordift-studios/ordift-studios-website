import { PORTFOLIO_IMAGES } from "@/app/connect/portfolioImages.generated";
import { getConnectGalleryImages, type ConnectImage } from "@/app/connect/gallery";
import { LIMITS, type ManifestItem, type UploadedItem } from "./model";

// Turns a list from the manager into the photographs the card page renders. Pure.

const STANDARD_WIDTHS = [480, 960, LIMITS.DELIVER_LONG_EDGE] as const;

/**
 * The widths offered for an added photograph: the standard 480, 960 and 1600, but never wider than the photograph itself (the image host does not enlarge, so a wider claim would be false), and
 * ending at the photograph's own width when that is smaller than 1600. Always at least one entry, ascending.
 */
export function remoteWidths(photoWidth: number): number[] {
  const w = Math.max(1, Math.floor(photoWidth));
  const usable = STANDARD_WIDTHS.filter((s) => s < w);
  const top = Math.min(w, LIMITS.DELIVER_LONG_EDGE);
  return [...usable.filter((s) => s < top), top];
}

const byBuiltinId = new Map(PORTFOLIO_IMAGES.map((p) => [p.id, p]));

/** One list entry as the card page renders it, or null when it cannot be (an unknown built-in id). */
export function itemToImage(item: ManifestItem): ConnectImage | null {
  if (item.kind === "builtin") {
    const p = byBuiltinId.get(item.builtinId);
    return p ? { id: p.id, alt: p.alt, width: p.width, height: p.height, color: p.color, widths: p.widths } : null;
  }
  return uploadedToImage(item);
}

function uploadedToImage(item: UploadedItem): ConnectImage {
  return { id: item.key, alt: item.alt, width: item.width, height: item.height, color: item.color, widths: remoteWidths(item.width), remote: { baseUrl: item.url } };
}

/** The visible photographs, in list order: exactly what visitors get. */
export function visibleImages(items: readonly ManifestItem[]): ConnectImage[] {
  return items.filter((i) => !i.hidden).map(itemToImage).filter((x): x is ConnectImage => x !== null);
}

/** Every entry with its image, hidden ones included (for the manager's own list). */
export function allWithImages(items: readonly ManifestItem[]): { item: ManifestItem; image: ConnectImage }[] {
  return items.flatMap((item) => { const image = itemToImage(item); return image ? [{ item, image }] : []; });
}

/** What /connect shows when nothing has been published or the content service cannot be read: the 15 approved photographs, in their approved order. Identical to the page before the manager existed. */
export const originalImages = (): ConnectImage[] => getConnectGalleryImages();
