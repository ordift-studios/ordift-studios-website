"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileReviewGallery, { type GalleryAction } from "@/components/admin/FileReviewGallery";
import { canReleaseFile, canReviewFile, isReviewableFileKind, type GalleryFile, type ReviewDecision } from "@/lib/crewSupport/fileReview";
import {
  FSR_CONFLICT_ACKNOWLEDGEMENT,
  FSR_EXCEPTION_TTL_HOURS,
  FSR_MIN_JUSTIFICATION_CHARS,
  FSR_POLICY_CODE,
  FSR_POLICY_TITLE,
  FSR_RELEASE_CONFIRMATION,
  FSR_REVIEW_CONFIRMATION,
  validateJustification,
  type FounderContext,
} from "@/lib/crewSupport/founderSelfReviewRules";
import { previewUrlsAction } from "./releaseActions";
import { closeFounderExceptionAction, founderSelfReleaseAction, founderSelfReviewDecideAction, founderViewerUrlAction, openFounderExceptionAction } from "./founderSelfReviewActions";

// The Founder's governed self-review, step by step: (A) enter the process, (B) justification + conflict acknowledgement,
// (C) open each image in the review viewer, (D–F) decide on a chosen set and confirm it by count and file names,
// (G–H) separately choose and confirm what becomes visible to the client, (I) the client email stays a separate,
// opt-in action elsewhere. Nothing here approves, releases or emails by itself.

const BOX = "rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2";
const BTN = "rounded-md px-3 py-1.5 font-sans text-caption font-semibold disabled:opacity-50";

export default function FounderSelfReviewPanel({ requestId, engagementId, context, files }: { requestId: string; engagementId: string; context: FounderContext; files: GalleryFile[] }) {
  const router = useRouter();
  const [justification, setJustification] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [viewed, setViewed] = useState<string[]>(context.state === "open" ? context.viewedFileIds : []);

  if (context.state === "not_applicable") return null;
  if (context.state === "linked_login") {
    return <div role="note" className={BOX}><p className="font-sans text-caption font-semibold text-amber-900">Not an independent reviewer</p><p className="font-sans text-caption text-amber-900">{context.message}</p></div>;
  }
  if (context.state === "unavailable") {
    return <div role="note" className={BOX}><p className="font-sans text-caption font-semibold text-amber-900">{FSR_POLICY_CODE} is not available</p><p className="font-sans text-caption text-amber-900">{context.reason}</p></div>;
  }

  const justificationCheck = validateJustification(justification);

  async function open() {
    setBusy(true);
    setMessage(null);
    const r = await openFounderExceptionAction({ requestId, engagementId, justification, acknowledged: ack });
    setBusy(false);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  }

  if (context.state === "available") {
    return (
      <section className={BOX} aria-labelledby={`fsr-${engagementId}`}>
        <h3 id={`fsr-${engagementId}`} className="font-sans text-body-small font-semibold text-amber-950">{FSR_POLICY_CODE} — {FSR_POLICY_TITLE}</h3>
        <p className="font-sans text-caption text-amber-950">You are the performing professional on this job and no independent reviewer is appointed. This governed exception lets you review and release your own images — it does not make you independent, it applies to this engagement only, and every step is permanently recorded.</p>
        <ul className="list-disc space-y-1 pl-5 font-sans text-caption text-amber-950">
          <li>You must open each image in the review viewer before you can decide on it.</li>
          <li>Approving and releasing are separate steps, each confirmed by count and file names. Nothing is released by approving, and the client is never emailed by either.</li>
          <li>Images added later are not covered. The exception lapses after {FSR_EXCEPTION_TTL_HOURS / 24} days or when you close it.</li>
        </ul>
        <label className="block font-sans text-caption text-amber-950">Why is a self-review needed? (at least {FSR_MIN_JUSTIFICATION_CHARS} characters)
          <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
        </label>
        {justification.length > 0 && !justificationCheck.ok && <p className="font-sans text-caption text-red-800">{justificationCheck.error}</p>}
        <label className="flex items-start gap-2 font-sans text-caption text-amber-950"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" /> {FSR_CONFLICT_ACKNOWLEDGEMENT}</label>
        <button type="button" disabled={busy || !justificationCheck.ok || !ack} onClick={() => void open()} className={`${BTN} bg-ordift-navy-950 text-white`}>{busy ? "Opening…" : "Open the Founder self-review exception"}</button>
        {message && <p role={message.ok ? "status" : "alert"} className={`font-sans text-caption ${message.ok ? "text-green-800" : "text-red-800"}`}>{message.text}</p>}
      </section>
    );
  }

  // ---- open
  const { exception } = context;
  const deliverables = files.filter((f) => isReviewableFileKind(f.fileKind) && !f.purged);
  const review = (decision: ReviewDecision) => async (ids: string[], note: string, attested: boolean, typed: string) =>
    founderSelfReviewDecideAction({ requestId, engagementId, exceptionId: exception.id, decisions: Object.fromEntries(ids.map((id) => [id, decision])), note, reviewConfirmed: attested, typedCount: typed });
  const eligible = (decision: ReviewDecision) => (f: GalleryFile) => canReviewFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }, decision) && viewed.includes(f.id);
  const actions: GalleryAction[] = [
    { key: "approve", label: "Approve (self-review)", tone: "primary", meaning: "Records YOU as the approving reviewer of your own work for these images, under this exception. They stay private until you separately release them. Nothing is sent to the client.", attestation: FSR_REVIEW_CONFIRMATION, typedCount: true, listAllNames: true, ignoresBlock: true, eligible: eligible("approve"), run: review("approve") },
    { key: "request_changes", label: "Return for rework", tone: "neutral", meaning: "Returns these images to yourself as the professional with your note. They leave the delivery set until resubmitted.", needsNote: true, noteLabel: "What needs to change", attestation: FSR_REVIEW_CONFIRMATION, typedCount: true, listAllNames: true, ignoresBlock: true, eligible: eligible("request_changes"), run: review("request_changes") },
    { key: "reject", label: "Decline", tone: "danger", meaning: "Declines these images: they will not be delivered. The files are kept; nothing is deleted.", needsNote: true, noteLabel: "Why they are declined", attestation: FSR_REVIEW_CONFIRMATION, typedCount: true, listAllNames: true, ignoresBlock: true, eligible: eligible("reject"), run: review("reject") },
    {
      key: "release", label: "Release to client", tone: "primary",
      meaning: "A separate declaration of exactly this set. The images become visible to the client in their portal now. This does not email the client, complete the project or change any payment. Emailing is a separate, optional step afterwards.",
      attestation: FSR_RELEASE_CONFIRMATION, typedCount: true, listAllNames: true, ignoresBlock: true,
      eligible: (f) => canReleaseFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }),
      run: async (ids, _note, attested, typed) => founderSelfReleaseAction({ requestId, engagementId, exceptionId: exception.id, fileIds: ids, releaseSetConfirmed: attested, typedCount: typed }),
    },
  ];

  async function close() {
    setBusy(true);
    const r = await closeFounderExceptionAction({ requestId, engagementId, exceptionId: exception.id, reason: closeReason });
    setBusy(false);
    setMessage({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <section className={BOX} aria-labelledby={`fsr-open-${engagementId}`}>
      <h3 id={`fsr-open-${engagementId}`} className="font-sans text-body-small font-semibold text-amber-950">{FSR_POLICY_CODE} exception is open — you are acting as both performer and reviewer</h3>
      <p className="font-sans text-caption text-amber-950">Justification on record: “{exception.justification}” · opened {new Date(exception.openedAt).toLocaleString()} · lapses {new Date(exception.expiresAt).toLocaleString()}</p>
      <ol className="list-decimal space-y-0.5 pl-5 font-sans text-caption text-amber-950">
        <li>Open each image below in the viewer ({viewed.length} of {deliverables.filter((f) => f.releaseStatus === "submitted").length} awaiting review opened). A decision becomes available for an image only after it was opened.</li>
        <li>Select images and approve, return for rework or decline; confirm by count and file names.</li>
        <li>Separately select approved images and release them to the client. Then, optionally, email the client from the release list.</li>
      </ol>
      <FileReviewGallery
        files={deliverables}
        actions={actions}
        fetchUrls={previewUrlsAction}
        viewerFetch={(fileId) => founderViewerUrlAction({ exceptionId: exception.id, fileId })}
        onViewed={(id) => setViewed((v) => (v.includes(id) ? v : [...v, id]))}
        viewedIds={viewed}
        emptyText="No deliverable images in this view."
      />
      <details>
        <summary className="cursor-pointer font-sans text-caption text-amber-950 underline underline-offset-4">Close this exception</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="Why you are closing it" className="rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
          <button type="button" disabled={busy || closeReason.trim().length < 5} onClick={() => void close()} className={`${BTN} border border-black/20`}>{busy ? "Closing…" : "Close exception"}</button>
        </div>
      </details>
      {message && <p role={message.ok ? "status" : "alert"} className={`font-sans text-caption ${message.ok ? "text-green-800" : "text-red-800"}`}>{message.text}</p>}
    </section>
  );
}
