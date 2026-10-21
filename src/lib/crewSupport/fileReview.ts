// Review-gallery rules for an assignment's files. Pure — no I/O, safe to import from client components.
//
// Two independent axes describe an uploaded file, and they must never be confused:
//   * file_kind ("Uploading as": source RAW, intermediate, deliverable, final approved, …) says what the file IS
//     and drives RETENTION (backup, retain, cleanup). It never makes a file visible to a client.
//   * release_status (private → submitted → approved → released) says where the file is in the CLIENT-DELIVERY
//     review. Only management approval + an explicit release makes a file client-visible.
// A file uploaded as "Final Approved" therefore still has to be submitted, reviewed and released like any other.

import { RELEASE_STATUS_LABELS, releaseCategoryLabel, reviewerConflict, transition, type ReleaseStatus } from "./fileRelease";

export type ReviewDecision = "approve" | "request_changes" | "reject";

// Kinds that can be part of a client delivery. Source/intermediate/working/reference/archive material is internal
// working material and is never included in a bulk review, whatever its release status.
export const REVIEWABLE_FILE_KINDS = ["deliverable", "revision", "final_approved"] as const;
export function isReviewableFileKind(fileKind: string): boolean {
  return (REVIEWABLE_FILE_KINDS as readonly string[]).includes(fileKind);
}

export type ReviewableFileFacts = { fileKind: string; releaseStatus: string; purged: boolean };

// Can this file take this decision right now? (Status machine + not purged + a deliverable-type file.)
export function canReviewFile(file: ReviewableFileFacts, decision: ReviewDecision): boolean {
  if (file.purged) return false;
  if (!isReviewableFileKind(file.fileKind)) return false;
  return transition(file.releaseStatus, decision, "management").ok;
}

// Which files a bulk action would act on: only the eligible ones, in the order given, de-duplicated.
export function eligibleForDecision<T extends ReviewableFileFacts & { id: string }>(files: T[], decision: ReviewDecision): T[] {
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.id) || !canReviewFile(f, decision)) return false;
    seen.add(f.id);
    return true;
  });
}

export function canReleaseFile(file: ReviewableFileFacts): boolean {
  return !file.purged && isReviewableFileKind(file.fileKind) && transition(file.releaseStatus, "release", "management").ok;
}

// ---------------------------------------------------------------- previews
// Browsers render these natively. HEIC/TIFF/RAW/PSD and video are not previewed in the gallery (no image copies are
// generated and no paid image service is used); they remain reachable through the authorised download link.
const PREVIEWABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PREVIEWABLE_EXT = /\.(jpe?g|png|webp|gif)$/i;

export function isPreviewableImage(mimeType: string | null, filename: string): boolean {
  if (mimeType && mimeType !== "application/octet-stream") return PREVIEWABLE_MIME.has(mimeType.toLowerCase());
  return PREVIEWABLE_EXT.test(filename);
}

// Grid tiles load the stored file itself (no resized copy exists). A very large original is therefore not pulled
// into the grid automatically; it opens in the viewer on demand.
export const AUTO_THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024;
export function shouldAutoLoadThumbnail(sizeBytes: number | null, mimeType: string | null, filename: string): boolean {
  if (!isPreviewableImage(mimeType, filename)) return false;
  return sizeBytes == null || sizeBytes <= AUTO_THUMBNAIL_MAX_BYTES;
}

// ---------------------------------------------------------------- bulk outcomes
export type FileOutcome = { fileId: string; label: string; ok: boolean; error?: string };

const DECISION_WORDS: Record<ReviewDecision, { done: string; verb: string }> = {
  approve: { done: "approved (still private until released)", verb: "approve" },
  request_changes: { done: "returned for rework", verb: "return" },
  reject: { done: "declined", verb: "decline" },
};

// One honest summary for a bulk operation: how many succeeded, how many did not, and why. Never a single
// misleading success when some files failed.
export function summarizeOutcomes(action: string, outcomes: FileOutcome[]): { ok: boolean; message: string } {
  const done = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok);
  if (outcomes.length === 0) return { ok: false, message: "No files were selected." };
  if (failed.length === 0) return { ok: true, message: `${action}: ${done} of ${outcomes.length} file${outcomes.length === 1 ? "" : "s"} done.` };
  if (done === 0) return { ok: false, message: `${action}: none of the ${outcomes.length} file${outcomes.length === 1 ? "" : "s"} could be processed. ${failed[0].label}: ${failed[0].error ?? "failed"}` };
  return { ok: false, message: `${action}: ${done} of ${outcomes.length} done, ${failed.length} not done (see the list).` };
}

export function decisionSummary(decision: ReviewDecision, outcomes: FileOutcome[]): { ok: boolean; message: string } {
  const w = DECISION_WORDS[decision];
  const done = outcomes.filter((o) => o.ok).length;
  const base = summarizeOutcomes(`${w.verb[0].toUpperCase()}${w.verb.slice(1)}`, outcomes);
  return done > 0 && base.ok ? { ok: true, message: `${done} file${done === 1 ? "" : "s"} ${w.done}.` } : base;
}

// ---------------------------------------------------------------- display
export type ReviewBucket = "awaiting" | "approved" | "changes" | "released" | "private" | "other";
export const BUCKET_LABELS: Record<ReviewBucket, string> = {
  awaiting: "Awaiting review",
  approved: "Approved — not yet released",
  changes: "Returned for rework",
  released: "Released to the client",
  private: "Private — not submitted",
  other: "Withdrawn / declined",
};

export function bucketFor(releaseStatus: string): ReviewBucket {
  switch (releaseStatus) {
    case "submitted":
      return "awaiting";
    case "approved":
      return "approved";
    case "changes_requested":
      return "changes";
    case "released":
      return "released";
    case "private":
      return "private";
    default:
      return "other";
  }
}

export function statusLabel(releaseStatus: string): string {
  return RELEASE_STATUS_LABELS[releaseStatus as ReleaseStatus] ?? releaseStatus;
}

export const CLASSIFICATION_LABELS: Record<string, string> = {
  source_raw: "Source (RAW)",
  source_reference: "Source reference",
  intermediate: "Intermediate",
  working: "Working file",
  deliverable: "Deliverable",
  final_approved: "Final Approved (retention)",
  revision: "Revision",
  archive_reference: "Archive reference",
  other: "Other",
};

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- release readiness
// "Ready to deliver" = approved, deliverable-type, not yet released. Everything else is reported with the reason it
// is not in the delivery set, so nothing is released by accident.
export type DeliverySetSummary = { ready: number; awaitingReview: number; returned: number; released: number; notInSet: number };

export function summarizeDeliverySet(files: (ReviewableFileFacts & { id: string })[]): DeliverySetSummary {
  const s: DeliverySetSummary = { ready: 0, awaitingReview: 0, returned: 0, released: 0, notInSet: 0 };
  for (const f of files) {
    if (f.purged || !isReviewableFileKind(f.fileKind)) { s.notInSet++; continue; }
    if (f.releaseStatus === "approved") s.ready++;
    else if (f.releaseStatus === "submitted") s.awaitingReview++;
    else if (f.releaseStatus === "changes_requested") s.returned++;
    else if (f.releaseStatus === "released") s.released++;
    else s.notInSet++;
  }
  return s;
}

// ---------------------------------------------------------------- retention actions (media page)
export type RetentionOp = "confirm_backup" | "retain" | "unretain" | "final_approved";

export const RETENTION_MEANINGS: Record<RetentionOp, { label: string; meaning: string }> = {
  confirm_backup: {
    label: "Confirm backup",
    meaning:
      "Records that YOU have a copy of the file outside Ordift's storage. It does not create a backup, and it starts the cleanup grace period (10 days) — after which a file can be removed once its engagement is completed or cancelled, unless it is retained or final.",
  },
  retain: {
    label: "Retain",
    meaning: "Keeps the file out of automatic cleanup. It does not approve the file or show it to the client.",
  },
  unretain: { label: "Remove retain", meaning: "Lets the file take part in cleanup again (only after its engagement is completed or cancelled, and a backup is confirmed)." },
  final_approved: {
    label: "Mark as final version (retention)",
    meaning:
      "Changes the file's classification to Final Approved: permanently exempt from cleanup. It is NOT client approval and NOT a release — approval for the client and release are separate steps.",
  },
};

export function canApplyRetentionOp(op: RetentionOp, f: { fileKind: string; lifecycleState: string; retain: boolean; purged: boolean }): boolean {
  if (f.purged) return false;
  if (op === "confirm_backup") return f.lifecycleState === "active" && f.fileKind !== "final_approved";
  if (op === "retain") return !f.retain;
  if (op === "unretain") return f.retain;
  return f.fileKind === "deliverable" || f.fileKind === "revision";
}

// ---------------------------------------------------------------- gallery rows
export type GalleryFile = {
  id: string;
  filename: string;
  title: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileKind: string;
  classification: string;
  releaseStatus: string;
  categoryLabel: string | null;
  note: string | null;
  purged: boolean;
  retain: boolean;
  backedUp: boolean;
  // Why THIS viewer may not act on THIS file (separation of duties), if so. The file can still be viewed.
  blockedReason: string | null;
  emailed?: boolean;
};

export type GallerySource = {
  id: string;
  originalFilename: string;
  clientTitle: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileKind: string;
  releaseStatus: string;
  releaseCategory: string | null;
  releaseReviewNote: string | null;
  purgedAt: string | null;
  retain: boolean;
  backupConfirmedAt: string | null;
  uploadedBy: string | null;
  submittedForReleaseBy: string | null;
};

// Separation of duties is evaluated per file and per viewer, exactly as the server does it: the viewer is blocked
// from reviewing/releasing a file they uploaded, submitted, or that belongs to the job they are assigned to. They can
// still see it. This is for display; the server and the database enforce the rule independently.
export function toGalleryFile(f: GallerySource, viewerId: string, assigneeId: string | null, emailed = false): GalleryFile {
  return {
    id: f.id,
    filename: f.originalFilename,
    title: f.clientTitle,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    fileKind: f.fileKind,
    classification: CLASSIFICATION_LABELS[f.fileKind] ?? f.fileKind,
    releaseStatus: f.releaseStatus,
    categoryLabel: f.releaseCategory ? releaseCategoryLabel(f.releaseCategory) : null,
    note: f.releaseStatus === "changes_requested" ? f.releaseReviewNote : null,
    purged: Boolean(f.purgedAt),
    retain: f.retain,
    backedUp: Boolean(f.backupConfirmedAt),
    blockedReason: reviewerConflict({ reviewerId: viewerId, uploadedBy: f.uploadedBy, submittedBy: f.submittedForReleaseBy, assigneeId }),
    emailed,
  };
}
