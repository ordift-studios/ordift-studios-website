import { after } from "next/server";
import { unstable_cache } from "next/cache";
import { CACHE_TAG } from "./model";
import { createGalleryResolver } from "./published";
import { getStore } from "./defaultStore";
import { defaultSnapshotStore } from "./snapshot";

// The public card page's photographs. The content-service read is cached by the framework under CACHE_TAG, so a visitor's scan costs one lookup in the cache, not a call to the service. Publishing
// expires that tag immediately (see the manager's publish action), so a change is live on the next scan; the 5-minute lifetime is only a backstop. A failed read is never cached. During an outage the
// page is served from the durable last-good record (see published.ts and snapshot.ts), recorded after the response so no visitor waits for it.
const readPublished = unstable_cache(
  async () => {
    const doc = await getStore().readPublished();
    return doc ? { items: doc.items, dropped: doc.dropped, publishedAt: doc.publishedAt, revisionId: doc.revisionId } : null;
  },
  ["connect-portfolio-published"],
  { tags: [CACHE_TAG], revalidate: 300 },
);

export const getConnectGallery = createGalleryResolver({
  read: readPublished,
  durable: defaultSnapshotStore,
  defer: (work) => { try { after(work); } catch { void work().catch(() => {}); } },       // outside a request (never in production) there is nothing to defer to
});
