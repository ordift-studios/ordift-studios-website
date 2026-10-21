"use client";

import FileReviewGallery, { type GalleryAction } from "@/components/admin/FileReviewGallery";
import { RETENTION_MEANINGS, canApplyRetentionOp, canReviewFile, type GalleryFile, type RetentionOp, type ReviewDecision } from "@/lib/crewSupport/fileReview";
import { previewUrlsAction, reviewFilesAction } from "@/app/admin/crew-support/releaseActions";
import { retentionOpAction } from "../../../actions";

// Uploads & Approvals gallery. Two different families of action live here and the labels say which is which:
//   * Review for CLIENT DELIVERY (approve / return for rework): same engine and same separation-of-duties rule as the
//     Crew Support request page. Approval is not a release.
//   * File RETENTION (confirm backup / retain / final version): how long Ordift keeps a file. None of these approves a
//     file for the client or shows it to them.
export default function MediaReviewGallery({ engagementId, requestId, files }: { engagementId: string; requestId: string; files: GalleryFile[] }) {
  const review = (decision: ReviewDecision) => (ids: string[], note: string) => reviewFilesAction({ requestId, engagementId, fileIds: ids, decision, note });
  const reviewEligible = (decision: ReviewDecision) => (f: GalleryFile) => canReviewFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }, decision);
  const retention = (op: RetentionOp) => (ids: string[], _note: string, attested: boolean) => retentionOpAction({ engagementId, op, fileIds: ids, attestedBackup: attested });
  const retentionEligible = (op: RetentionOp) => (f: GalleryFile) => canApplyRetentionOp(op, { fileKind: f.fileKind, lifecycleState: f.backedUp ? "backup_confirmed" : "active", retain: f.retain, purged: f.purged });
  const actions: GalleryAction[] = [
    { key: "approve", label: "Approve for client", tone: "primary", meaning: "Approves these images for client delivery. They stay private until released on the Crew Support request. This is NOT the same as 'final version' below.", eligible: reviewEligible("approve"), run: review("approve") },
    { key: "request_changes", label: "Return for rework", tone: "neutral", meaning: "Sends the image back to the professional with your note.", needsNote: true, noteLabel: "What needs to change (the professional will see this)", eligible: reviewEligible("request_changes"), run: review("request_changes") },
    { key: "confirm_backup", label: RETENTION_MEANINGS.confirm_backup.label, tone: "neutral", meaning: RETENTION_MEANINGS.confirm_backup.meaning, attestation: "I hold a copy of these files outside Ordift's storage.", eligible: retentionEligible("confirm_backup"), run: retention("confirm_backup"), ignoresBlock: true },
    { key: "retain", label: RETENTION_MEANINGS.retain.label, tone: "neutral", meaning: RETENTION_MEANINGS.retain.meaning, eligible: retentionEligible("retain"), run: retention("retain"), ignoresBlock: true },
    { key: "unretain", label: RETENTION_MEANINGS.unretain.label, tone: "neutral", meaning: RETENTION_MEANINGS.unretain.meaning, eligible: retentionEligible("unretain"), run: retention("unretain"), ignoresBlock: true },
    { key: "final_approved", label: RETENTION_MEANINGS.final_approved.label, tone: "neutral", meaning: RETENTION_MEANINGS.final_approved.meaning, eligible: retentionEligible("final_approved"), run: retention("final_approved"), ignoresBlock: true },
  ];
  return <FileReviewGallery files={files} actions={actions} fetchUrls={previewUrlsAction} emptyText="No files yet." />;
}
