"use client";

import { useState } from "react";
import { getMyFileDownloadUrlAction } from "@/app/portal/(dashboard)/collaborator/actions";

export type EngagementFileRow = {
  id: string;
  fileKind: string;
  originalFilename: string;
  sizeBytes: number | null;
  version: number;
  uploadedAt: string;
  displayState: string;
};

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
export default function EngagementFileList({ files }: { files: EngagementFileRow[] }) {
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

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{error}</p>
        </div>
      )}
      <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
        {files.map((f) => (
          <li key={f.id} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-sans text-body-small text-ordift-ink truncate">
                {f.originalFilename} {f.version > 1 && <span className="text-ordift-ink-muted">v{f.version}</span>}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {FILE_KIND_LABELS[f.fileKind] ?? f.fileKind} · {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleDateString()} · {f.displayState}
              </p>
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
