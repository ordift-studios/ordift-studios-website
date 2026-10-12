"use client";

import { useEffect, useRef, useState } from "react";
import { idsToStart, summarizeQueue, summaryText } from "@/lib/payables/uploadQueue";

// Phase H.1/H.2 (2026-09-04) — shared direct-to-Supabase-Storage
// uploader, used by both the portal (contractor uploading a deliverable/
// revision) and the admin Payables media page (staff uploading
// source/reference/working material) — same upload mechanics, only the
// allowed file kinds and the authorized action functions differ, passed
// in as props so this component has no opinion about who's calling it.
//
// Browser -> requestUpload (Ordift authorization check, issues a
// short-lived signed upload URL) -> browser PUTs the file bytes
// straight to Storage via plain XMLHttpRequest (chosen over fetch()
// specifically because XHR exposes upload.onprogress — fetch does
// not, and no new dependency is justified for that alone) ->
// recordUpload writes the metadata row only after the direct upload
// has actually succeeded. The file's bytes never pass through this
// Next.js server at any point — multi-GB files never hit Vercel's
// request-body ceiling because no request to this app ever carries
// them.
//
// Deliberately NOT chunked/resumable (tus-js-client or equivalent) —
// see the Phase H.1/H.2 report's Known Limitations: a real photo
// editor's RAW batch is realistically hundreds of MB, well within a
// single-shot PUT on any reasonable connection; true multi-GB
// resumable transfer is flagged as a NEXT item rather than adding a
// new dependency for this first pass. Retry here means "attempt the
// whole file again", not "resume mid-transfer".

// Optional (assignment workspace): a second choice that tags each upload with what it is, so it can later be
// submitted for client release. Uploads are always private.
type CategoryOption = { value: string; label: string };
type UploadAuth = { ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string };
type RecordResult = { ok: true; id: string } | { ok: false; error: string };

type FileTask = {
  id: string;
  file: File;
  // What the file is, fixed when it is added — changing the dropdowns afterwards must not re-label files already queued.
  fileKind: string;
  releaseCategory?: string;
  status: "queued" | "uploading" | "recording" | "done" | "error";
  progress: number;
  error?: string;
  // Set once the bytes are safely in storage, so a retry after a failed save does not upload (and orphan) the file again.
  storagePath?: string;
};

function uploadWithProgress(signedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });
}

export default function MediaFileUploader({
  engagementId,
  fileKindOptions,
  requestUpload,
  recordUpload,
  onUploaded,
  categoryOptions,
}: {
  engagementId: string;
  fileKindOptions: { value: string; label: string }[];
  requestUpload: (params: { engagementId: string; fileKind: string; originalFilename: string; releaseCategory?: string | null }) => Promise<UploadAuth>;
  recordUpload: (params: {
    engagementId: string;
    fileKind: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    releaseCategory?: string | null;
  }) => Promise<RecordResult>;
  onUploaded?: () => void;
  categoryOptions?: CategoryOption[];
}) {
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [fileKind, setFileKind] = useState(fileKindOptions[0]?.value ?? "other");
  const [category, setCategory] = useState(categoryOptions?.[0]?.value ?? "");
  const releaseCategory = categoryOptions ? category : undefined;

  // A few uploads run at a time (see uploadQueue.ts); the rest wait their turn. tasksRef mirrors the state so the scheduler
  // (pump) always sees the latest list: it marks a task "uploading" before starting it, so nothing is ever started twice.
  const tasksRef = useRef<FileTask[]>([]);
  const commit = (updater: (prev: FileTask[]) => FileTask[]) => {
    tasksRef.current = updater(tasksRef.current);
    setTasks(tasksRef.current);
  };
  const patch = (id: string, change: Partial<FileTask>) => commit((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

  function pump() {
    for (const id of idsToStart(tasksRef.current)) {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) continue;
      patch(id, { status: "uploading", error: undefined });
      void runTask(task).finally(pump);
    }
  }

  async function runTask(task: FileTask) {
    let path = task.storagePath;
    if (!path) {
      const auth = await requestUpload({ engagementId, fileKind: task.fileKind, originalFilename: task.file.name, releaseCategory: task.releaseCategory });
      if (!auth.ok) {
        patch(task.id, { status: "error", error: auth.error });
        return;
      }
      try {
        await uploadWithProgress(auth.signedUrl, task.file, (pct) => patch(task.id, { progress: pct }));
      } catch (err) {
        patch(task.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
        return;
      }
      path = auth.path;
      patch(task.id, { storagePath: path });
    }

    patch(task.id, { status: "recording" });
    const recorded = await recordUpload({
      engagementId,
      fileKind: task.fileKind,
      storagePath: path,
      originalFilename: task.file.name,
      mimeType: task.file.type || null,
      sizeBytes: task.file.size,
      releaseCategory: task.releaseCategory,
    });
    if (!recorded.ok) {
      patch(task.id, { status: "error", error: recorded.error });
      return;
    }
    patch(task.id, { status: "done", progress: 100 });
    onUploaded?.();
  }

  const summary = summarizeQueue(tasks);
  // Closing the tab mid-upload loses the files in flight; ask first.
  useEffect(() => {
    if (!summary.busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [summary.busy]);

  function retry(id: string) {
    patch(id, { status: "queued", error: undefined });
    pump();
  }
  function retryAllFailed() {
    commit((prev) => prev.map((t) => (t.status === "error" ? { ...t, status: "queued" as const, error: undefined } : t)));
    pump();
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newTasks: FileTask[] = Array.from(fileList).map((file) => ({ id: crypto.randomUUID(), file, fileKind, releaseCategory, status: "queued", progress: 0 }));
    commit((prev) => [...prev, ...newTasks]);
    pump();
  }

  return (
    <div className="rounded-lg border border-black/10 p-4">
      {fileKindOptions.length > 1 && (
      <label className="flex flex-col gap-1 mb-3 max-w-xs">
        <span className="font-sans text-caption text-ordift-ink-muted">Uploading as</span>
        <select value={fileKind} onChange={(e) => setFileKind(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          {fileKindOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      )}
      {categoryOptions && (
      <label className="flex flex-col gap-1 mb-3 max-w-xs">
        <span className="font-sans text-caption text-ordift-ink-muted">What are these files?</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      )}

      <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-black/15 px-4 py-8 cursor-pointer hover:border-ordift-gold transition-colors">
        <span className="font-sans text-body-small text-ordift-ink">Drop files here or click to select</span>
        <span className="font-sans text-caption text-ordift-ink-muted">Multiple files supported — up to 5GB each</span>
        <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </label>

      {tasks.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="font-sans text-caption text-ordift-ink-muted">{summaryText(summary)}</p>
          {summary.failed > 1 && (
            <button type="button" onClick={retryAllFailed} className="font-sans text-caption underline underline-offset-4">Retry all failed</button>
          )}
        </div>
      )}
      {tasks.length > 0 && (
        <ul className="mt-2 space-y-2 max-h-96 overflow-y-auto">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded border border-black/5 px-3 py-2">
              <span className="font-sans text-caption text-ordift-ink truncate">{t.file.name}</span>
              <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                {t.status === "done" && "Uploaded"}
                {t.status === "uploading" && `${t.progress}%`}
                {t.status === "recording" && "Saving…"}
                {t.status === "queued" && "Queued"}
                {t.status === "error" && (
                  <span className="text-red-700">
                    {t.error ?? "Failed"}{" "}
                    <button type="button" onClick={() => retry(t.id)} className="underline">
                      Retry
                    </button>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
