import { PORTFOLIO_IMAGES } from "@/app/connect/portfolioImages.generated";
import { GALLERY_MIN_IMAGES } from "@/app/connect/connectConfig";

// The QR portfolio manager's data model: which photographs the /connect card page shows, in what order, and which are hidden. Pure (no network, no framework), so every rule here is unit-tested.
//
// The 15 approved photographs ("built-in") live in the code base as static files and are only ever REFERENCED here by id. A photograph uploaded through the manager is referenced by its image asset
// in the content service. Removing a photograph from this list never touches a file or an asset; it only edits the list.

export const DOC_TYPE = "connectPortfolio";
export const DOC_ID = "connectPortfolio";                       // the published list (public: only visible photographs, nothing private)
// The working copy. A dotted id is private (readable only with the content-service token), and it avoids the reserved `drafts.` prefix, which the content service documents as internal to Studio
// ("may behave unexpectedly" when created through the API). The working copy is kept after a publish and simply equals the live list until the next edit.
export const DRAFT_ID = `${DOC_ID}.draft`;
export const DRAFT_TYPE = "connectPortfolioDraft";
export const REVISION_TYPE = "connectPortfolioRevision";        // append-only history of every publish (ids contain a dot, so they are never public)
export const CACHE_TAG = "connect-portfolio";

export const LIMITS = {
  MAX_PUBLISHED: 30,                  // visible photographs
  MAX_ITEMS: 60,                      // visible + hidden, so the list cannot grow without bound
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,  // after the browser has compressed the file
  MIN_LONG_EDGE: 800,                 // px; smaller photographs look soft on the full-screen viewer
  MAX_LONG_EDGE: 10000,               // px; the browser scales larger files down to 2560 before upload
  PRESERVE_LONG_EDGE: 2560,           // px; the largest size kept for an uploaded photograph
  DELIVER_LONG_EDGE: 1600,            // px; the largest size served to a visitor
  ALT_MIN: 10,
  ALT_MAX: 300,
  NOTE_MAX: 200,
} as const;

export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

export type Rights = { confirmedAt: string; confirmedBy: string };

export type BuiltinItem = { kind: "builtin"; key: string; builtinId: string; hidden: boolean };
export type UploadedItem = {
  kind: "uploaded";
  key: string;
  assetId: string;                    // the image asset in the content service
  url: string;                        // the asset's address, as reported by the content service when the photograph was added
  width: number;
  height: number;
  color: string;                      // dominant colour, shown while the photograph loads
  alt: string;
  hidden: boolean;
  // Private bookkeeping. Present in drafts and revisions; stripped from the published (public) list.
  originalFilename: string | null;
  rights: Rights | null;
  replaces: string | null;            // what this photograph replaced (a built-in id or an asset id), for the history
};
export type ManifestItem = BuiltinItem | UploadedItem;

export type UploadRef = { assetId: string; url: string; width: number; height: number; color: string; filename: string | null };

export type Operation =
  | { type: "moveUp" | "moveDown" | "hide" | "restore" | "remove"; key: string }
  | { type: "moveTo"; key: string; index: number }
  | { type: "addBuiltin"; builtinId: string }
  | { type: "addUploaded"; upload: UploadRef; alt: string; rightsConfirmed: boolean }
  | { type: "replace"; key: string; upload: UploadRef; alt: string; rightsConfirmed: boolean }
  | { type: "editAlt"; key: string; alt: string }
  | { type: "resetToOriginal" };

export type ErrorCode = "invalid" | "limit" | "not_found" | "conflict" | "unavailable" | "nothing_to_publish" | "rights_required";
export type Failure = { ok: false; code: ErrorCode; message: string };
export type Success<T> = { ok: true } & T;

export const fail = (code: ErrorCode, message: string): Failure => ({ ok: false, code, message });

// ------------------------------------------------------------------ the built-in 15

export const BUILTIN_IDS: readonly string[] = PORTFOLIO_IMAGES.map((p) => p.id);
export const builtinKey = (builtinId: string): string => `b-${builtinId}`;

/** The list that /connect shows today: the 15 approved photographs, in their approved order, all visible. */
export function seedFromBuiltins(): ManifestItem[] {
  return PORTFOLIO_IMAGES.map((p) => ({ kind: "builtin", key: builtinKey(p.id), builtinId: p.id, hidden: false }));
}

// ------------------------------------------------------------------ counts and comparison

export const visibleCount = (items: readonly ManifestItem[]): number => items.filter((i) => !i.hidden).length;

/** Two lists are the same when order, photographs and visibility match (private bookkeeping is ignored). */
export function sameList(a: readonly ManifestItem[], b: readonly ManifestItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (x.kind !== y.kind || x.hidden !== y.hidden) return false;
    if (x.kind === "builtin" && y.kind === "builtin") return x.builtinId === y.builtinId;
    if (x.kind === "uploaded" && y.kind === "uploaded") return x.assetId === y.assetId && x.alt === y.alt;
    return false;
  });
}

// ------------------------------------------------------------------ text and image checks

const BRAND = "ORDIFT STUDIOS";

export function normalizeAlt(alt: string): string {
  return alt.replace(/\s+/g, " ").trim();
}

/** null when the text is acceptable, otherwise a message for the person editing. */
export function altTextProblem(raw: string): string | null {
  const alt = normalizeAlt(raw);
  if (alt.length < LIMITS.ALT_MIN) return `Describe the photograph in at least ${LIMITS.ALT_MIN} characters, for people who cannot see it.`;
  if (alt.length > LIMITS.ALT_MAX) return `Keep the description to ${LIMITS.ALT_MAX} characters or fewer.`;
  if (/\.(jpe?g|png|webp|gif|heic|tiff?)\b/i.test(alt) || /^(img|dsc|dscf|dji|pxl|photo)[_ -]?\d+/i.test(alt) || /\b\d{3,4}[A-Z]\d{3,4}\b/.test(alt)) return "Describe what the photograph shows, not its file name.";
  for (const m of alt.matchAll(/ordift\s*studios/gi)) if (m[0] !== BRAND) return `Write the brand as ${BRAND}, in capitals.`;
  return null;
}

const ASSET_ID = /^image-[a-f0-9]{40}-\d+x\d+-(jpg|jpeg|png|webp)$/;
const ASSET_URL = /^https:\/\/cdn\.sanity\.io\/images\/[a-z0-9]+\/[a-z0-9_-]+\/[a-f0-9]{40}-\d+x\d+\.(jpg|jpeg|png|webp)$/;
const COLOR = /^#[0-9a-f]{6}$/i;
export const isAssetId = (v: unknown): v is string => typeof v === "string" && ASSET_ID.test(v);
export const isAssetUrl = (v: unknown): v is string => typeof v === "string" && ASSET_URL.test(v);

export function uploadProblem(u: UploadRef): string | null {
  if (!isAssetId(u.assetId)) return "That is not a recognised image.";
  if (!isAssetUrl(u.url)) return "That image has no usable address.";
  if (!Number.isInteger(u.width) || !Number.isInteger(u.height) || u.width <= 0 || u.height <= 0) return "The image size could not be read.";
  const longEdge = Math.max(u.width, u.height);
  if (longEdge < LIMITS.MIN_LONG_EDGE) return `The photograph is too small (${u.width} × ${u.height} px). Use one at least ${LIMITS.MIN_LONG_EDGE} px on its longer side.`;
  if (longEdge > LIMITS.MAX_LONG_EDGE) return `The photograph is too large (${u.width} × ${u.height} px).`;
  if (!COLOR.test(u.color)) return "The image colour could not be read.";
  return null;
}

// ------------------------------------------------------------------ reading stored data (never trusted)

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Reads one stored item. Anything malformed is dropped (null), never guessed at. */
export function parseItem(raw: unknown): ManifestItem | null {
  const r = rec(raw);
  if (!r) return null;
  const key = str(r._key) ?? str(r.key);
  const hidden = r.hidden === true;
  if (!key || key.length > 80) return null;
  if (r.kind === "builtin") {
    const id = str(r.builtinId);
    return id && BUILTIN_IDS.includes(id) ? { kind: "builtin", key, builtinId: id, hidden } : null;
  }
  if (r.kind === "uploaded") {
    const asset = rec(rec(r.image)?.asset);
    const assetId = str(asset?._ref) ?? str(r.assetId);
    const url = str(r.url), color = str(r.color), alt = str(r.alt);
    const width = num(r.width), height = num(r.height);
    if (!assetId || !url || !color || alt === null || width === null || height === null) return null;
    const upload: UploadRef = { assetId, url, width, height, color, filename: null };
    if (uploadProblem(upload) || altTextProblem(alt)) return null;
    const rr = rec(r.rights);
    const rights = rr && str(rr.confirmedAt) && str(rr.confirmedBy) ? { confirmedAt: str(rr.confirmedAt)!, confirmedBy: str(rr.confirmedBy)! } : null;
    return { kind: "uploaded", key, assetId, url, width, height, color, alt: normalizeAlt(alt), hidden, originalFilename: str(r.originalFilename), rights, replaces: str(r.replaces) };
  }
  return null;
}

/** Reads a stored list. `dropped` counts entries that could not be read (a non-zero value is worth reporting). Duplicate keys and duplicate photographs are dropped. */
export function parseItems(raw: unknown): { items: ManifestItem[]; dropped: number } {
  const list = Array.isArray(raw) ? raw : [];
  const items: ManifestItem[] = [];
  const keys = new Set<string>(), photos = new Set<string>();
  let dropped = Array.isArray(raw) ? 0 : raw === undefined || raw === null ? 0 : 1;
  for (const entry of list) {
    const item = parseItem(entry);
    const photo = item ? (item.kind === "builtin" ? `b:${item.builtinId}` : `u:${item.assetId}`) : null;
    if (!item || keys.has(item.key) || (photo && photos.has(photo))) { dropped++; continue; }
    keys.add(item.key);
    if (photo) photos.add(photo);
    items.push(item);
  }
  return { items, dropped };
}

/**
 * The public copy of a list. Only VISIBLE photographs are in it (a hidden or removed photograph is not named in public data at all), and nothing about who confirmed what or what the original file was
 * called. The full list, hidden entries and rights records included, lives in the private working copy and the private history.
 */
export function toPublishedItems(items: readonly ManifestItem[]): ManifestItem[] {
  return items.filter((i) => !i.hidden).map((i) => (i.kind === "builtin" ? { ...i } : { ...i, originalFilename: null, rights: null, replaces: null }));
}

// ------------------------------------------------------------------ validation

/** Problems that make a list unfit to save (always) or to publish (forPublish). Empty means fine. */
export function listProblems(items: readonly ManifestItem[], opts: { forPublish?: boolean } = {}): string[] {
  const problems: string[] = [];
  const keys = new Set<string>(), photos = new Set<string>();
  for (const i of items) {
    if (keys.has(i.key)) problems.push(`Duplicate entry ${i.key}.`);
    keys.add(i.key);
    const photo = i.kind === "builtin" ? `b:${i.builtinId}` : `u:${i.assetId}`;
    if (photos.has(photo)) problems.push("The same photograph appears twice.");
    photos.add(photo);
    if (i.kind === "builtin" && !BUILTIN_IDS.includes(i.builtinId)) problems.push(`Unknown built-in photograph ${i.builtinId}.`);
    if (i.kind === "uploaded") {
      const p = uploadProblem({ assetId: i.assetId, url: i.url, width: i.width, height: i.height, color: i.color, filename: null }) ?? altTextProblem(i.alt);
      if (p) problems.push(p);
    }
  }
  if (items.length > LIMITS.MAX_ITEMS) problems.push(`The list holds ${items.length} photographs; the most it can hold, including hidden ones, is ${LIMITS.MAX_ITEMS}.`);
  const visible = visibleCount(items);
  if (visible > LIMITS.MAX_PUBLISHED) problems.push(`${visible} photographs are visible; at most ${LIMITS.MAX_PUBLISHED} can be published.`);
  if (opts.forPublish && visible < GALLERY_MIN_IMAGES) problems.push(`At least ${GALLERY_MIN_IMAGES} visible photographs are needed to publish; with fewer, the card page would stop showing the slideshow.`);
  return problems;
}

// ------------------------------------------------------------------ operations

export type OpContext = { userId: string; now: string; newKey: () => string };
type OpResult = Success<{ items: ManifestItem[] }> | Failure;

const indexOfKey = (items: readonly ManifestItem[], key: string) => items.findIndex((i) => i.key === key);
const assetsIn = (items: readonly ManifestItem[], except?: string) => new Set(items.filter((i): i is UploadedItem => i.kind === "uploaded" && i.key !== except).map((i) => i.assetId));

function newUploaded(ctx: OpContext, upload: UploadRef, alt: string, replaces: string | null, hidden: boolean): UploadedItem {
  return {
    kind: "uploaded", key: ctx.newKey(), assetId: upload.assetId, url: upload.url, width: upload.width, height: upload.height, color: upload.color,
    alt: normalizeAlt(alt), hidden, originalFilename: upload.filename, rights: { confirmedAt: ctx.now, confirmedBy: ctx.userId }, replaces,
  };
}

/** Applies one editing operation to a list and returns the new list. The input list is never changed. Every rule (limits, rights, text) is checked here, on the server side of the application. */
export function applyOperation(current: readonly ManifestItem[], op: Operation, ctx: OpContext): OpResult {
  const items = current.map((i) => ({ ...i })) as ManifestItem[];
  const finish = (next: ManifestItem[]): OpResult => {
    const problems = listProblems(next);
    return problems.length ? fail(next.length > LIMITS.MAX_ITEMS || visibleCount(next) > LIMITS.MAX_PUBLISHED ? "limit" : "invalid", problems[0]) : { ok: true, items: next };
  };
  const at = op.type === "addBuiltin" || op.type === "addUploaded" || op.type === "resetToOriginal" ? -1 : indexOfKey(items, op.key);
  if (op.type !== "addBuiltin" && op.type !== "addUploaded" && op.type !== "resetToOriginal" && at < 0) return fail("not_found", "That photograph is no longer in the list. Reload the page.");

  switch (op.type) {
    case "moveUp":
    case "moveDown": {
      const to = op.type === "moveUp" ? at - 1 : at + 1;
      if (to < 0 || to >= items.length) return { ok: true, items };
      [items[at], items[to]] = [items[to], items[at]];
      return finish(items);
    }
    case "moveTo": {
      if (!Number.isInteger(op.index)) return fail("invalid", "That position is not valid.");
      const to = Math.min(Math.max(op.index, 0), items.length - 1);
      const [moved] = items.splice(at, 1);
      items.splice(to, 0, moved);
      return finish(items);
    }
    case "hide": items[at].hidden = true; return finish(items);
    case "restore": items[at].hidden = false; return finish(items);
    case "remove": items.splice(at, 1); return finish(items);
    case "addBuiltin": {
      if (!BUILTIN_IDS.includes(op.builtinId)) return fail("not_found", "That is not one of the built-in photographs.");
      if (items.some((i) => i.kind === "builtin" && i.builtinId === op.builtinId)) return fail("invalid", "That photograph is already in the list.");
      return finish([...items, { kind: "builtin", key: builtinKey(op.builtinId), builtinId: op.builtinId, hidden: false }]);
    }
    case "addUploaded": {
      if (!op.rightsConfirmed) return fail("rights_required", "Confirm that ORDIFT STUDIOS has the right to publish this photograph.");
      const bad = uploadProblem(op.upload) ?? altTextProblem(op.alt);
      if (bad) return fail("invalid", bad);
      if (assetsIn(items).has(op.upload.assetId)) return fail("invalid", "That photograph is already in the list.");
      return finish([...items, newUploaded(ctx, op.upload, op.alt, null, false)]);
    }
    case "replace": {
      if (!op.rightsConfirmed) return fail("rights_required", "Confirm that ORDIFT STUDIOS has the right to publish the replacement photograph.");
      const bad = uploadProblem(op.upload) ?? altTextProblem(op.alt);
      if (bad) return fail("invalid", bad);
      const old = items[at];
      if (assetsIn(items, old.key).has(op.upload.assetId) || (old.kind === "uploaded" && old.assetId === op.upload.assetId)) return fail("invalid", "That photograph is already in the list.");
      items[at] = newUploaded(ctx, op.upload, op.alt, old.kind === "builtin" ? old.builtinId : old.assetId, old.hidden);
      return finish(items);
    }
    case "editAlt": {
      const it = items[at];
      if (it.kind !== "uploaded") return fail("invalid", "The description of a built-in photograph is part of the website and cannot be edited here.");
      const bad = altTextProblem(op.alt);
      if (bad) return fail("invalid", bad);
      it.alt = normalizeAlt(op.alt);
      return finish(items);
    }
    case "resetToOriginal": return { ok: true, items: seedFromBuiltins() };
  }
}
