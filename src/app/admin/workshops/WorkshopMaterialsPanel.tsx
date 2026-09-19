"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  requestMaterialUploadAuthorizationAction,
  recordMaterialUploadAction,
  createMaterialLinkAction,
  deleteMaterialAction,
  type ActionState,
} from "./actions";

const MATERIALS_BUCKET = "workshop-materials";

export type MaterialRow = {
  id: string;
  title: string;
  description: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  visibility: "admin" | "instructor" | "participant";
  availableFrom: string | null;
};

function DeleteMaterialButton({ workshopId, materialId }: { workshopId: string; materialId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteMaterialAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-ink-muted hover:text-red-700 underline underline-offset-4 disabled:opacity-50">
        Remove
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
    </form>
  );
}

export function MaterialList({ workshopId, materials }: { workshopId: string; materials: MaterialRow[] }) {
  if (materials.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">No materials uploaded yet.</p>;
  }
  return (
    <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
      {materials.map((m) => (
        <li key={m.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
          <div>
            <p className="font-sans text-body-small text-ordift-ink">{m.title}</p>
            <p className="font-sans text-caption text-ordift-ink-muted">
              {m.visibility} visibility{m.externalUrl ? " · external link" : " · uploaded file"}
              {m.availableFrom ? ` · available from ${new Date(m.availableFrom).toLocaleString("en-GB")}` : ""}
            </p>
          </div>
          <DeleteMaterialButton workshopId={workshopId} materialId={m.id} />
        </li>
      ))}
    </ul>
  );
}

// Direct-to-Storage signed-URL upload — same pattern as
// VendorDetailWorkspace's UploadDocumentForm: file bytes never pass
// through this Next.js server, only two small round-trips (get
// authorization, then record the resulting path) bracket the
// browser's own PUT to Storage.
export function MaterialUploadForm({ workshopId }: { workshopId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const visibilityRef = useRef<HTMLSelectElement>(null);
  const availableFromRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    const title = titleRef.current?.value.trim() ?? "";
    if (!file) return setError("Choose a file to upload.");
    if (!title) return setError("A title is required.");

    setUploading(true);
    const authorization = await requestMaterialUploadAuthorizationAction({ workshopId, originalFilename: file.name });
    if (!authorization.ok) {
      setError(authorization.error);
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const recorded = await recordMaterialUploadAction({
      workshopId,
      storagePath: authorization.path,
      title,
      description: descriptionRef.current?.value.trim() || null,
      visibility: (visibilityRef.current?.value as "admin" | "instructor" | "participant") ?? "participant",
      availableFrom: availableFromRef.current?.value ? new Date(availableFromRef.current.value).toISOString() : null,
    });
    if (!recorded.ok) {
      setError(recorded.error);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (titleRef.current) titleRef.current.value = "";
    if (descriptionRef.current) descriptionRef.current.value = "";
    if (availableFromRef.current) availableFromRef.current.value = "";
  }

  return (
    <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input ref={titleRef} placeholder="Title" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <select ref={visibilityRef} defaultValue="participant" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="participant">Participant-visible</option>
        <option value="instructor">Instructor-only</option>
        <option value="admin">Admin/internal-only</option>
      </select>
      <input ref={descriptionRef} placeholder="Description (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input ref={fileInputRef} type="file" required className="font-sans text-body-small" />
      <input ref={availableFromRef} type="datetime-local" title="Available from (optional — leave blank for immediately)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={uploading} aria-busy={uploading} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {uploading ? "Uploading…" : "Upload Material"}
      </button>
      {error && <p className="sm:col-span-2 font-sans text-caption text-red-700">{error}</p>}
      {success && !uploading && <p className="sm:col-span-2 font-sans text-caption text-green-700">Uploaded.</p>}
    </form>
  );
}

export function AddMaterialLinkForm({ workshopId }: { workshopId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createMaterialLinkAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input type="hidden" name="workshopId" value={workshopId} />
      <input name="title" placeholder="Title" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <select name="visibility" defaultValue="participant" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="participant">Participant-visible</option>
        <option value="instructor">Instructor-only</option>
        <option value="admin">Admin/internal-only</option>
      </select>
      <input name="externalUrl" type="url" placeholder="https://… (reference video/link)" required className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} aria-busy={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-ordift-ink/30 text-ordift-ink disabled:opacity-50">
        {pending ? "Adding…" : "Add Reference Link"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Link added.</p>}
    </form>
  );
}
