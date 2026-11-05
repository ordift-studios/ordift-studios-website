// @vitest-environment node
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ORIGINAL_ORDER, SNAPSHOT_CAS_SCRIPT, SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY, parseSnapshot, type Snapshot } from "./snapshot";
import { applyOperation, seedFromBuiltins, toPublishedItems } from "./model";
import { ALT, upload } from "./testSupport";

// LIVE verification of the snapshot's compare-and-set script inside a REAL Redis (the script is Lua and cannot be run by a JavaScript test). It talks to a THROWAWAY local Redis container named in
// QRP_REDIS_CONTAINER, through `docker exec ... redis-cli`. It never uses the site's Redis (no connection string or token is read), and it refuses a container whose name does not start with
// "qrp-" or whose image is not Redis. Run: QRP_REDIS_CONTAINER=qrp-redis-test npm run test:live -- src/lib/connectPortfolio/snapshot.redis.live.test.ts
const container = process.env.QRP_REDIS_CONTAINER ?? "";
const run = promisify(execFile);
const redis = async (...args: string[]) => (await run("docker", ["exec", container, "redis-cli", "--raw", ...args])).stdout.trim();
const cas = async (snap: unknown, order: string) => Number(await redis("EVAL", SNAPSHOT_CAS_SCRIPT, "2", SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY, typeof snap === "string" ? snap : JSON.stringify(snap), order));
const clear = () => redis("DEL", SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY);
const stored = async () => parseSnapshot(await redis("GET", SNAPSHOT_KEY));

const items = () => { const r = applyOperation(seedFromBuiltins(), { type: "addUploaded", upload: upload(1), alt: `${ALT} — “quoted” and ümlauts ✓`, rightsConfirmed: true }, { userId: "u", now: "x", newKey: () => "u-1" }); if (!r.ok) throw new Error(r.message); return toPublishedItems(r.items); };
const ORD = (n: number) => `${new Date(Date.UTC(2026, 10, 5, 10, 0, 0) + n * 1000).toISOString()}|connectPortfolioRevision.${String(n).padStart(6, "0")}-ab12cd34`;      // n seconds after 10:00:00: always a real timestamp
const pub = (n: number): Snapshot => ({ v: 1, order: ORD(n), kind: "published", items: items() });
const orig: Snapshot = { v: 1, order: ORIGINAL_ORDER, kind: "original" };

let problem: string | null = null;
if (!container) problem = "QRP_REDIS_CONTAINER is not set";
else if (!/^qrp-[a-z0-9_.-]+$/.test(container)) problem = `container "${container}" does not start with "qrp-"`;
else {
  try { const image = execFileSync("docker", ["inspect", "-f", "{{.Config.Image}}", container], { encoding: "utf8" }).trim(); if (!/redis|valkey/i.test(image)) problem = `container image "${image}" is not Redis`; }
  catch { problem = `container "${container}" was not found`; }
}

describe("target guard", () => {
  it("only runs against a throwaway local Redis container", () => { if (problem) console.warn(`[live] NOT RUNNING the Redis checks: ${problem}`); expect(true).toBe(true); });
});

describe.skipIf(problem !== null).sequential("SNAPSHOT_CAS_SCRIPT inside a real Redis", () => {
  beforeAll(async () => { expect(await redis("PING")).toBe("PONG"); await clear(); });
  afterAll(async () => { await clear(); });

  it("writes into an empty key, and the stored record reads back as the same snapshot", async () => {
    expect(await cas(pub(1), ORD(1))).toBe(1);
    expect(await stored()).toEqual(pub(1));                                  // including unicode, quotes and every item field, through Lua and back
  });
  it("refuses an OLDER record and keeps the newer one", async () => {
    expect(await cas(pub(3), ORD(3))).toBe(1);
    expect(await cas(pub(2), ORD(2))).toBe(0);
    expect((await stored())!.order).toBe(ORD(3));
  });
  it("accepts an equal record (a retry is harmless) and a newer one", async () => {
    expect(await cas(pub(3), ORD(3))).toBe(1);
    expect(await cas(pub(4), ORD(4))).toBe(1);
    expect((await stored())!.order).toBe(ORD(4));
  });
  it("the original record never replaces a published one, but a published record replaces the original", async () => {
    expect(await cas(orig, ORIGINAL_ORDER)).toBe(0);
    expect((await stored())!.kind).toBe("published");
    await clear();
    expect(await cas(orig, ORIGINAL_ORDER)).toBe(1);
    expect(await cas(orig, ORIGINAL_ORDER)).toBe(1);                         // original over original
    expect(await cas(pub(1), ORD(1))).toBe(1);
    expect((await stored())!.kind).toBe("published");
  });
  it("overwrites a damaged or foreign value, so a bad record heals itself", async () => {
    for (const junk of ["{{{ not json", "123", '"a string"', "[]", '{"order": 5}', "{}"]) {
      await clear(); await redis("SET", SNAPSHOT_KEY, junk);                              // a damaged value with no order beside it
      expect(await cas(pub(1), ORD(1)), junk).toBe(1);
      expect((await stored())!.order).toBe(ORD(1));
    }
    for (const junkOrder of ["zzzz", "not-an-order", "9999", "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"]) {   // a damaged ORDER, which would sort above every real one if it were trusted
      await clear(); await redis("SET", SNAPSHOT_KEY, "{{{"); await redis("SET", SNAPSHOT_ORDER_KEY, junkOrder);
      expect(await cas(pub(1), ORD(1)), junkOrder).toBe(1);
      expect(await redis("GET", SNAPSHOT_ORDER_KEY)).toBe(ORD(1));
    }
  });
  it("keeps the record and its order together: they are always written as a pair", async () => {
    await clear();
    await cas(pub(7), ORD(7));
    expect(await redis("GET", SNAPSHOT_ORDER_KEY)).toBe(ORD(7));
    expect((await stored())!.order).toBe(ORD(7));
    await cas(pub(6), ORD(6));                                                           // refused
    expect(await redis("GET", SNAPSHOT_ORDER_KEY)).toBe(ORD(7));
    expect((await stored())!.order).toBe(ORD(7));
  });
  it("is atomic: 120 competing writers in parallel, in any interleaving, always leave the NEWEST record and never a lost update", async () => {
    for (let round = 0; round < 5; round++) {
      await clear();
      const orders = Array.from({ length: 120 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
      const results = await Promise.all(orders.map((n) => cas(pub(n), ORD(n))));
      expect((await stored())!.order, `round ${round}`).toBe(ORD(120));
      expect(results.filter((r) => r === 1).length).toBeGreaterThanOrEqual(1);
      expect(results[orders.indexOf(120)]).toBe(1);                          // the newest is always accepted
    }
  });
  it("a stale writer racing a fresh one can never win, whoever arrives first", async () => {
    for (let round = 0; round < 20; round++) {
      await clear();
      const stale = cas(pub(5), ORD(5)), fresh = cas(pub(9), ORD(9));
      await Promise.all(round % 2 ? [stale, fresh] : [fresh, stale]);
      expect((await stored())!.order).toBe(ORD(9));
    }
  });
});
