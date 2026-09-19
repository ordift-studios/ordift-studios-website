"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestSubmissionUploadAuthorizationAction, submitWorkAction } from "./actions";

const MATERIALS_BUCKET = "workshop-materials";

export function SubmitWorkForm({ briefId, kind, projectId }: { briefId: string; kind: string; projectId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setUploading(true);

    const note = noteRef.current?.value.trim() || null;
    const files = fileInputRef.current?.files;
    const storagePaths: string[] = [];

    if (files && files.length > 0) {
      const supabase = createClient();
      for (const file of Array.from(files)) {
        const authorization = await requestSubmissionUploadAuthorizationAction({ briefId, originalFilename: file.name });
        if (!authorization.ok) {
          setError(authorization.error);
          setUploading(false);
          return;
        }
        const { error: uploadError } = await supabase.storage.from(MATERIALS_BUCKET).uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
        if (uploadError) {
          setError(`Upload failed: ${uploadError.message}`);
          setUploading(false);
          return;
        }
        storagePaths.push(authorization.path);
      }
    }

    if (!note && storagePaths.length === 0) {
      setError("Add a note or attach at least one file.");
      setUploading(false);
      return;
    }

    const result = await submitWorkAction({ briefId, note, storagePaths, kind, projectId });
    if (!result.ok) {
      setError(result.error);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (noteRef.current) noteRef.current.value = "";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea ref={noteRef} rows={3} placeholder="Note / comment (optional if attaching files)" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      <input ref={fileInputRef} type="file" multiple className="font-sans text-body-small" />
      <button type="submit" disabled={uploading} aria-busy={uploading} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {uploading ? "Submitting…" : "Submit Work"}
      </button>
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      {success && !uploading && <p className="font-sans text-caption text-green-700">Submitted.</p>}
    </form>
  );
}
