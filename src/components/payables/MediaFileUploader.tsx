"use client";

import { useState } from "react";

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

type UploadAuth = { ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string };
type RecordResult = { ok: true; id: string } | { ok: false; error: string };

type FileTask = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "recording" | "done" | "error";
  progress: number;
  error?: string;
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
}: {
  engagementId: string;
  fileKindOptions: { value: string; label: string }[];
  requestUpload: (params: { engagementId: string; fileKind: string; originalFilename: string }) => Promise<UploadAuth>;
  recordUpload: (params: {
    engagementId: string;
    fileKind: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }) => Promise<RecordResult>;
  onUploaded?: () => void;
}) {
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [fileKind, setFileKind] = useState(fileKindOptions[0]?.value ?? "other");

  async function runTask(task: FileTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "uploading", error: undefined } : t)));

    const auth = await requestUpload({ engagementId, fileKind, originalFilename: task.file.name });
    if (!auth.ok) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "error", error: auth.error } : t)));
      return;
    }

    try {
      await uploadWithProgress(auth.signedUrl, task.file, (pct) => setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, progress: pct } : t))));
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "error", error: err instanceof Error ? err.message : "Upload failed." } : t)));
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "recording" } : t)));
    const recorded = await recordUpload({
      engagementId,
      fileKind,
      storagePath: auth.path,
      originalFilename: task.file.name,
      mimeType: task.file.type || null,
      sizeBytes: task.file.size,
    });
    if (!recorded.ok) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "error", error: recorded.error } : t)));
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "done", progress: 100 } : t)));
    onUploaded?.();
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newTasks: FileTask[] = Array.from(fileList).map((file) => ({ id: crypto.randomUUID(), file, status: "queued", progress: 0 }));
    setTasks((prev) => [...prev, ...newTasks]);
    newTasks.forEach((t) => void runTask(t));
  }

  return (
    <div className="rounded-lg border border-black/10 p-4">
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

      <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-black/15 px-4 py-8 cursor-pointer hover:border-ordift-gold transition-colors">
        <span className="font-sans text-body-small text-ordift-ink">Drop files here or click to select</span>
        <span className="font-sans text-caption text-ordift-ink-muted">Multiple files supported — up to 5GB each</span>
        <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </label>

      {tasks.length > 0 && (
        <ul className="mt-4 space-y-2">
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
                    <button type="button" onClick={() => void runTask(t)} className="underline">
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
