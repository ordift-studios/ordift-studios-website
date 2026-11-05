import { describe, expect, it } from "vitest";
import { SNAPSHOT_KEY, SnapshotUnavailableError, createRedisSnapshotStore, parseSnapshot } from "./snapshot";
import { applyOperation, seedFromBuiltins, toPublishedItems } from "./model";
import { ALT, upload } from "./testSupport";

const items = () => { const r = applyOperation(seedFromBuiltins(), { type: "addUploaded", upload: upload(1), alt: ALT, rightsConfirmed: true }, { userId: "u", now: "x", newKey: () => "u-1" }); if (!r.ok) throw new Error(r.message); return toPublishedItems(r.items); };

describe("reading a stored last-good record (never trusted)", () => {
  it("accepts a valid published record, as an object or as JSON text, and an 'original' record", () => {
    const snap = { v: 1, kind: "published", items: items() };
    expect(parseSnapshot(snap)).toMatchObject({ kind: "published" });
    expect(parseSnapshot(JSON.stringify(snap))).toMatchObject({ kind: "published" });
    expect(parseSnapshot({ v: 1, kind: "original" })).toEqual({ v: 1, kind: "original" });
  });
  it("rejects anything else: wrong version, unreadable entries, hidden entries, too few photographs, junk", () => {
    const good = items();
    for (const bad of [null, undefined, "", "not json", 7, [], {}, { v: 2, kind: "original" }, { v: 1, kind: "x" }, { v: 1, kind: "published" }, { v: 1, kind: "published", items: good.slice(0, 3) },
      { v: 1, kind: "published", items: [...good, { junk: true }] }, { v: 1, kind: "published", items: good.map((i, n) => (n === 0 ? { ...i, hidden: true } : i)) }]) {
      expect(parseSnapshot(bad)).toBeNull();
    }
  });
});

describe("the shared-store record", () => {
  it("writes and reads under its own key", async () => {
    const mem = new Map<string, unknown>();
    const store = createRedisSnapshotStore(() => ({ get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } }));
    expect(await store.read()).toBeNull();                                      // reachable but empty
    await store.write({ v: 1, kind: "published", items: items() });
    expect([...mem.keys()]).toEqual([SNAPSHOT_KEY]);
    expect(await store.read()).toMatchObject({ kind: "published" });
  });
  it("says 'unavailable' (not 'empty') when the shared store is not configured or fails", async () => {
    const none = createRedisSnapshotStore(() => null);
    await expect(none.read()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    await expect(none.write({ v: 1, kind: "original" })).rejects.toBeInstanceOf(SnapshotUnavailableError);
    const broken = createRedisSnapshotStore(() => ({ get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } }));
    await expect(broken.read()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    await expect(broken.write({ v: 1, kind: "original" })).rejects.toBeInstanceOf(SnapshotUnavailableError);
  });
});
