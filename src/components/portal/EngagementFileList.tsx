"use client";

import { useState } from "react";
import { getMyFileDownloadUrlAction } from "@/app/portal/(dashboard)/collaborator/actions";
import { removeOwnPrivateFileAction, submitFileForReleaseAction, submitAllPrivateFilesAction, withdrawFileFromReviewAction } from "@/app/portal/(dashboard)/collaborator/assignmentWorkActions";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { RELEASE_CATEGORIES, RELEASE_STATUS_LABELS, canRemoveOwnFile, professionalActions, releaseCategoryLabel, type ReleaseStatus } from "@/lib/crewSupport/fileRelease";

export type EngagementFileRow = {
  id: string;
  fileKind: string;
  originalFilename: string;
  sizeBytes: number | null;
  version: number;
  uploadedAt: string;
  displayState: string;
  // Assignment workspace only: where the file is in the controlled release to the client.
  releaseCategory?: string | null;
  releaseStatus?: string;
  clientTitle?: string | null;
  releaseReviewNote?: string | null;
  // The viewer uploaded this file themselves (only then may they remove it).
  canRemove?: boolean;
};

const STATUS_TONE: Record<string, string> = {
  private: "bg-black/5 text-ordift-ink-muted",
  submitted: "bg-amber-50 text-amber-800",
  changes_requested: "bg-red-50 text-red-800",
  approved: "bg-blue-50 text-blue-800",
  released: "bg-green-50 text-green-800",
  withdrawn: "bg-black/5 text-ordift-ink-muted",
};

function baseTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const FILE_KIND_LABELS: Record<string, string> = {
  source_raw: "Source (RAW)",
  source_reference: "Reference",
  intermediate: "Intermediate",
  working: "Working file",
  deliverable: "Deliverable",
  final_approved: "Final (Approved)",
  revision: "Revision",
  archive_reference: "Archive reference",
  other: "Other",
};

// Downloads go through a signed URL requested on click, not a static
// link — the URL is short-lived (300s) and authorized fresh each time,
// matching the established pattern (payeeInstructions/paymentEvidence/
// recruitment signed downloads).
export default function EngagementFileList({ files, releaseEngagementId }: { files: EngagementFileRow[]; releaseEngagementId?: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(fileId: string) {
    setError(null);
    setDownloading(fileId);
    const result = await getMyFileDownloadUrlAction(fileId);
    setDownloading(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  if (files.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">No files yet.</p>;
  }

  const releaseEnabled = Boolean(releaseEngagementId);
  const privateTagged = files.filter((f) => (f.releaseStatus ?? "private") === "private" && f.releaseCategory).length;

  return (
    <div>
      {releaseEnabled && privateTagged > 1 && (
        <ActionForm action={submitAllPrivateFilesAction} className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3">
          <input type="hidden" name="engagementId" value={releaseEngagementId} />
          <p className="font-sans text-caption text-ordift-ink-muted">{privateTagged} private files are ready to send for review. Each keeps its file name as its title.</p>
          <SubmitButton pendingLabel="Submitting…" className="rounded-md bg-ordift-navy-950 px-3 py-1.5 font-sans text-caption font-semibold text-white">Submit all for review</SubmitButton>
        </ActionForm>
      )}
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{error}</p>
        </div>
      )}
      <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
        {files.map((f) => (
          <li key={f.id} className="px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-sans text-body-small text-ordift-ink truncate">
                {f.originalFilename} {f.version > 1 && <span className="text-ordift-ink-muted">v{f.version}</span>}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {releaseEnabled && f.releaseCategory ? releaseCategoryLabel(f.releaseCategory) : FILE_KIND_LABELS[f.fileKind] ?? f.fileKind} · {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleDateString()}
                {!releaseEnabled && <> · {f.displayState}</>}
              </p>
              {releaseEnabled && (
                <>
                  <p className="mt-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-sans text-caption font-medium ${STATUS_TONE[f.releaseStatus ?? "private"] ?? ""}`}>{RELEASE_STATUS_LABELS[(f.releaseStatus ?? "private") as ReleaseStatus] ?? f.releaseStatus}</span>
                    {f.clientTitle && <span className="ml-2 font-sans text-caption text-ordift-ink-muted">Client title: {f.clientTitle}</span>}
                  </p>
                  {f.releaseStatus === "changes_requested" && f.releaseReviewNote && (
                    <p className="mt-1 font-sans text-caption text-red-800">Management asked for changes: {f.releaseReviewNote}</p>
                  )}
                  {professionalActions(f.releaseStatus ?? "private").includes("submit") && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">{f.releaseStatus === "changes_requested" ? "Resubmit for review" : "Submit for client review"}</summary>
                      <ActionForm action={submitFileForReleaseAction} className="mt-2 space-y-2">
                        <input type="hidden" name="engagementId" value={releaseEngagementId} />
                        <input type="hidden" name="fileId" value={f.id} />
                        <select name="category" defaultValue={f.releaseCategory ?? "thank_you_image"} className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                          {RELEASE_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <input name="title" defaultValue={f.clientTitle ?? baseTitle(f.originalFilename)} placeholder="Title the client will see" required className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <input name="description" defaultValue="" placeholder="Short description (optional)" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <SubmitButton pendingLabel="Submitting…" className="rounded-md bg-ordift-navy-950 px-3 py-1.5 font-sans text-caption font-semibold text-white">Submit for review</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  {canRemoveOwnFile(f.releaseStatus ?? "private") && f.canRemove && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-sans text-caption text-ordift-ink-muted underline underline-offset-4">Remove this file</summary>
                      <ActionForm action={removeOwnPrivateFileAction} className="mt-2 flex flex-wrap items-center gap-3">
                        <input type="hidden" name="engagementId" value={releaseEngagementId} />
                        <input type="hidden" name="fileId" value={f.id} />
                        <p className="font-sans text-caption text-ordift-ink-muted">This deletes the stored copy. Use it for a wrong or duplicate upload. Nobody is notified.</p>
                        <SubmitButton pendingLabel="Removing…" className="rounded-md border border-red-300 px-3 py-1.5 font-sans text-caption font-semibold text-red-800">Remove file</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  {professionalActions(f.releaseStatus ?? "private").includes("withdraw_from_review") && (
                    <ActionForm action={withdrawFileFromReviewAction} className="mt-2">
                      <input type="hidden" name="engagementId" value={releaseEngagementId} />
                      <input type="hidden" name="fileId" value={f.id} />
                      <SubmitButton pendingLabel="Withdrawing…" className="font-sans text-caption underline underline-offset-4 text-ordift-ink-muted">Withdraw from review</SubmitButton>
                    </ActionForm>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => void download(f.id)}
              disabled={downloading === f.id}
              className="shrink-0 rounded border border-black/15 px-3 py-1.5 font-sans text-caption hover:border-black/30 disabled:opacity-50"
            >
              {downloading === f.id ? "Preparing…" : "Download"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
