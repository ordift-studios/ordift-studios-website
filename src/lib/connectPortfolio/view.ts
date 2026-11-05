import type { ConnectImage } from "@/app/connect/gallery";
import { BUILTIN_IDS, LIMITS, listProblems } from "./model";
import { itemToImage } from "./resolve";
import type { ManagerState } from "./service";
import type { RevisionSummary } from "./store";

// The manager's screen as plain data for the browser: everything it needs to draw the list, the counts and the history, and nothing it should not hold (no tokens, no internals).

export type ViewItem = {
  key: string; kind: "builtin" | "uploaded"; hidden: boolean; image: ConnectImage; alt: string;
  rightsNote: string | null;       // who confirmed the right to publish, and when (added photographs only)
  replaces: string | null; originalFilename: string | null;
};
export type ViewRevision = { id: string; publishedAt: string; byLabel: string; note: string | null; visibleCount: number; restoredFrom: string | null };
export type ManagerView = {
  source: ManagerState["source"]; liveSource: ManagerState["liveSource"];
  draftRev: string | null; hasDraft: boolean; pending: boolean;
  liveVisibleCount: number; draftVisibleCount: number;
  publishedAt: string | null; publishedByLabel: string | null; restoredFrom: string | null; unreadable: number;
  items: ViewItem[];
  addable: { builtinId: string; image: ConnectImage }[];
  revisions: ViewRevision[];
  canPublish: boolean; publishProblems: string[];
  limits: { maxPublished: number; maxUploadBytes: number; minLongEdge: number };
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function userIdsIn(state: ManagerState, revisions: readonly RevisionSummary[]): string[] {
  const ids = new Set<string>();
  for (const i of state.items) if (i.kind === "uploaded" && i.rights) ids.add(i.rights.confirmedBy);
  if (state.publishedBy) ids.add(state.publishedBy);
  for (const r of revisions) if (r.publishedBy) ids.add(r.publishedBy);
  return [...ids];
}

export function buildView(state: ManagerState, revisions: readonly RevisionSummary[], labelFor: (userId: string | null) => string): ManagerView {
  const items: ViewItem[] = state.items.flatMap((item) => {
    const image = itemToImage(item);
    if (!image) return [];
    return [{
      key: item.key, kind: item.kind, hidden: item.hidden, image, alt: image.alt,
      rightsNote: item.kind === "uploaded" && item.rights ? `Rights confirmed ${day(item.rights.confirmedAt)} by ${labelFor(item.rights.confirmedBy)}` : item.kind === "uploaded" ? "No rights confirmation on record" : null,
      replaces: item.kind === "uploaded" ? item.replaces : null, originalFilename: item.kind === "uploaded" ? item.originalFilename : null,
    }];
  });
  const problems = listProblems(state.items, { forPublish: true });
  return {
    source: state.source, liveSource: state.liveSource, draftRev: state.draftRev, hasDraft: state.hasDraft, pending: state.pending,
    liveVisibleCount: state.liveVisibleCount, draftVisibleCount: state.draftVisibleCount,
    publishedAt: state.publishedAt, publishedByLabel: state.publishedBy ? labelFor(state.publishedBy) : null, restoredFrom: state.restoredFrom, unreadable: state.unreadable,
    items,
    addable: state.addableBuiltinIds.flatMap((id) => { const image = itemToImage({ kind: "builtin", key: id, builtinId: id, hidden: false }); return image && BUILTIN_IDS.includes(id) ? [{ builtinId: id, image }] : []; }),
    revisions: revisions.map((r) => ({ id: r.id, publishedAt: r.publishedAt, byLabel: labelFor(r.publishedBy), note: r.note, visibleCount: r.visibleCount, restoredFrom: r.restoredFrom })),
    canPublish: state.pending && problems.length === 0, publishProblems: state.pending ? problems : [],
    limits: { maxPublished: LIMITS.MAX_PUBLISHED, maxUploadBytes: LIMITS.MAX_UPLOAD_BYTES, minLongEdge: LIMITS.MIN_LONG_EDGE },
  };
}
