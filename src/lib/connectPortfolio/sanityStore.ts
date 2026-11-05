import type { SanityClient } from "next-sanity";
import { DOC_ID, DOC_TYPE, DRAFT_ID, DRAFT_TYPE, REVISION_TYPE, isAssetId, parseItems, type ManifestItem } from "./model";
import { ContentServiceError, StoreConflictError, type DraftDoc, type ImageAssetInfo, type PortfolioStore, type PublishedDoc, type Revision, type RevisionInput, type RevisionSummary } from "./store";

// The real PortfolioStore, on the content service the website already uses for its other editable content. Server-only: the client carries the write token, which never reaches a browser.
//
// Document layout (no database tables, no new storage; images are ordinary image assets of the existing dataset):
//   connectPortfolio                  the published list. Public-safe: visible photographs only, no rights records, no original file names.
//   connectPortfolio.draft            the working copy (full list). A dotted id is private (documented: readable only with a token) and avoids the reserved `drafts.` prefix.
//   connectPortfolioRevision.<id>     one per publish, append-only, full list. Dotted, so also private.
// Images are held by real references, so the content service itself refuses to delete an asset that any list or history entry still uses.
//
// Written against the content service's documented behaviour (see the report: mutations are transactional; dotted ids are private; ifRevisionID is optimistic locking). Two things are NOT documented and
// are therefore designed around rather than relied on: the HTTP status for a revision mismatch / duplicate id (classified by status AND message below), and mixing a patch and a delete of the same
// document in one transaction (never done: the working copy is patched, never deleted, in the publish transaction).

const asItems = (items: readonly ManifestItem[]) => items.map((i) => itemToStored(i));

function itemToStored(i: ManifestItem): Record<string, unknown> {
  if (i.kind === "builtin") return { _key: i.key, _type: "connectPortfolioItem", kind: "builtin", builtinId: i.builtinId, hidden: i.hidden };
  return {
    _key: i.key, _type: "connectPortfolioItem", kind: "uploaded", hidden: i.hidden,
    image: { _type: "image", asset: { _type: "reference", _ref: i.assetId } },
    url: i.url, width: i.width, height: i.height, color: i.color, alt: i.alt,
    originalFilename: i.originalFilename, rights: i.rights ? { confirmedAt: i.rights.confirmedAt, confirmedBy: i.rights.confirmedBy } : null, replaces: i.replaces,
  };
}

function statusOf(e: unknown): number | null {
  const r = e as { statusCode?: unknown; response?: { statusCode?: unknown } } | null;
  const s = r?.statusCode ?? r?.response?.statusCode;
  return typeof s === "number" ? s : null;
}

// The status code for these two cases is not stated in the content service's reference, so a conflict is recognised by EITHER the 409 status OR the wording of the mutation error.
const CONFLICT_WORDING = /revision\s*id\s*mismatch|ifRevisionID|already exists|revision mismatch/i;

/** A stale revision or a duplicate id is a conflict (nothing was written). Anything else is the service being unavailable or refusing, and is never mistaken for "nothing there". */
export function classify(e: unknown): StoreConflictError | ContentServiceError {
  if (e instanceof ContentServiceError || e instanceof StoreConflictError) return e;
  const status = statusOf(e);
  const message = e instanceof Error ? e.message : "content service error";
  if (status === 409 || (status !== null && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429 && CONFLICT_WORDING.test(message))) return new StoreConflictError();
  return new ContentServiceError(message, status);
}
function wrap(e: unknown): never { throw classify(e); }

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function createSanityStore(base: SanityClient): PortfolioStore {
  // "raw" shows documents under their true ids (drafts and history included) and `useCdn: false` guarantees a read is never older than the last write. This client is never used for the public page's data.
  const c = base.withConfig({ perspective: "raw", useCdn: false });

  const getDoc = async (id: string) => { try { return (await c.getDocument(id)) as Record<string, unknown> | undefined; } catch (e) { return wrap(e); } };

  return {
    async readPublished(): Promise<PublishedDoc | null> {
      const d = await getDoc(DOC_ID);
      if (!d) return null;
      const { items, dropped } = parseItems(d.items);
      return { items, dropped, rev: String(d._rev ?? ""), publishedAt: str(d.publishedAt), publishedBy: str(d.publishedBy), revisionId: str(d.revisionId) };
    },

    async readDraft(): Promise<DraftDoc | null> {
      const d = await getDoc(DRAFT_ID);
      if (!d) return null;
      const { items, dropped } = parseItems(d.items);
      return { items, dropped, rev: String(d._rev ?? ""), updatedAt: str(d.updatedAt), updatedBy: str(d.updatedBy), restoredFrom: str(d.restoredFrom) };
    },

    async writeDraft({ items, expectedRev, userId, now, restoredFrom }) {
      const fields = { items: asItems(items), updatedAt: now, updatedBy: userId, restoredFrom };
      try {
        if (expectedRev === null) {
          const created = await c.create({ _id: DRAFT_ID, _type: DRAFT_TYPE, ...fields }, { visibility: "sync" });       // refused if the working copy already exists
          return { rev: String((created as { _rev?: string })._rev ?? "") };
        }
        const patched = await c.patch(DRAFT_ID).ifRevisionId(expectedRev).set(fields).commit({ visibility: "sync" });   // refused (409) if the draft changed since it was read
        return { rev: String((patched as { _rev?: string })._rev ?? "") };
      } catch (e) { return wrap(e); }
    },

    async publish({ draftRev, publishedItems, revision }: { draftRev: string; publishedItems: ManifestItem[]; revision: RevisionInput }) {
      try {
        // One transaction over three DIFFERENT documents (the content service documents mutations as transactional: all or nothing). The first step re-checks that the working copy is still the revision
        // that was reviewed, so a stale publish fails the whole transaction. The working copy is marked, not deleted: it now equals the live list.
        await c.transaction()
          .patch(DRAFT_ID, (p) => p.ifRevisionId(draftRev).set({ lastPublishedRevisionId: revision.id, lastPublishedAt: revision.publishedAt }))
          .createOrReplace({ _id: DOC_ID, _type: DOC_TYPE, items: asItems(publishedItems), publishedAt: revision.publishedAt, publishedBy: revision.publishedBy, revisionId: revision.id })
          .create({
            _id: revision.id, _type: REVISION_TYPE, publishedAt: revision.publishedAt, publishedBy: revision.publishedBy, note: revision.note, restoredFrom: revision.restoredFrom,
            previousRevisionId: revision.previousRevisionId, visibleCount: revision.visibleCount, itemCount: revision.items.length, items: asItems(revision.items),
          })
          .commit({ visibility: "sync" });
      } catch (e) { wrap(e); }
    },

    async listRevisions(limit: number): Promise<RevisionSummary[]> {
      try {
        const rows = await c.fetch<Record<string, unknown>[]>(
          `*[_type == $type && !(_id in path("drafts.**"))] | order(publishedAt desc) [0...$limit] { _id, publishedAt, publishedBy, note, visibleCount, itemCount, restoredFrom }`,
          { type: REVISION_TYPE, limit },
        );
        return rows.map((r) => ({ id: String(r._id), publishedAt: str(r.publishedAt) ?? "", publishedBy: str(r.publishedBy), note: str(r.note), visibleCount: Number(r.visibleCount ?? 0), itemCount: Number(r.itemCount ?? 0), restoredFrom: str(r.restoredFrom) }));
      } catch (e) { return wrap(e); }
    },

    async getRevision(id: string): Promise<Revision | null> {
      if (!id.startsWith(`${REVISION_TYPE}.`)) return null;                      // only history entries can be read through this door
      const d = await getDoc(id);
      if (!d || d._type !== REVISION_TYPE) return null;
      const { items, dropped } = parseItems(d.items);
      return { id, items, dropped, publishedAt: str(d.publishedAt) ?? "", publishedBy: str(d.publishedBy), note: str(d.note), visibleCount: Number(d.visibleCount ?? 0), itemCount: Number(d.itemCount ?? items.length), restoredFrom: str(d.restoredFrom) };
    },

    async getImageAsset(assetId: string): Promise<ImageAssetInfo | null> {
      if (!isAssetId(assetId)) return null;
      const d = await getDoc(assetId);
      return d && d._type === "sanity.imageAsset" ? assetInfo(d) : null;
    },

    async uploadImage({ bytes, filename, contentType }) {
      try {
        const asset = await c.assets.upload("image", bytes, { filename, contentType, label: "qr-portfolio", extract: ["palette"] });
        return assetInfo(asset as unknown as Record<string, unknown>);
      } catch (e) { return wrap(e); }
    },
  };
}

function assetInfo(d: Record<string, unknown>): ImageAssetInfo {
  const meta = (d.metadata ?? {}) as { dimensions?: { width?: number; height?: number }; palette?: { dominant?: { background?: string }; darkMuted?: { background?: string } } };
  const color = meta.palette?.darkMuted?.background ?? meta.palette?.dominant?.background ?? "#2d2e31";
  return {
    assetId: String(d._id), url: String(d.url ?? ""), width: Number(meta.dimensions?.width ?? 0), height: Number(meta.dimensions?.height ?? 0),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#2d2e31", mimeType: String(d.mimeType ?? ""), filename: str(d.originalFilename),
  };
}
