import type { ManifestItem } from "./model";

// What the manager needs from the content service, as an interface, so the rules can be tested against an in-memory copy without a network and the real service can be swapped in at one place.

/** The content service could not be reached or refused the request. Temporary: it says nothing about whether anything is published. */
export class ContentServiceError extends Error {
  constructor(message: string, readonly status: number | null = null) { super(message); this.name = "ContentServiceError"; }
}
/** Someone else changed the draft since this person last loaded it. */
export class StoreConflictError extends Error {
  constructor(message = "The pending changes were modified elsewhere.") { super(message); this.name = "StoreConflictError"; }
}

export type PublishedDoc = { items: ManifestItem[]; dropped: number; rev: string; publishedAt: string | null; publishedBy: string | null; revisionId: string | null };
export type DraftDoc = { items: ManifestItem[]; dropped: number; rev: string; updatedAt: string | null; updatedBy: string | null; restoredFrom: string | null };

export type RevisionSummary = { id: string; publishedAt: string; publishedBy: string | null; note: string | null; visibleCount: number; itemCount: number; restoredFrom: string | null };
export type Revision = RevisionSummary & { items: ManifestItem[]; dropped: number };

export type ImageAssetInfo = { assetId: string; url: string; width: number; height: number; color: string; mimeType: string; filename: string | null };

export type RevisionInput = {
  id: string;
  publishedAt: string;
  publishedBy: string;
  note: string | null;
  restoredFrom: string | null;
  previousRevisionId: string | null;
  items: ManifestItem[];            // the full list, including private bookkeeping
  visibleCount: number;
};

export interface PortfolioStore {
  /** The published list, or null when nothing has ever been published. Throws ContentServiceError when the service cannot be read. */
  readPublished(): Promise<PublishedDoc | null>;
  readDraft(): Promise<DraftDoc | null>;
  /** Creates the draft (expectedRev null) or replaces it (expectedRev must match). */
  writeDraft(input: { items: ManifestItem[]; expectedRev: string | null; userId: string; now: string; restoredFrom: string | null }): Promise<{ rev: string }>;
  /**
   * ONE atomic step: the published list, the history entry and the working copy's "last published" mark all happen, or none of them does. The working copy is kept (it now equals the live list), so no
   * two changes are ever made to the same document inside the one transaction.
   */
  publish(input: { draftRev: string; publishedItems: ManifestItem[]; revision: RevisionInput }): Promise<void>;
  listRevisions(limit: number): Promise<RevisionSummary[]>;
  getRevision(id: string): Promise<Revision | null>;
  getImageAsset(assetId: string): Promise<ImageAssetInfo | null>;
  uploadImage(input: { bytes: Buffer; filename: string; contentType: string }): Promise<ImageAssetInfo>;
}
