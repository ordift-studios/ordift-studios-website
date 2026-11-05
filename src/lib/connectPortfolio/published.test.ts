import { describe, expect, it, vi } from "vitest";
import { PORTFOLIO_IMAGES } from "@/app/connect/portfolioImages.generated";
import { createGalleryResolver, type PublishedRead } from "./published";
import { applyOperation, seedFromBuiltins, toPublishedItems, type ManifestItem } from "./model";
import { remoteWidths, visibleImages, originalImages } from "./resolve";
import { ORIGINAL_ORDER, parseSnapshot, type Snapshot, type SnapshotStore, type WriteOutcome } from "./snapshot";
import { ALT, ReadOnlyMemoryStore, upload } from "./testSupport";

const edit = (items: ManifestItem[], op: Parameters<typeof applyOperation>[1]) => { const r = applyOperation(items, op, { userId: "u", now: "2026-11-05T10:00:00.000Z", newKey: () => `u-k${Math.random().toString(36).slice(2)}` }); if (!r.ok) throw new Error(r.message); return r.items; };
const listWith = (extra = 1): ManifestItem[] => { let items = seedFromBuiltins(); for (let n = 1; n <= extra; n++) items = edit(items, { type: "addUploaded", upload: upload(n), alt: ALT, rightsConfirmed: true }); return items; };
const stamp = (n: number) => ({ publishedAt: `2026-11-05T10:00:0${n}.000Z`, revisionId: `connectPortfolioRevision.2026110510000${n}-aaaa` });
const ord = (n: number) => `${stamp(n).publishedAt}|${stamp(n).revisionId}`;
const published = (items: ManifestItem[], n = 1): PublishedRead => ({ items: toPublishedItems(items), dropped: 0, ...stamp(n) });
const quiet = { log: () => {} };
const ids = (g: { images: { id: string }[] }) => g.images.map((i) => i.id);

type Durable = SnapshotStore & { stored: Snapshot | null; writes: Snapshot[]; failRead: boolean; failWrite: boolean };
function durable(initial: Snapshot | null = null): Durable {
  const d: Durable = {
    stored: initial, writes: [], failRead: false, failWrite: false,
    async read() { if (d.failRead) throw new Error("redis down"); return parseSnapshot(d.stored); },       // like the real store: stored data is parsed strictly, never trusted
    // The same rule as the real compare-and-set: a newer stored record is never replaced; an unreadable one is.
    async write(s): Promise<WriteOutcome> {
      if (d.failWrite) throw new Error("redis down");
      const cur = parseSnapshot(d.stored);
      if (cur && cur.order > s.order) return "stale";
      d.writes.push(s); d.stored = s; return "applied";
    },
  };
  return d;
}
const sync = (work: () => Promise<void>) => { void work(); };

describe("what /connect shows when the content service answers", () => {
  it("nothing published: the original 15, in the original order, identical to the page before the manager existed", async () => {
    const g = await createGalleryResolver({ read: async () => null, ...quiet })();
    expect(g.source).toBe("original");
    expect(ids(g)).toEqual(PORTFOLIO_IMAGES.map((p) => p.id));
    expect(g.images).toEqual(originalImages());
    expect(g.images.every((i) => i.remote === undefined)).toBe(true);
  });
  it("published: exactly the published photographs, in the published order, built-in and added mixed", async () => {
    let items = listWith(2);
    items = edit(items, { type: "moveTo", key: items[16].key, index: 0 });
    items = edit(items, { type: "hide", key: items[5].key });
    const g = await createGalleryResolver({ read: async () => published(items), ...quiet })();
    expect(g.source).toBe("published");
    expect(g.images).toHaveLength(16);
    expect(g.images[0].remote?.baseUrl).toBe(upload(2).url);
    expect(ids(g)).toEqual(visibleImages(items).map((i) => i.id));
  });
  it("an added photograph is described with true widths and its own placeholder colour", async () => {
    const g = await createGalleryResolver({ read: async () => published(listWith(1)), ...quiet })();
    expect(g.images[15]).toMatchObject({ width: 2000, height: 1500, color: "#334455", widths: [480, 960, 1600], alt: ALT });
  });
  it("widths never claim more than the photograph has", () => {
    expect(remoteWidths(2560)).toEqual([480, 960, 1600]); expect(remoteWidths(1600)).toEqual([480, 960, 1600]); expect(remoteWidths(1200)).toEqual([480, 960, 1200]);
    expect(remoteWidths(800)).toEqual([480, 800]); expect(remoteWidths(480)).toEqual([480]); expect(remoteWidths(300)).toEqual([300]);
  });
});

describe("recording the last good list (so an outage can be survived by a fresh server)", () => {
  it("records the published list once, as visible photographs only, and records 'original' when nothing is published", async () => {
    const d = durable(); const items = edit(listWith(1), { type: "hide", key: seedFromBuiltins()[0].key });
    const resolve = createGalleryResolver({ read: async () => published(items), durable: d, defer: sync, ...quiet });
    await resolve(); await resolve(); await resolve();
    expect(d.writes).toHaveLength(1);                                         // only when something changed
    expect(d.writes[0]).toMatchObject({ v: 1, kind: "published", order: ord(1) });
    const snap = d.writes[0] as Extract<Snapshot, { kind: "published" }>;
    expect(snap.items).toHaveLength(15); expect(snap.items.every((i) => !i.hidden)).toBe(true);
    const none = durable();
    await createGalleryResolver({ read: async () => null, durable: none, defer: sync, ...quiet })();
    expect(none.writes).toEqual([{ v: 1, order: ORIGINAL_ORDER, kind: "original" }]);
  });
  it("records again when the list changes", async () => {
    const d = durable(); let current = listWith(1);
    const resolve = createGalleryResolver({ read: async () => published(current), durable: d, defer: sync, ...quiet });
    await resolve(); current = listWith(2); await resolve();
    expect(d.writes).toHaveLength(2);
  });
  it("never makes the visitor wait for it, and a failed record is logged and retried on a later read", async () => {
    const d = durable(); d.failWrite = true; const log = vi.fn(); const deferred: (() => Promise<void>)[] = [];
    const resolve = createGalleryResolver({ read: async () => published(listWith(1)), durable: d, defer: (w) => deferred.push(w), log });
    expect((await resolve()).source).toBe("published");
    expect(deferred).toHaveLength(1); expect(d.writes).toHaveLength(0);       // nothing has run yet: the response did not wait
    await deferred[0](); expect(log).toHaveBeenCalledWith(expect.stringContaining("could not record"), expect.any(Error));
    d.failWrite = false; await resolve(); await deferred[1]();
    expect(d.writes).toHaveLength(1);
  });
});

describe("when the content service fails: an outage never brings back a hidden or removed photograph", () => {
  const failing = () => Promise.reject(new Error("503"));
  const removed = () => { let items = listWith(1); items = edit(items, { type: "hide", key: items[0].key }); items = edit(items, { type: "remove", key: items[3].key }); return items; };
  const removedIds = () => { const s = seedFromBuiltins(); return [(s[0] as { builtinId: string }).builtinId, (s[3] as { builtinId: string }).builtinId]; };       // the one hidden, and the one removed

  it("a fresh server with a durable record: serves exactly the recorded list, NOT the original 15", async () => {
    const live = removed();
    const snapshot: Snapshot = { v: 1, order: ord(1), kind: "published", items: toPublishedItems(live) };
    const g = await createGalleryResolver({ read: failing, durable: durable(snapshot), ...quiet })();
    expect(g.source).toBe("durable-last-known-good");
    expect(ids(g)).toEqual(visibleImages(live).map((i) => i.id));
    expect(g.images).toHaveLength(14);                                         // 15 built-in - hidden - removed + 1 added
    for (const id of removedIds()) expect(ids(g)).not.toContain(id);
    expect(g.images.some((i) => i.remote)).toBe(true);
  });
  it("a fresh server whose record says the original 15 were current: serves the original 15", async () => {
    const g = await createGalleryResolver({ read: failing, durable: durable({ v: 1, order: ORIGINAL_ORDER, kind: "original" }), ...quiet })();
    expect(g).toMatchObject({ source: "durable-last-known-good" }); expect(ids(g)).toEqual(PORTFOLIO_IMAGES.map((p) => p.id));
  });
  it("a fresh server with NOTHING recorded: withholds the gallery (the card page offers the website portfolio) rather than guessing the original 15", async () => {
    for (const store of [null, undefined, durable(null)]) {
      const g = await createGalleryResolver({ read: failing, durable: store, ...quiet })();
      expect(g).toEqual({ images: [], source: "withheld" });
    }
  });
  it("the record cannot be read either: withholds the gallery", async () => {
    const d = durable({ v: 1, order: ORIGINAL_ORDER, kind: "original" }); d.failRead = true; const log = vi.fn();
    expect(await createGalleryResolver({ read: failing, durable: d, log })()).toEqual({ images: [], source: "withheld" });
    expect(log).toHaveBeenCalled();
  });
  it("a record that is not a usable list (hidden entries, too few photographs, wrong shape) is not used", async () => {
    const live = removed();
    const tooFew = toPublishedItems(live).slice(0, 2);
    const withHidden = [...toPublishedItems(live)].map((i, n) => (n === 0 ? { ...i, hidden: true } : i));
    for (const bad of [{ v: 1, order: ord(1), kind: "published", items: tooFew }, { v: 1, order: ord(1), kind: "published", items: withHidden }, { v: 1, kind: "published", items: toPublishedItems(live) }, { v: 2, order: ord(1), kind: "published", items: [] }, { v: 1, order: ord(1), kind: "other" }] as unknown as Snapshot[]) {
      const g = await createGalleryResolver({ read: failing, durable: durable(bad), ...quiet })();
      expect(g.source).toBe("withheld");
    }
  });
  it("this server's own good read is preferred over the shared record", async () => {
    let fail = false; let t = 0;
    const d = durable({ v: 1, order: ORIGINAL_ORDER, kind: "original" });
    const resolve = createGalleryResolver({ read: async () => { if (fail) throw new Error("503"); return published(listWith(1)); }, durable: d, defer: () => {}, now: () => t, cooldownMs: 1000, ...quiet });
    expect((await resolve()).images).toHaveLength(16);
    fail = true; t = 5000;
    const g = await resolve();
    expect(g.source).toBe("last-known-good"); expect(g.images).toHaveLength(16);
  });
  it("recovers by itself once the service answers again", async () => {
    let fail = true; let t = 0;
    const resolve = createGalleryResolver({ read: async () => { if (fail) throw new Error("503"); return published(listWith(2)); }, now: () => t, cooldownMs: 1000, ...quiet });
    expect((await resolve()).source).toBe("withheld");
    fail = false; t = 2000;
    expect(await resolve()).toMatchObject({ source: "published" });
  });
  it("after a failure the service is left alone for the cool-down, so a slow outage cannot slow every scan", async () => {
    const read = vi.fn(failing); let t = 0;
    const resolve = createGalleryResolver({ read, now: () => t, cooldownMs: 30_000, ...quiet });
    await resolve(); await resolve(); t = 29_000; await resolve();
    expect(read).toHaveBeenCalledTimes(1);
    t = 31_000; await resolve();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("a service that never answers is given up on after the time limit", async () => {
    const g = await createGalleryResolver({ read: () => new Promise(() => {}), timeoutMs: 20, ...quiet })();
    expect(g.source).toBe("withheld");
  });
  it("a genuine 'nothing published' answer is 'original', not mistaken for a failure", async () => {
    expect((await createGalleryResolver({ read: async () => null, ...quiet })()).source).toBe("original");
  });
});

describe("a stored list that is not usable is a fault, handled like an outage", () => {
  it("is reported and replaced by the recorded list, or withheld; never the original 15 by guesswork, never shown half-broken", async () => {
    const log = vi.fn();
    expect(await createGalleryResolver({ read: async () => ({ items: listWith(1), dropped: 2, ...stamp(1) }), log })()).toEqual({ images: [], source: "withheld" });
    expect(log).toHaveBeenCalled();
    const recorded: Snapshot = { v: 1, order: ord(1), kind: "published", items: toPublishedItems(listWith(1)) };
    const g = await createGalleryResolver({ read: async () => ({ items: listWith(1), dropped: 2, ...stamp(1) }), durable: durable(recorded), ...quiet })();
    expect(g.source).toBe("durable-last-known-good"); expect(g.images).toHaveLength(16);
  });
  it("fewer visible photographs than the slideshow needs is treated the same way", async () => {
    const few = seedFromBuiltins().map((i, n) => ({ ...i, hidden: n >= 2 }));
    expect((await createGalleryResolver({ read: async () => ({ items: few, dropped: 0, ...stamp(1) }), ...quiet })()).source).toBe("withheld");
  });
});

describe("revision-aware recording: a stale server instance can never overwrite a newer record", () => {
  it("an instance that read an OLDER list from its cache cannot replace the record written at a LATER publish", async () => {
    const shared = durable();
    const fresh = createGalleryResolver({ read: async () => published(listWith(2), 2), durable: shared, defer: sync, ...quiet });
    const stale = createGalleryResolver({ read: async () => published(listWith(1), 1), durable: shared, defer: sync, ...quiet });
    await fresh();                                                            // the later publish is recorded first
    expect((shared.stored as { order: string }).order).toBe(ord(2));
    await stale();                                                            // then a stale instance records what its cache still holds
    expect((shared.stored as { order: string }).order).toBe(ord(2));          // the newer record survives
    expect((shared.stored as Extract<Snapshot, { kind: "published" }>).items).toHaveLength(17);
    expect(shared.writes).toHaveLength(1);                                    // the stale write was refused, not applied
  });
  it("the order of arrival does not matter: whichever order they write in, the newest publish is what is recorded", async () => {
    for (const order of [[1, 2, 3], [3, 2, 1], [2, 3, 1], [1, 3, 2]]) {
      const shared = durable();
      for (const n of order) await createGalleryResolver({ read: async () => published(listWith(n), n), durable: shared, defer: sync, ...quiet })();
      expect((shared.stored as { order: string }).order, order.join(",")).toBe(ord(3));
    }
  });
  it("the 'original' record can never replace a published one (a stale instance that predates the first publish)", async () => {
    const shared = durable();
    await createGalleryResolver({ read: async () => published(listWith(1), 1), durable: shared, defer: sync, ...quiet })();
    await createGalleryResolver({ read: async () => null, durable: shared, defer: sync, ...quiet })();
    expect((shared.stored as Snapshot).kind).toBe("published");
  });
  it("a published record replaces the 'original' one, and an equal record is accepted again (so a retry is harmless)", async () => {
    const shared = durable({ v: 1, order: ORIGINAL_ORDER, kind: "original" });
    await createGalleryResolver({ read: async () => published(listWith(1), 1), durable: shared, defer: sync, ...quiet })();
    expect((shared.stored as Snapshot).kind).toBe("published");
    await createGalleryResolver({ read: async () => published(listWith(1), 1), durable: shared, defer: sync, ...quiet })();
    expect((shared.stored as { order: string }).order).toBe(ord(1));
  });
  it("a damaged stored record is overwritten, so it heals itself", async () => {
    const shared = durable(); shared.stored = { v: 9, junk: true } as unknown as Snapshot;
    await createGalleryResolver({ read: async () => published(listWith(1), 1), durable: shared, defer: sync, ...quiet })();
    expect((shared.stored as { order: string }).order).toBe(ord(1));
  });
  it("a published list with no usable revision stamp is served but never recorded", async () => {
    const shared = durable(); const log = vi.fn();
    const g = await createGalleryResolver({ read: async () => ({ items: toPublishedItems(listWith(1)), dropped: 0, publishedAt: null, revisionId: null }), durable: shared, defer: sync, log })();
    expect(g.source).toBe("published"); expect(shared.writes).toEqual([]); expect(log).toHaveBeenCalledWith(expect.stringContaining("no usable revision stamp"));
  });
});

describe("the first visit after deployment (nothing has ever been published)", () => {
  it("shows the original 15 in their original order, creates NO content-service document and uploads NO asset; the only record it makes is the 'original' outage record", async () => {
    const store = new ReadOnlyMemoryStore();                                  // throws if anything is written to the content service
    const d = durable();
    const read = async () => { const p = await store.readPublished(); return p && { items: p.items, dropped: p.dropped, publishedAt: p.publishedAt, revisionId: p.revisionId }; };
    const resolve = createGalleryResolver({ read, durable: d, defer: sync, ...quiet });
    for (let n = 0; n < 5; n++) {                                             // several visits, as a real scan day would be
      const g = await resolve();
      expect(g.source).toBe("original");
      expect(ids(g)).toEqual(PORTFOLIO_IMAGES.map((p) => p.id));
      expect(g.images).toEqual(originalImages());
      expect(g.images.every((i) => i.remote === undefined)).toBe(true);
    }
    expect(store.published).toBeNull(); expect(store.draft).toBeNull(); expect(store.revisions).toEqual([]); expect(store.assets.size).toBe(0); expect(store.log).toEqual([]);
    expect(d.writes).toEqual([{ v: 1, order: ORIGINAL_ORDER, kind: "original" }]);   // one outage record, once
  });
  it("the public read path contains no content-service write at all: neither it nor the resolver can create, replace, patch, publish or upload", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["publicGallery.ts", "published.ts", "resolve.ts", "snapshot.ts"]) {
      const code = readFileSync(join(process.cwd(), "src/lib/connectPortfolio", f), "utf8").replace(/\/\/ .*$/gm, "");
      expect(code, f).not.toMatch(/writeDraft|\.publish\(|uploadImage|\.create\(|createOrReplace|\.patch\(|\.transaction\(|assets\.upload/);
    }
    const publicGallery = readFileSync(join(process.cwd(), "src/lib/connectPortfolio/publicGallery.ts"), "utf8");
    expect(publicGallery).toMatch(/getStore\(\)\.readPublished\(\)/);              // its only content-service call is a read
  });
});
