import { describe, expect, it, vi } from "vitest";
import { PORTFOLIO_IMAGES } from "@/app/connect/portfolioImages.generated";
import { createGalleryResolver, type PublishedRead } from "./published";
import { applyOperation, seedFromBuiltins, toPublishedItems, type ManifestItem } from "./model";
import { remoteWidths, visibleImages, originalImages } from "./resolve";
import { parseSnapshot, type Snapshot, type SnapshotStore } from "./snapshot";
import { ALT, upload } from "./testSupport";

const edit = (items: ManifestItem[], op: Parameters<typeof applyOperation>[1]) => { const r = applyOperation(items, op, { userId: "u", now: "2026-11-05T10:00:00.000Z", newKey: () => `u-k${Math.random().toString(36).slice(2)}` }); if (!r.ok) throw new Error(r.message); return r.items; };
const listWith = (extra = 1): ManifestItem[] => { let items = seedFromBuiltins(); for (let n = 1; n <= extra; n++) items = edit(items, { type: "addUploaded", upload: upload(n), alt: ALT, rightsConfirmed: true }); return items; };
const published = (items: ManifestItem[]): PublishedRead => ({ items: toPublishedItems(items), dropped: 0 });
const quiet = { log: () => {} };
const ids = (g: { images: { id: string }[] }) => g.images.map((i) => i.id);

type Durable = SnapshotStore & { stored: Snapshot | null; writes: Snapshot[]; failRead: boolean; failWrite: boolean };
function durable(initial: Snapshot | null = null): Durable {
  const d: Durable = {
    stored: initial, writes: [], failRead: false, failWrite: false,
    async read() { if (d.failRead) throw new Error("redis down"); return parseSnapshot(d.stored); },       // like the real store: stored data is parsed strictly, never trusted
    async write(s) { if (d.failWrite) throw new Error("redis down"); d.writes.push(s); d.stored = s; },
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
    expect(d.writes[0]).toMatchObject({ v: 1, kind: "published" });
    const snap = d.writes[0] as Extract<Snapshot, { kind: "published" }>;
    expect(snap.items).toHaveLength(15); expect(snap.items.every((i) => !i.hidden)).toBe(true);
    const none = durable();
    await createGalleryResolver({ read: async () => null, durable: none, defer: sync, ...quiet })();
    expect(none.writes).toEqual([{ v: 1, kind: "original" }]);
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
    const snapshot: Snapshot = { v: 1, kind: "published", items: toPublishedItems(live) };
    const g = await createGalleryResolver({ read: failing, durable: durable(snapshot), ...quiet })();
    expect(g.source).toBe("durable-last-known-good");
    expect(ids(g)).toEqual(visibleImages(live).map((i) => i.id));
    expect(g.images).toHaveLength(14);                                         // 15 built-in - hidden - removed + 1 added
    for (const id of removedIds()) expect(ids(g)).not.toContain(id);
    expect(g.images.some((i) => i.remote)).toBe(true);
  });
  it("a fresh server whose record says the original 15 were current: serves the original 15", async () => {
    const g = await createGalleryResolver({ read: failing, durable: durable({ v: 1, kind: "original" }), ...quiet })();
    expect(g).toMatchObject({ source: "durable-last-known-good" }); expect(ids(g)).toEqual(PORTFOLIO_IMAGES.map((p) => p.id));
  });
  it("a fresh server with NOTHING recorded: withholds the gallery (the card page offers the website portfolio) rather than guessing the original 15", async () => {
    for (const store of [null, undefined, durable(null)]) {
      const g = await createGalleryResolver({ read: failing, durable: store, ...quiet })();
      expect(g).toEqual({ images: [], source: "withheld" });
    }
  });
  it("the record cannot be read either: withholds the gallery", async () => {
    const d = durable({ v: 1, kind: "original" }); d.failRead = true; const log = vi.fn();
    expect(await createGalleryResolver({ read: failing, durable: d, log })()).toEqual({ images: [], source: "withheld" });
    expect(log).toHaveBeenCalled();
  });
  it("a record that is not a usable list (hidden entries, too few photographs, wrong shape) is not used", async () => {
    const live = removed();
    const tooFew = toPublishedItems(live).slice(0, 2);
    const withHidden = [...toPublishedItems(live)].map((i, n) => (n === 0 ? { ...i, hidden: true } : i));
    for (const bad of [{ v: 1, kind: "published", items: tooFew }, { v: 1, kind: "published", items: withHidden }, { v: 2, kind: "published", items: [] }, { v: 1, kind: "other" }] as unknown as Snapshot[]) {
      const g = await createGalleryResolver({ read: failing, durable: durable(bad), ...quiet })();
      expect(g.source).toBe("withheld");
    }
  });
  it("this server's own good read is preferred over the shared record", async () => {
    let fail = false; let t = 0;
    const d = durable({ v: 1, kind: "original" });
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
    expect(await createGalleryResolver({ read: async () => ({ items: listWith(1), dropped: 2 }), log })()).toEqual({ images: [], source: "withheld" });
    expect(log).toHaveBeenCalled();
    const recorded: Snapshot = { v: 1, kind: "published", items: toPublishedItems(listWith(1)) };
    const g = await createGalleryResolver({ read: async () => ({ items: listWith(1), dropped: 2 }), durable: durable(recorded), ...quiet })();
    expect(g.source).toBe("durable-last-known-good"); expect(g.images).toHaveLength(16);
  });
  it("fewer visible photographs than the slideshow needs is treated the same way", async () => {
    const few = seedFromBuiltins().map((i, n) => ({ ...i, hidden: n >= 2 }));
    expect((await createGalleryResolver({ read: async () => ({ items: few, dropped: 0 }), ...quiet })()).source).toBe("withheld");
  });
});
