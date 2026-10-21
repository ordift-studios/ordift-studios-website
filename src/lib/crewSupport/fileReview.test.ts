import { describe, expect, it } from "vitest";
import {
  AUTO_THUMBNAIL_MAX_BYTES,
  bucketFor,
  canApplyRetentionOp,
  canReleaseFile,
  canReviewFile,
  decisionSummary,
  eligibleForDecision,
  isPreviewableImage,
  isReviewableFileKind,
  shouldAutoLoadThumbnail,
  summarizeDeliverySet,
  summarizeOutcomes,
  toGalleryFile,
  type GallerySource,
} from "./fileReview";
import { SELF_REVIEW_MESSAGE } from "./fileRelease";

const f = (id: string, over: Partial<{ fileKind: string; releaseStatus: string; purged: boolean }> = {}) => ({ id, fileKind: "deliverable", releaseStatus: "submitted", purged: false, ...over });

describe("review eligibility — only deliverable-type, unreleased, unpurged files take part", () => {
  it("approves only submitted deliverables", () => {
    expect(canReviewFile(f("a"), "approve")).toBe(true);
    for (const status of ["private", "approved", "changes_requested", "released", "withdrawn"]) expect(canReviewFile(f("a", { releaseStatus: status }), "approve")).toBe(false);
  });
  it("returns for rework or declines from the states the status machine allows", () => {
    expect(canReviewFile(f("a", { releaseStatus: "approved" }), "request_changes")).toBe(true);
    expect(canReviewFile(f("a", { releaseStatus: "changes_requested" }), "reject")).toBe(true);
    expect(canReviewFile(f("a", { releaseStatus: "released" }), "request_changes")).toBe(false);
    expect(canReviewFile(f("a", { releaseStatus: "released" }), "reject")).toBe(false);
  });
  it("never includes RAW source, source reference, intermediate, working, archive or other files — even if submitted", () => {
    for (const kind of ["source_raw", "source_reference", "intermediate", "working", "archive_reference", "other"]) {
      expect(isReviewableFileKind(kind)).toBe(false);
      expect(canReviewFile(f("a", { fileKind: kind }), "approve")).toBe(false);
    }
    for (const kind of ["deliverable", "revision", "final_approved"]) expect(isReviewableFileKind(kind)).toBe(true);
  });
  it("never includes purged files", () => {
    expect(canReviewFile(f("a", { purged: true }), "approve")).toBe(false);
  });
  it("a file uploaded as Final Approved does NOT bypass review: it is eligible only once submitted, and private files are not", () => {
    expect(canReviewFile(f("a", { fileKind: "final_approved", releaseStatus: "private" }), "approve")).toBe(false);
    expect(canReviewFile(f("a", { fileKind: "final_approved", releaseStatus: "submitted" }), "approve")).toBe(true);
    expect(canReleaseFile(f("a", { fileKind: "final_approved", releaseStatus: "submitted" }))).toBe(false);
  });
  it("release is possible only for approved deliverable-type files", () => {
    expect(canReleaseFile(f("a", { releaseStatus: "approved" }))).toBe(true);
    expect(canReleaseFile(f("a", { releaseStatus: "approved", fileKind: "source_raw" }))).toBe(false);
    expect(canReleaseFile(f("a", { releaseStatus: "released" }))).toBe(false);
  });
  it("a bulk selection is reduced to the eligible files, in order, without duplicates", () => {
    const set = [f("1"), f("2", { fileKind: "source_raw" }), f("3", { releaseStatus: "released" }), f("1"), f("4"), f("5", { purged: true })];
    expect(eligibleForDecision(set, "approve").map((x) => x.id)).toEqual(["1", "4"]);
  });
});

describe("previews", () => {
  it("previews browser-renderable images only", () => {
    expect(isPreviewableImage("image/jpeg", "a.jpeg")).toBe(true);
    expect(isPreviewableImage("image/png", "a.png")).toBe(true);
    expect(isPreviewableImage("application/octet-stream", "photo.JPG")).toBe(true);
    for (const [m, n] of [["image/heic", "a.heic"], ["image/tiff", "a.tif"], ["image/x-canon-cr3", "a.cr3"], ["video/mp4", "a.mp4"], ["application/pdf", "a.pdf"], ["image/vnd.adobe.photoshop", "a.psd"]] as const) expect(isPreviewableImage(m, n)).toBe(false);
  });
  it("does not auto-load very large originals into the grid (no resized copies exist)", () => {
    expect(shouldAutoLoadThumbnail(3 * 1024 * 1024, "image/jpeg", "a.jpeg")).toBe(true);
    expect(shouldAutoLoadThumbnail(AUTO_THUMBNAIL_MAX_BYTES + 1, "image/jpeg", "a.jpeg")).toBe(false);
    expect(shouldAutoLoadThumbnail(50 * 1024 * 1024, "image/jpeg", "a.jpeg")).toBe(false);
    expect(shouldAutoLoadThumbnail(1000, "image/heic", "a.heic")).toBe(false);
  });
});

describe("honest bulk outcomes", () => {
  const ok = (id: string) => ({ fileId: id, label: id, ok: true });
  const bad = (id: string, error: string) => ({ fileId: id, label: id, ok: false, error });
  it("all succeeded", () => expect(decisionSummary("approve", [ok("a"), ok("b")])).toEqual({ ok: true, message: "2 files approved (still private until released)." }));
  it("a mix is reported as a mix, not as success", () => {
    const r = decisionSummary("request_changes", [ok("a"), ok("b"), bad("c", "x")]);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/2 of 3 done, 1 not done/);
  });
  it("none succeeded names the first reason", () => {
    const r = summarizeOutcomes("Approve", [bad("a", "own work"), bad("b", "own work")]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("own work");
  });
  it("an empty selection is a failure", () => expect(summarizeOutcomes("Approve", []).ok).toBe(false));
});

describe("delivery set and buckets", () => {
  it("counts ready, awaiting, returned, released and not-in-set separately", () => {
    const s = summarizeDeliverySet([f("1", { releaseStatus: "approved" }), f("2"), f("3"), f("4", { releaseStatus: "changes_requested" }), f("5", { releaseStatus: "released" }), f("6", { fileKind: "source_raw" }), f("7", { releaseStatus: "private" })]);
    expect(s).toEqual({ ready: 1, awaitingReview: 2, returned: 1, released: 1, notInSet: 2 });
  });
  it("maps statuses to review buckets", () => {
    expect(["submitted", "approved", "changes_requested", "released", "private", "withdrawn"].map(bucketFor)).toEqual(["awaiting", "approved", "changes", "released", "private", "other"]);
  });
});

describe("retention operations are separate from client approval", () => {
  const base = { fileKind: "deliverable", lifecycleState: "active", retain: false, purged: false };
  it("confirm backup only for active, non-final files", () => {
    expect(canApplyRetentionOp("confirm_backup", base)).toBe(true);
    expect(canApplyRetentionOp("confirm_backup", { ...base, lifecycleState: "backup_confirmed" })).toBe(false);
    expect(canApplyRetentionOp("confirm_backup", { ...base, fileKind: "final_approved" })).toBe(false);
  });
  it("retain / remove retain follow the current flag", () => {
    expect(canApplyRetentionOp("retain", base)).toBe(true);
    expect(canApplyRetentionOp("retain", { ...base, retain: true })).toBe(false);
    expect(canApplyRetentionOp("unretain", { ...base, retain: true })).toBe(true);
  });
  it("final version only for deliverables/revisions, never purged files", () => {
    expect(canApplyRetentionOp("final_approved", base)).toBe(true);
    expect(canApplyRetentionOp("final_approved", { ...base, fileKind: "source_raw" })).toBe(false);
    expect(canApplyRetentionOp("final_approved", { ...base, purged: true })).toBe(false);
  });
});

describe("gallery rows apply separation of duties per file and per viewer", () => {
  const FOUNDER = "founder-profile";
  const OTHER = "someone-else";
  const src = (over: Partial<GallerySource> = {}): GallerySource => ({
    id: "f1", originalFilename: "a.jpeg", clientTitle: "A", mimeType: "image/jpeg", sizeBytes: 1000, fileKind: "deliverable", releaseStatus: "submitted",
    releaseCategory: "final_gallery", releaseReviewNote: null, purgedAt: null, retain: false, backupConfirmedAt: null, uploadedBy: FOUNDER, submittedForReleaseBy: FOUNDER, ...over,
  });
  it("blocks the assigned professional who uploaded and submitted the file, but the file is still listed", () => {
    const row = toGalleryFile(src(), FOUNDER, FOUNDER);
    expect(row.blockedReason).toBe(SELF_REVIEW_MESSAGE);
    expect(row.title).toBe("A");
    expect(row.categoryLabel).toBe("Final photography gallery");
  });
  it("blocks the assignee even for a file someone else uploaded", () => {
    expect(toGalleryFile(src({ uploadedBy: OTHER, submittedForReleaseBy: OTHER }), FOUNDER, FOUNDER).blockedReason).toBe(SELF_REVIEW_MESSAGE);
  });
  it("does not block a different, independent reviewer", () => {
    expect(toGalleryFile(src(), OTHER, FOUNDER).blockedReason).toBeNull();
  });
  it("shows the rework note only while changes are requested", () => {
    expect(toGalleryFile(src({ releaseStatus: "changes_requested", releaseReviewNote: "soften skin" }), OTHER, FOUNDER).note).toBe("soften skin");
    expect(toGalleryFile(src({ releaseStatus: "approved", releaseReviewNote: "old" }), OTHER, FOUNDER).note).toBeNull();
  });
  it("keeps upload classification and release status as separate facts", () => {
    const row = toGalleryFile(src({ fileKind: "final_approved", releaseStatus: "private" }), OTHER, FOUNDER);
    expect(row.classification).toBe("Final Approved (retention)");
    expect(row.releaseStatus).toBe("private");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLEANUP_GRACE_DAYS, retentionImplications, tileCleanupNote } from "./fileReview";

describe("retention implications are shown for the exact selection", () => {
  const now = new Date("2026-10-22T09:00:00Z");
  const files = [{ fileKind: "deliverable", retain: false, backedUp: false }, { fileKind: "deliverable", retain: false, backedUp: false }];
  it("the grace period matches the platform's cleanup rule (pinned against projectFiles.ts)", () => {
    const text = readFileSync(join(process.cwd(), "src/lib/payables/projectFiles.ts"), "utf8");
    expect(text).toContain(`const DEFAULT_GRACE_PERIOD_DAYS = ${CLEANUP_GRACE_DAYS};`);
    expect(CLEANUP_GRACE_DAYS).toBe(10);
  });
  it("confirm backup: states it is only an attestation, shows the 10-day date, and that an open engagement blocks cleanup", () => {
    const lines = retentionImplications("confirm_backup", files, "engagement_active", now).join(" ");
    expect(lines).toContain("attesting that you hold a copy of 2 files outside Ordift's storage");
    expect(lines).toContain("does not make a backup for you");
    expect(lines).toContain("10-day grace period today (2026-10-22); it ends on 2026-11-01");
    expect(lines).toContain("nothing can be cleaned up while it stays open");
    expect(lines).toContain("unless they are retained or marked as the final version");
    expect(lines).toContain("no scheduler exists");
  });
  it("confirm backup on a completed engagement says the files become removable after the grace date", () => {
    const lines = retentionImplications("confirm_backup", files, "completed", now).join(" ");
    expect(lines).toContain("after 2026-11-01 these files can be removed by a manual “Run Cleanup”");
    expect(lines).not.toContain("nothing can be cleaned up while it stays open");
  });
  it("retain, remove-retain and final-version each state their own consequence and never claim client approval", () => {
    expect(retentionImplications("retain", files, "engagement_active", now).join(" ")).toContain("Nothing is approved, released or sent to the client");
    const un = retentionImplications("unretain", [{ fileKind: "deliverable", retain: true, backedUp: true }, { fileKind: "deliverable", retain: true, backedUp: false }], "completed", now).join(" ");
    expect(un).toContain("(1 of 2 is)");
    const fin = retentionImplications("final_approved", files, "engagement_active", now).join(" ");
    expect(fin).toContain("not client approval and does not release anything");
    expect(fin).toContain("at least one deliverable is marked as the final version");
  });
  it("every retention explanation ends with the fact that cleanup is manual", () => {
    for (const op of ["confirm_backup", "retain", "unretain", "final_approved"] as const) {
      expect(retentionImplications(op, files, "completed", now).at(-1)).toContain("Cleanup is never automatic");
    }
  });
  it("grid notes show the cleanup state of each file", () => {
    const base = { fileKind: "deliverable", retain: false, backedUp: false, purgeScheduledAt: null, purged: false };
    expect(tileCleanupNote(base, "engagement_active")).toBeNull();
    expect(tileCleanupNote({ ...base, backedUp: true, purgeScheduledAt: "2026-11-01T09:00:00Z" }, "engagement_active")).toBe("Backup confirmed — cleanup possible from 2026-11-01, once the engagement is completed or cancelled");
    expect(tileCleanupNote({ ...base, backedUp: true, purgeScheduledAt: "2026-11-01T09:00:00Z" }, "completed")).toBe("Backup confirmed — cleanup possible from 2026-11-01");
    expect(tileCleanupNote({ ...base, retain: true, backedUp: true }, "completed")).toBe("Retained — exempt from cleanup");
    expect(tileCleanupNote({ ...base, fileKind: "final_approved" }, "completed")).toBe("Final version — exempt from cleanup");
    expect(tileCleanupNote({ ...base, purged: true }, "completed")).toBe("Removed by cleanup");
  });
  it("the media gallery wires an implications panel to every retention action and a cleanup note to every tile", () => {
    const w = readFileSync(join(process.cwd(), "src/app/admin/payables/engagements/[id]/media/MediaReviewGallery.tsx"), "utf8");
    for (const op of ["confirm_backup", "retain", "unretain", "final_approved"]) expect(w).toContain(`implications: implications("${op}")`);
    expect(w).toContain("cleanupNote={(f) => tileCleanupNote(f, engagementStatus)}");
    expect(readFileSync(join(process.cwd(), "src/app/admin/payables/engagements/[id]/media/page.tsx"), "utf8")).toContain("engagementStatus={engagement.status}");
  });
});
