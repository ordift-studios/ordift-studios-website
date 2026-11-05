import { randomUUID } from "node:crypto";
import {
  ALLOWED_UPLOAD_TYPES, LIMITS, REVISION_TYPE, applyOperation, fail, listProblems, normalizeAlt, sameList, seedFromBuiltins, toPublishedItems, visibleCount,
  BUILTIN_IDS, type Failure, type ManifestItem, type Operation, type Success, type UploadedItem, type UploadRef,
} from "./model";
import { ContentServiceError, StoreConflictError, type DraftDoc, type PortfolioStore, type PublishedDoc, type RevisionSummary } from "./store";

// The rules of the QR portfolio manager, independent of the web framework and of the real content service. Authorization is NOT decided here: the server actions check the Super Admin before they
// call anything in this file, and this file never runs for anyone else.

export type Deps = { store: PortfolioStore; now?: () => string; newKey?: () => string; newRevisionId?: (now: string) => string };
const nowOf = (d: Deps) => (d.now ?? (() => new Date().toISOString()))();
const keyOf = (d: Deps) => (d.newKey ?? (() => `u-${randomUUID()}`))();
const revisionIdOf = (d: Deps, now: string) => (d.newRevisionId ?? ((n) => `${REVISION_TYPE}.${n.replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`))(now);

export const UNAVAILABLE = "The content service is not responding, so nothing was changed. Try again in a moment.";
export const CONFLICT = "These changes were modified elsewhere since you opened the page. Reload to see the latest version; nothing was overwritten.";

/** Turns the store's two kinds of failure into explicit results. Anything else is a bug and is rethrown. */
export async function guarded<T>(run: () => Promise<T>): Promise<T | Failure> {
  try { return await run(); }
  catch (e) {
    if (e instanceof StoreConflictError) return fail("conflict", CONFLICT);
    if (e instanceof ContentServiceError) return fail("unavailable", UNAVAILABLE);
    throw e;
  }
}

/** The image assets that the list refers to but the content service no longer has. Checked in parallel. */
async function missingAssets(store: PortfolioStore, items: readonly ManifestItem[]): Promise<string[]> {
  const ids = [...new Set(items.filter((i): i is UploadedItem => i.kind === "uploaded").map((i) => i.assetId))];
  const found = await Promise.all(ids.map((id) => store.getImageAsset(id)));
  return ids.filter((_, n) => !found[n]);
}

// ------------------------------------------------------------------ the working copy

export type WorkingSource = "original" | "published" | "draft";
export type ManagerState = {
  source: WorkingSource;                 // where the list on screen came from
  items: ManifestItem[];                 // the list being edited (the draft if there is one, otherwise what is live)
  draftRev: string | null;               // pass back with the next change; null while there is no draft
  hasDraft: boolean;
  pending: boolean;                      // the draft differs from what is live
  liveSource: "original" | "published";  // what visitors see now
  liveItems: ManifestItem[];
  liveVisibleCount: number;
  draftVisibleCount: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishedRevisionId: string | null;
  restoredFrom: string | null;
  unreadable: number;                    // stored entries that could not be read (should be 0)
  addableBuiltinIds: string[];           // built-in photographs not currently in the list
};

async function liveBaseline(store: PortfolioStore, published: PublishedDoc | null): Promise<ManifestItem[]> {
  if (!published) return seedFromBuiltins();
  // The public copy has no private bookkeeping; the history entry it points at has the full list, so editing never loses who confirmed rights.
  if (published.revisionId) {
    const rev = await store.getRevision(published.revisionId);
    if (rev && sameList(toPublishedItems(rev.items), published.items)) return rev.items;
  }
  return published.items;
}

export async function loadState(deps: Deps): Promise<ManagerState> {
  const [published, draft] = await Promise.all([deps.store.readPublished(), deps.store.readDraft()]);
  return buildState(deps.store, published, draft);
}

async function buildState(store: PortfolioStore, published: PublishedDoc | null, draft: DraftDoc | null): Promise<ManagerState> {
  const liveItems = await liveBaseline(store, published);
  const items = draft ? draft.items : liveItems;
  const present = new Set(items.filter((i) => i.kind === "builtin").map((i) => (i as { builtinId: string }).builtinId));
  return {
    source: draft ? "draft" : published ? "published" : "original",
    items, draftRev: draft?.rev ?? null, hasDraft: draft !== null, pending: draft !== null && !sameList(draft.items, liveItems),
    liveSource: published ? "published" : "original", liveItems, liveVisibleCount: visibleCount(liveItems), draftVisibleCount: visibleCount(items),
    publishedAt: published?.publishedAt ?? null, publishedBy: published?.publishedBy ?? null, publishedRevisionId: published?.revisionId ?? null,
    restoredFrom: draft?.restoredFrom ?? null, unreadable: (published?.dropped ?? 0) + (draft?.dropped ?? 0),
    addableBuiltinIds: BUILTIN_IDS.filter((id) => !present.has(id)),
  };
}

// ------------------------------------------------------------------ editing

export type OperationInput =
  | Exclude<Operation, { type: "addUploaded" } | { type: "replace" }>
  | { type: "addUploaded"; assetId: string; filename: string | null; alt: string; rightsConfirmed: boolean }
  | { type: "replace"; key: string; assetId: string; filename: string | null; alt: string; rightsConfirmed: boolean };

async function resolveUpload(store: PortfolioStore, assetId: string, filename: string | null): Promise<UploadRef | Failure> {
  const asset = await store.getImageAsset(assetId);
  if (!asset) return fail("not_found", "That upload could not be found. Upload the photograph again.");
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(asset.mimeType)) return fail("invalid", "Only JPEG, PNG and WebP photographs can be added.");
  const name = (filename ?? asset.filename ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 200) || null;
  return { assetId: asset.assetId, url: asset.url, width: asset.width, height: asset.height, color: asset.color, filename: name };
}

export async function applyChange(deps: Deps, input: { userId: string; expectedRev: string | null; op: OperationInput }): Promise<Success<{ state: ManagerState }> | Failure> {
  return guarded(async () => {
    const [published, draft] = await Promise.all([deps.store.readPublished(), deps.store.readDraft()]);
    const state = await buildState(deps.store, published, draft);
    if (state.draftRev !== input.expectedRev) return fail("conflict", CONFLICT);

    let op: Operation;
    if (input.op.type === "addUploaded" || input.op.type === "replace") {
      const upload = await resolveUpload(deps.store, input.op.assetId, input.op.filename);
      if ("ok" in upload) return upload;
      op = input.op.type === "addUploaded"
        ? { type: "addUploaded", upload, alt: input.op.alt, rightsConfirmed: input.op.rightsConfirmed === true }
        : { type: "replace", key: input.op.key, upload, alt: input.op.alt, rightsConfirmed: input.op.rightsConfirmed === true };
    } else {
      op = input.op;
    }

    const now = nowOf(deps);
    const result = applyOperation(state.items, op, { userId: input.userId, now, newKey: () => keyOf(deps) });
    if (!result.ok) return result;
    // A change that changes nothing (for example "move up" on the first photograph) does not create or touch a draft.
    if (JSON.stringify(result.items) === JSON.stringify(state.items)) return { ok: true as const, state };
    await deps.store.writeDraft({ items: result.items, expectedRev: state.draftRev, userId: input.userId, now, restoredFrom: null });
    return { ok: true as const, state: await loadState(deps) };
  });
}

/** Throws away the pending changes by setting the working copy back to the live list. The live list is not touched. With nothing pending, nothing is written. */
export async function discardDraft(deps: Deps, input: { userId: string; expectedRev: string | null }): Promise<Success<{ state: ManagerState }> | Failure> {
  return guarded(async () => {
    const state = await loadState(deps);
    if (state.draftRev !== input.expectedRev) return fail("conflict", CONFLICT);
    if (!state.hasDraft || !state.pending) return { ok: true as const, state };
    await deps.store.writeDraft({ items: state.liveItems, expectedRev: state.draftRev, userId: input.userId, now: nowOf(deps), restoredFrom: null });
    return { ok: true as const, state: await loadState(deps) };
  });
}

// ------------------------------------------------------------------ publishing

export type PublishSuccess = Success<{ revisionId: string; publishedAt: string; visibleCount: number; publishedItems: ManifestItem[] }>;

/**
 * Publishes the draft. The published list, the history entry and the removal of the draft are ONE atomic step in the store, so there is no state where the list is live but the history is missing
 * (or the other way round). If that step fails, nothing happened, and this returns a failure. Cache refresh and the audit entry happen AFTER this returns, and the caller reports them separately.
 */
export async function publishDraft(deps: Deps, input: { userId: string; expectedRev: string | null; note: string | null }): Promise<PublishSuccess | Failure> {
  return guarded(async () => {
    const [published, draft] = await Promise.all([deps.store.readPublished(), deps.store.readDraft()]);
    if (!draft) return fail("nothing_to_publish", "There are no pending changes to publish.");
    if (draft.rev !== input.expectedRev) return fail("conflict", CONFLICT);
    const baseline = await liveBaseline(deps.store, published);
    if (sameList(draft.items, baseline)) return fail("nothing_to_publish", "The pending changes are identical to what is already published.");

    const problems = listProblems(draft.items, { forPublish: true });
    if (problems.length) return fail("invalid", problems[0]);
    const missing = await missingAssets(deps.store, draft.items);
    if (missing.length) return fail("invalid", `${missing.length === 1 ? "A photograph is" : `${missing.length} photographs are`} no longer available in the content service. Remove or replace ${missing.length === 1 ? "it" : "them"} before publishing.`);

    const note = input.note ? normalizeAlt(input.note).slice(0, LIMITS.NOTE_MAX) || null : null;
    const now = nowOf(deps);
    const id = revisionIdOf(deps, now);
    const count = visibleCount(draft.items);
    const publishedItems = toPublishedItems(draft.items);
    try {
      await deps.store.publish({
        draftRev: draft.rev,
        publishedItems,
        revision: { id, publishedAt: now, publishedBy: input.userId, note, restoredFrom: draft.restoredFrom, previousRevisionId: published?.revisionId ?? null, items: draft.items, visibleCount: count },
      });
    } catch (e) {
      // The step is atomic, so a refusal means nothing happened. A lost connection is different: the service may have finished before the answer was lost, so the message says to check, never "nothing changed".
      if (e instanceof ContentServiceError) return fail("unavailable", "Publishing could not be confirmed because the content service did not answer. Reload this page to see whether the changes went live before you try again.");
      throw e;
    }
    return { ok: true as const, revisionId: id, publishedAt: now, visibleCount: count, publishedItems };
  });
}

// ------------------------------------------------------------------ history

export async function listHistory(deps: Deps, limit = 20): Promise<RevisionSummary[]> {
  return deps.store.listRevisions(limit);
}

/** Puts an earlier version into the draft. Nothing goes live until it is published. Replaces any pending changes, so the caller asks the person to confirm first. */
export async function restoreRevision(deps: Deps, input: { userId: string; revisionId: string; expectedRev: string | null }): Promise<Success<{ state: ManagerState }> | Failure> {
  return guarded(async () => {
    const state = await loadState(deps);
    if (state.draftRev !== input.expectedRev) return fail("conflict", CONFLICT);
    const revision = await deps.store.getRevision(input.revisionId);
    if (!revision) return fail("not_found", "That version could not be found.");
    if (revision.dropped > 0) return fail("invalid", "That version contains entries that can no longer be read, so it cannot be restored.");
    const problems = listProblems(revision.items);
    if (problems.length) return fail("invalid", problems[0]);
    const missing = await missingAssets(deps.store, revision.items);
    if (missing.length) return fail("invalid", "Some photographs in that version are no longer available in the content service, so it cannot be restored.");
    await deps.store.writeDraft({ items: revision.items, expectedRev: state.draftRev, userId: input.userId, now: nowOf(deps), restoredFrom: revision.id });
    return { ok: true as const, state: await loadState(deps) };
  });
}
