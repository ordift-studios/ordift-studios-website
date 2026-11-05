import { describe, expect, it } from "vitest";
import { ORIGINAL_ORDER, SNAPSHOT_CAS_SCRIPT, SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY, SnapshotUnavailableError, createRedisSnapshotStore, orderOf, parseSnapshot, type Snapshot } from "./snapshot";
import { applyOperation, seedFromBuiltins, toPublishedItems } from "./model";
import { ALT, upload } from "./testSupport";

const items = () => { const r = applyOperation(seedFromBuiltins(), { type: "addUploaded", upload: upload(1), alt: ALT, rightsConfirmed: true }, { userId: "u", now: "x", newKey: () => "u-1" }); if (!r.ok) throw new Error(r.message); return toPublishedItems(r.items); };
const ORD = (n: number) => `2026-11-05T10:00:0${n}.000Z|connectPortfolioRevision.2026110510000${n}-ab12cd34`;
const pub = (n: number): Snapshot => ({ v: 1, order: ORD(n), kind: "published", items: items() });

describe("ordering tokens", () => {
  it("are the publish time and the revision id, and only in the expected form", () => {
    expect(orderOf("2026-11-05T10:00:01.000Z", "connectPortfolioRevision.20261105100001-ab12cd34")).toBe(ORD(1));
    for (const [at, id] of [[null, "connectPortfolioRevision.x"], ["2026-11-05T10:00:01.000Z", null], ["2026-11-05 10:00:01", "connectPortfolioRevision.x"], ["2026-11-05T10:00:01Z", "connectPortfolioRevision.x"], ["2026-11-05T10:00:01.000Z", "other.x"], ["2026-11-05T10:00:01.000Z", "connectPortfolioRevision.has space"]] as const) expect(orderOf(at, id), String(at) + id).toBeNull();
  });
  it("sort in time order as plain strings, and the original sorts before every published list", () => {
    expect(ORD(1) < ORD(2)).toBe(true); expect(ORIGINAL_ORDER < ORD(1)).toBe(true);
  });
});

describe("reading a stored last-good record (never trusted)", () => {
  it("accepts a valid published record, as an object or as JSON text, and the original record", () => {
    expect(parseSnapshot(pub(1))).toMatchObject({ kind: "published", order: ORD(1) });
    expect(parseSnapshot(JSON.stringify(pub(1)))).toMatchObject({ kind: "published" });
    expect(parseSnapshot({ v: 1, order: "", kind: "original" })).toEqual({ v: 1, order: "", kind: "original" });
  });
  it("rejects anything else: no or wrong order, wrong version, unreadable or hidden entries, too few photographs, junk", () => {
    const good = items();
    for (const bad of [null, undefined, "", "not json", 7, [], {}, { v: 1, kind: "original" }, { v: 1, order: "x", kind: "original" }, { v: 2, order: "", kind: "original" }, { v: 1, order: "", kind: "x" },
      { v: 1, order: ORD(1), kind: "published" }, { v: 1, order: ORD(1), kind: "published", items: good.slice(0, 3) }, { v: 1, kind: "published", items: good }, { v: 1, order: "nonsense", kind: "published", items: good },
      { v: 1, order: ORD(1), kind: "published", items: [...good, { junk: true }] }, { v: 1, order: ORD(1), kind: "published", items: good.map((i, n) => (n === 0 ? { ...i, hidden: true } : i)) }]) {
      expect(parseSnapshot(bad)).toBeNull();
    }
  });
});

// A JavaScript statement of what SNAPSHOT_CAS_SCRIPT does inside Redis, used to test the store's handling of its answers. The script itself is tested against a real Redis in
// snapshot.redis.integration.test.ts (it cannot be run by a JavaScript test).
function fakeRedis() {
  const mem = new Map<string, string>(); const evals: { keys: string[]; args: string[] }[] = [];
  const WELL_FORMED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|connectPortfolioRevision\./;
  return {
    mem, evals,
    get: async (k: string) => mem.get(k) ?? null,
    eval: async (script: string, keys: string[], args: string[]) => {
      expect(script).toBe(SNAPSHOT_CAS_SCRIPT); evals.push({ keys, args });
      const cur = mem.get(keys[1]);
      if (cur !== undefined && (cur === "" || WELL_FORMED.test(cur)) && cur > args[1]) return 0;
      mem.set(keys[0], args[0]); mem.set(keys[1], args[1]); return 1;
    },
  };
}

describe("the shared-store record", () => {
  it("writes with an atomic compare-and-set under its own key, passing the record and its order, and reads it back", async () => {
    const r = fakeRedis(); const store = createRedisSnapshotStore(() => r);
    expect(await store.read()).toBeNull();                                      // reachable but empty
    expect(await store.write(pub(1))).toBe("applied");
    expect(r.evals[0].keys).toEqual([SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY]); expect(r.evals[0].args[1]).toBe(ORD(1)); expect(JSON.parse(r.evals[0].args[0]).order).toBe(ORD(1));
    expect(await store.read()).toMatchObject({ kind: "published", order: ORD(1) });
  });
  it("refuses to replace a newer record ('stale'), accepts a newer or equal one, and the original never replaces a published list", async () => {
    const r = fakeRedis(); const store = createRedisSnapshotStore(() => r);
    expect(await store.write(pub(2))).toBe("applied");
    expect(await store.write(pub(1))).toBe("stale");
    expect(await store.write({ v: 1, order: ORIGINAL_ORDER, kind: "original" })).toBe("stale");
    expect((await store.read())!.order).toBe(ORD(2));
    expect(await store.write(pub(2))).toBe("applied");
    expect(await store.write(pub(3))).toBe("applied");
    expect((await store.read())!.order).toBe(ORD(3));
  });
  it("overwrites a damaged stored value or order, so a bad record cannot block updates", async () => {
    const r = fakeRedis(); r.mem.set(SNAPSHOT_KEY, "{{{not json"); r.mem.set(SNAPSHOT_ORDER_KEY, "zzzz-junk"); const store = createRedisSnapshotStore(() => r);
    expect(await store.write(pub(1))).toBe("applied");
    expect(r.mem.get(SNAPSHOT_ORDER_KEY)).toBe(ORD(1));
  });
  it("says 'unavailable' (not 'empty') when the shared store is not configured or fails", async () => {
    const none = createRedisSnapshotStore(() => null);
    await expect(none.read()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    await expect(none.write(pub(1))).rejects.toBeInstanceOf(SnapshotUnavailableError);
    const broken = createRedisSnapshotStore(() => ({ get: async () => { throw new Error("down"); }, eval: async () => { throw new Error("down"); } }));
    await expect(broken.read()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    await expect(broken.write(pub(1))).rejects.toBeInstanceOf(SnapshotUnavailableError);
  });
  it("the script compares the stored order with the new one and never writes when the stored one is greater", () => {
    expect(SNAPSHOT_CAS_SCRIPT).toMatch(/current > ARGV\[2\]/);
    expect(SNAPSHOT_CAS_SCRIPT).toMatch(/return 0/); expect(SNAPSHOT_CAS_SCRIPT).toMatch(/redis\.call\('SET', KEYS\[1\], ARGV\[1\]\)/);
  });
  it("uses only GET and SET: no JSON library, so it does not depend on optional features of the Redis service", () => {
    expect(SNAPSHOT_CAS_SCRIPT).not.toMatch(/cjson|cmsgpack|struct\.|bit\.|loadstring|dofile|os\.|io\./);
    expect([...SNAPSHOT_CAS_SCRIPT.matchAll(/redis\.call\('([A-Z]+)'/g)].map((m) => m[1]).sort()).toEqual(["GET", "SET", "SET"]);
  });
});
