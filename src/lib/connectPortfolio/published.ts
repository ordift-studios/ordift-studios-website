import type { ConnectImage } from "@/app/connect/gallery";
import { GALLERY_MIN_IMAGES } from "@/app/connect/connectConfig";
import { originalImages, visibleImages } from "./resolve";
import type { ManifestItem } from "./model";
import { ORIGINAL_ORDER, orderOf, type Snapshot, type SnapshotStore } from "./snapshot";

// What the public card page shows, decided from the published list. The rule that matters: "nothing has been published" and "the content service could not be read" are DIFFERENT situations, and an
// outage must never bring back a photograph the Super Admin has hidden or removed.
//
//   The service answered:
//     nothing published                      -> the original 15                          source "original"
//     a usable published list                -> exactly that list                        source "published"
//     a stored list that is not usable       -> treated as a failure (below)
//   The service failed (or answered with something unusable). In this order:
//     1. this server instance has read a good list before        -> that list              source "last-known-good"
//     2. the durable record (shared Redis) holds the last good    -> that list              source "durable-last-known-good"
//        list, or records that the original 15 were current
//     3. nothing is known (no record, or the record cannot be read) -> NO gallery          source "withheld"
//        The card page then offers the website's own portfolio instead of the slideshow. The original 15 are NEVER assumed: that would be a guess, and a wrong guess shows withdrawn photographs.
//
// A failed read is never cached, so the next request tries again; after a failure the service is left alone for a short cool-down so a slow outage cannot slow every scan.

export type GallerySource = "original" | "published" | "last-known-good" | "durable-last-known-good" | "withheld";
export type Gallery = { images: ConnectImage[]; source: GallerySource };
export type PublishedRead = { items: ManifestItem[]; dropped: number; publishedAt: string | null; revisionId: string | null } | null;

export type ResolverOptions = {
  read: () => Promise<PublishedRead>;
  durable?: SnapshotStore | null;                        // the outage record; null/absent = none available
  defer?: (work: () => Promise<void>) => void;           // runs follow-up work (recording the snapshot) without making the visitor wait
  now?: () => number; timeoutMs?: number; cooldownMs?: number; log?: (message: string, error?: unknown) => void;
};

const WITHHELD: Gallery = { images: [], source: "withheld" };

export function snapshotImages(s: Snapshot): ConnectImage[] | null {
  if (s.kind === "original") return originalImages();
  const images = visibleImages(s.items);
  return images.length >= GALLERY_MIN_IMAGES ? images : null;
}

export function createGalleryResolver(opts: ResolverOptions): () => Promise<Gallery> {
  const now = opts.now ?? Date.now, timeoutMs = opts.timeoutMs ?? 3000, cooldownMs = opts.cooldownMs ?? 30_000;
  const log = opts.log ?? ((m: string, e?: unknown) => console.error(`[connect-portfolio] ${m}`, e instanceof Error ? e.message : (e ?? "")));
  const defer = opts.defer ?? ((work) => { void work().catch(() => {}); });
  let lastGood: Gallery | null = null;
  let failedAt: number | null = null;
  let recorded: string | null = null;                    // what this instance last recorded durably, so it records only when something changed

  const record = (snapshot: Snapshot) => {
    const signature = JSON.stringify(snapshot);
    if (!opts.durable || signature === recorded) return;
    recorded = signature;
    // The write is a compare-and-set on the snapshot's order: "stale" means a newer list was already recorded (by a later publish), which is exactly what must happen, so it is not an error.
    defer(async () => { try { await opts.durable!.write(snapshot); } catch (e) { recorded = null; log("could not record the last good list", e); } });
  };

  // The ladder used whenever the live read cannot be trusted. Each step is only used if it holds something that was confirmed good earlier.
  const degraded = async (): Promise<Gallery> => {
    if (lastGood) return { images: lastGood.images, source: "last-known-good" };
    if (!opts.durable) return WITHHELD;
    try {
      const snapshot = await opts.durable.read();
      const images = snapshot ? snapshotImages(snapshot) : null;
      if (images) return { images, source: "durable-last-known-good" };
      log("no recorded last good list; the card page's photographs are withheld until the content service answers");
    } catch (e) {
      log("the last good list could not be read; the card page's photographs are withheld until the content service answers", e);
    }
    return WITHHELD;
  };

  return async () => {
    if (failedAt !== null && now() - failedAt < cooldownMs) return degraded();
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const doc = await Promise.race([
        opts.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`content service did not answer within ${timeoutMs} ms`)), timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (doc === null) {
        failedAt = null;
        lastGood = { images: originalImages(), source: "original" };
        record({ v: 1, order: ORIGINAL_ORDER, kind: "original" });
        return lastGood;
      }
      const images = visibleImages(doc.items);
      if (doc.dropped > 0 || images.length < GALLERY_MIN_IMAGES) {
        // The service answered, but what is stored is not a publishable list. A fault to investigate, not "unpublished", and it is never shown half-broken.
        failedAt = now();
        log(`the published list is unusable (${doc.dropped} unreadable entries, ${images.length} visible photographs); using the last good list`);
        return degraded();
      }
      failedAt = null;
      lastGood = { images, source: "published" };
      const order = orderOf(doc.publishedAt, doc.revisionId);
      if (order) record({ v: 1, order, kind: "published", items: doc.items.filter((i) => !i.hidden) });
      else log("the published list has no usable revision stamp, so it is not recorded for outages");
      return lastGood;
    } catch (e) {
      failedAt = now();
      log("could not read the published list", e);
      return degraded();
    }
  };
}
