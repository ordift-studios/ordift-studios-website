import { GALLERY_MIN_IMAGES } from "@/app/connect/connectConfig";
import { getRedis } from "@/lib/shared/redis";
import { parseItems, visibleCount, type ManifestItem } from "./model";

// A durable record of the last list the card page was KNOWN to be showing correctly, kept in the shared Redis (the same one the site's rate limiters use), outside the content service.
//
// Why it exists: when the content service is down, the card page must not guess. Falling back to "the original 15" would silently bring back photographs the Super Admin has hidden or removed (possibly
// for a rights reason). A per-server-instance copy is not enough, because a fresh instance starts empty in the middle of an outage. So every good read and every publish records the list here, and an
// outage is served from this record. Written only after the content service has confirmed the list; never invented.
//
//   kind "original"   the content service confirmed that nothing has been published, so the original 15 are the right answer.
//   kind "published"  the visible photographs of the published list (public-safe: no rights records, no hidden entries).

// REVISION-AWARE WRITES. Every record carries an `order` token: the published revision's time and id (or "" for "the original 15 are current"). A write is ONE atomic compare-and-set in Redis
// (SNAPSHOT_CAS_SCRIPT): it is applied only if the record already stored is not newer. So a stale server instance, one that read an older list from its cache, cannot overwrite the record written
// at a later publish, and the "original" record cannot replace a published one. An unreadable stored record is overwritten, so a damaged value heals itself. Publish times are ISO-8601 UTC with
// milliseconds, so ordering them as strings is ordering them in time; the revision id breaks an exact tie.
//
export const SNAPSHOT_KEY = "connect-portfolio:last-good:v1";
export const SNAPSHOT_ORDER_KEY = `${SNAPSHOT_KEY}:order`;
export type Snapshot = { v: 1; order: string; kind: "original" } | { v: 1; order: string; kind: "published"; items: ManifestItem[] };

export const ORIGINAL_ORDER = "";
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ORDER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|connectPortfolioRevision\.[A-Za-z0-9_.-]{1,100}$/;

/** The ordering token of a published revision, or null if its time or id is not in the expected form (such a list is never recorded). */
export function orderOf(publishedAt: string | null | undefined, revisionId: string | null | undefined): string | null {
  if (!publishedAt || !revisionId || !ISO_UTC.test(publishedAt)) return null;
  const order = `${publishedAt}|${revisionId}`;
  return ORDER.test(order) ? order : null;
}

/** "applied": the record was replaced. "stale": a newer record already exists, so nothing was written (which is correct, not an error). */
export type WriteOutcome = "applied" | "stale";

/** Thrown when the record cannot be read or written (Redis not configured, or unreachable). Distinct from "no record yet", which is a null read. */
export class SnapshotUnavailableError extends Error { constructor(message: string) { super(message); this.name = "SnapshotUnavailableError"; } }

export interface SnapshotStore {
  read(): Promise<Snapshot | null>;
  write(snapshot: Snapshot): Promise<WriteOutcome>;
}

type RedisLike = { get: (key: string) => Promise<unknown>; eval: (script: string, keys: string[], args: string[]) => Promise<unknown> };

// Runs inside Redis, atomically. KEYS[1] = the record, KEYS[2] = its order token (kept beside it so the script needs no JSON handling: only GET, SET and string comparison, which every Redis-compatible
// service supports). ARGV[1] = the new record (JSON), ARGV[2] = its order token. Returns 1 if written, 0 if the stored record is newer. Byte-wise string comparison (Lua's `>`) is the time ordering
// described above. A stored order that is not in the expected form is ignored (and overwritten), so a damaged value cannot block updates forever.
export const SNAPSHOT_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[2])
if current and (current == '' or string.find(current, '^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d%d%dZ|connectPortfolioRevision%.')) and current > ARGV[2] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return 1
`;

/** Reads a stored record strictly. Anything that is not a usable snapshot is treated as "no record", never as data. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.v !== 1 || typeof r.order !== "string") return null;
  if (r.kind === "original") return r.order === ORIGINAL_ORDER ? { v: 1, order: ORIGINAL_ORDER, kind: "original" } : null;
  if (r.kind === "published") {
    if (!ORDER.test(r.order)) return null;
    const { items, dropped } = parseItems(r.items);
    return dropped === 0 && items.every((i) => !i.hidden) && visibleCount(items) >= GALLERY_MIN_IMAGES ? { v: 1, order: r.order, kind: "published", items } : null;
  }
  return null;
}

export function createRedisSnapshotStore(redisOf: () => RedisLike | null = () => getRedis() as unknown as RedisLike | null): SnapshotStore {
  const need = () => { const r = redisOf(); if (!r) throw new SnapshotUnavailableError("the shared store is not configured"); return r; };
  return {
    async read() {
      const r = need();
      try { return parseSnapshot(await r.get(SNAPSHOT_KEY)); } catch (e) { throw new SnapshotUnavailableError(e instanceof Error ? e.message : "read failed"); }
    },
    async write(snapshot) {
      const r = need();
      try { return Number(await r.eval(SNAPSHOT_CAS_SCRIPT, [SNAPSHOT_KEY, SNAPSHOT_ORDER_KEY], [JSON.stringify(snapshot), snapshot.order])) === 1 ? "applied" : "stale"; }
      catch (e) { throw new SnapshotUnavailableError(e instanceof Error ? e.message : "write failed"); }
    },
  };
}

export const defaultSnapshotStore: SnapshotStore = createRedisSnapshotStore();
