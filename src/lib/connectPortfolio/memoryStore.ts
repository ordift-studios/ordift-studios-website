import { toPublishedItems, type ManifestItem } from "./model";
import { ContentServiceError, StoreConflictError, type DraftDoc, type ImageAssetInfo, type PortfolioStore, type PublishedDoc, type Revision, type RevisionInput, type RevisionSummary } from "./store";

// An in-memory PortfolioStore for tests. It keeps the same promises as the real one: a draft is separate from the published list, revisions are append-only, publishing is all-or-nothing, and
// a stale revision is refused. Failures can be injected to prove that nothing half-happens.

export type MemoryFailure = "readPublished" | "readDraft" | "writeDraft" | "publish" | "listRevisions" | "getRevision" | "getImageAsset" | "uploadImage";

export class MemoryStore implements PortfolioStore {
  published: (PublishedDoc & { stored: ManifestItem[] }) | null = null;
  draft: DraftDoc | null = null;
  revisions: Revision[] = [];
  assets = new Map<string, ImageAssetInfo>();
  failing = new Set<MemoryFailure>();
  private counter = 0;
  /** What was done, in order (for assertions). */
  log: string[] = [];

  private check(op: MemoryFailure) { if (this.failing.has(op)) throw new ContentServiceError(`injected failure: ${op}`, 503); }
  private nextRev() { return `rev-${++this.counter}`; }

  async readPublished() { this.check("readPublished"); return this.published ? { ...this.published, items: this.published.items.map((i) => ({ ...i })) } : null; }
  async readDraft() { this.check("readDraft"); return this.draft ? { ...this.draft, items: this.draft.items.map((i) => ({ ...i })) } : null; }

  async writeDraft(input: { items: ManifestItem[]; expectedRev: string | null; userId: string; now: string; restoredFrom: string | null }) {
    this.check("writeDraft");
    if (input.expectedRev === null ? this.draft !== null : this.draft?.rev !== input.expectedRev) throw new StoreConflictError();
    const rev = this.nextRev();
    this.draft = { items: input.items.map((i) => ({ ...i })), dropped: 0, rev, updatedAt: input.now, updatedBy: input.userId, restoredFrom: input.restoredFrom };
    this.log.push("writeDraft");
    return { rev };
  }

  async publish(input: { draftRev: string; publishedItems: ManifestItem[]; revision: RevisionInput }) {
    this.check("publish");                                                   // all-or-nothing: a failure leaves published, revisions and draft exactly as they were
    if (this.draft?.rev !== input.draftRev) throw new StoreConflictError();
    const r = input.revision;
    if (this.revisions.some((x) => x.id === r.id)) throw new StoreConflictError("That history entry already exists.");
    this.revisions.push({ id: r.id, publishedAt: r.publishedAt, publishedBy: r.publishedBy, note: r.note, visibleCount: r.visibleCount, itemCount: r.items.length, restoredFrom: r.restoredFrom, items: r.items.map((i) => ({ ...i })), dropped: 0 });
    this.published = { items: input.publishedItems.map((i) => ({ ...i })), stored: input.publishedItems, dropped: 0, rev: this.nextRev(), publishedAt: r.publishedAt, publishedBy: r.publishedBy, revisionId: r.id };
    this.draft = { ...this.draft, rev: this.nextRev(), updatedAt: r.publishedAt };       // the working copy stays, marked as published, equal to the live list
    this.log.push("publish");
  }

  async listRevisions(limit: number): Promise<RevisionSummary[]> {
    this.check("listRevisions");
    return [...this.revisions].reverse().slice(0, limit).map((r) => ({ id: r.id, publishedAt: r.publishedAt, publishedBy: r.publishedBy, note: r.note, visibleCount: r.visibleCount, itemCount: r.itemCount, restoredFrom: r.restoredFrom }));
  }
  async getRevision(id: string) { this.check("getRevision"); const r = this.revisions.find((x) => x.id === id); return r ? { ...r, items: r.items.map((i) => ({ ...i })) } : null; }
  async getImageAsset(assetId: string) { this.check("getImageAsset"); return this.assets.get(assetId) ?? null; }
  async uploadImage(input: { bytes: Buffer; filename: string; contentType: string }) {
    this.check("uploadImage");
    const hash = (input.bytes.length.toString(16).padStart(40, "a")).slice(-40);
    const asset: ImageAssetInfo = { assetId: `image-${hash}-2000x1500-jpg`, url: `https://cdn.sanity.io/images/p/d/${hash}-2000x1500.jpg`, width: 2000, height: 1500, color: "#334455", mimeType: input.contentType, filename: input.filename };
    this.assets.set(asset.assetId, asset);
    return asset;
  }

  /** Test helper: puts a published list in place as if it had been published through the manager. */
  seedPublished(items: ManifestItem[], revisionItems: ManifestItem[] = items) {
    const id = `rev-seed-${++this.counter}`;
    this.revisions.push({ id, publishedAt: "2026-11-01T10:00:00.000Z", publishedBy: "seed-user", note: null, visibleCount: items.filter((i) => !i.hidden).length, itemCount: items.length, restoredFrom: null, items: revisionItems, dropped: 0 });
    this.published = { items: toPublishedItems(items), stored: items, dropped: 0, rev: this.nextRev(), publishedAt: "2026-11-01T10:00:00.000Z", publishedBy: "seed-user", revisionId: id };
  }
}
