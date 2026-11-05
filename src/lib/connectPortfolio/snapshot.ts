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

// PRODUCTION RELEASE BLOCKER (open): the record is a single last-writer-wins value. It is not revision-aware, so a stale server instance that read an older list from its cache can overwrite a newer
// record (written at a publish) with the older list, and a later outage on a fresh instance would then show that older list. The window is small (publishing expires the shared cache at once, and
// every later good read re-records the current list) but it is real. Before this feature is released, the record must carry the published revision id and a write must only replace a record whose
// revision is older or equal (an atomic compare-and-set), and that must be verified. Tracked in the QR portfolio release checklist; do not release without it.
//
export const SNAPSHOT_KEY = "connect-portfolio:last-good:v1";
export type Snapshot = { v: 1; kind: "original" } | { v: 1; kind: "published"; items: ManifestItem[] };

/** Thrown when the record cannot be read or written (Redis not configured, or unreachable). Distinct from "no record yet", which is a null read. */
export class SnapshotUnavailableError extends Error { constructor(message: string) { super(message); this.name = "SnapshotUnavailableError"; } }

export interface SnapshotStore {
  read(): Promise<Snapshot | null>;
  write(snapshot: Snapshot): Promise<void>;
}

type RedisLike = { get: (key: string) => Promise<unknown>; set: (key: string, value: string) => Promise<unknown> };

/** Reads a stored record strictly. Anything that is not a usable snapshot is treated as "no record", never as data. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (r.kind === "original") return { v: 1, kind: "original" };
  if (r.kind === "published") {
    const { items, dropped } = parseItems(r.items);
    return dropped === 0 && items.every((i) => !i.hidden) && visibleCount(items) >= GALLERY_MIN_IMAGES ? { v: 1, kind: "published", items } : null;
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
      try { await r.set(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch (e) { throw new SnapshotUnavailableError(e instanceof Error ? e.message : "write failed"); }
    },
  };
}

export const defaultSnapshotStore: SnapshotStore = createRedisSnapshotStore();
