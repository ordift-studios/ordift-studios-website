"use client";

import FileReviewGallery, { type GalleryAction } from "@/components/admin/FileReviewGallery";
import { canReviewFile, isPreviewableImage, type GalleryFile, type ReviewDecision } from "@/lib/crewSupport/fileReview";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { addCandidatesAction } from "@/app/admin/portfolio-library/actions";
import { previewUrlsAction, reviewFilesAction } from "./releaseActions";

// Management's review gallery for one assignment's files (client delivery). Approving does NOT release anything:
// approved files stay private until they are explicitly released below. Each action is re-checked per file on the
// server, including the rule that nobody reviews their own work.
export default function AssignmentReviewGallery({ requestId, engagementId, files }: { requestId: string; engagementId: string; files: GalleryFile[] }) {
  const decide = (decision: ReviewDecision) => (ids: string[], note: string) => reviewFilesAction({ requestId, engagementId, fileIds: ids, decision, note });
  const eligible = (decision: ReviewDecision) => (f: GalleryFile) => canReviewFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }, decision);
  const actions: GalleryAction[] = [
    { key: "approve", label: "Approve", tone: "primary", meaning: "Approves these images for client delivery. They stay private until you release them. Nothing is sent to the client by approving.", eligible: eligible("approve"), run: decide("approve") },
    { key: "request_changes", label: "Return for rework", tone: "neutral", meaning: "Sends the image back to the professional with your note. It leaves the delivery set until they resubmit it.", needsNote: true, noteLabel: "What needs to change (the professional will see this)", eligible: eligible("request_changes"), run: decide("request_changes") },
    { key: "reject", label: "Decline", tone: "danger", meaning: "Declines the image: it will not be delivered. The file itself is kept; nothing is deleted.", needsNote: true, noteLabel: "Why it is declined", eligible: eligible("reject"), run: decide("reject") },
  ];
  // Optional, independent of delivery: propose promising images as PRIVATE portfolio candidates while processing the job. It points at the same file (no copy,
  // no re-upload), changes no release or retention state, and publishes nothing; marketing permission and internal approval are decided separately.
  if (PORTFOLIO_LIBRARY_ENABLED) actions.push({
    key: "portfolio_candidate", label: "Add to Portfolio Candidates", tone: "neutral", ignoresBlock: true,
    meaning: "Marks these images as private portfolio candidates. Nothing is delivered, published or shared, delivery and retention are unchanged, and no client permission is assumed.",
    eligible: (f: GalleryFile) => !f.purged && isPreviewableImage(f.mimeType, f.filename),
    run: async (ids: string[]) => { const r = await addCandidatesAction(ids, "final_approval"); return { ok: r.ok, message: r.message, outcomes: [] }; },
  });
  return <FileReviewGallery files={files} actions={actions} fetchUrls={previewUrlsAction} emptyText="No files in this view." />;
}
