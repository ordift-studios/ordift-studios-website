"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestTalentMediaUploadAction, recordTalentMediaAssetAction } from "../actions";
import { createClient } from "@/lib/supabase/client";
import { TALENT_MEDIA_TYPES } from "@/lib/talent/talentMediaCatalogue";
import { validateTalentMediaFile, describeTalentMediaUploadError } from "@/lib/talent/talentMediaUploadValidation";

const TALENT_MEDIA_BUCKET = "talent-media";

// Talent Media Upload + View (2026-09-09) — deliberately NOT a
// useActionState <form>-bound component like every other form built
// this session (AssignCategoryForm.tsx, CommercialTermsForm.tsx,
// etc.). A direct-to-Storage upload needs a real browser-side step —
// PUTting the file bytes straight to Supabase Storage — that happens
// BETWEEN two server round-trips (request authorization, then record
// the metadata), which a single form action can't express. Same
// pending/disabled/success-or-error UX principle as every other form
// here, implemented with local state and a manual async handler
// instead. File bytes never pass through the Next.js server or this
// component's own state beyond the browser's own upload — no
// service-role credential is ever present in this file; the signed
// URL/token returned by requestTalentMediaUploadAction() is the only
// thing authorizing the actual PUT.
export function TalentMediaUpload({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaTypeRef = useRef<HTMLSelectElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    const mediaType = mediaTypeRef.current?.value ?? "";
    const caption = captionRef.current?.value.trim() || null;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    // Checked before ever requesting signed-upload authorization —
    // matches the existing talent-media bucket's own 25MB/MIME-type
    // configuration exactly (not a new or changed limit), so an
    // out-of-bounds file gets an immediate, specific message instead
    // of a wasted round trip.
    const fileValidation = validateTalentMediaFile(file);
    if (!fileValidation.ok) {
      setError(fileValidation.error);
      return;
    }

    setUploading(true);

    const authorization = await requestTalentMediaUploadAction({ profileId, originalFilename: file.name });
    if (!authorization.ok) {
      setError(authorization.error);
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(TALENT_MEDIA_BUCKET)
      .uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
    if (uploadError) {
      // Safe fields only (message/status/statusCode) — never the
      // signed URL, token, or raw Storage path, none of which
      // uploadError itself carries either (confirmed by reading
      // @supabase/storage-js's own StorageError type before writing
      // this). Logged to the browser console only — this failure
      // happens directly between the browser and Supabase Storage, so
      // there is no server-side round trip to log it from instead.
      console.error("[talent] upload to storage failed", { message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode });
      setError(describeTalentMediaUploadError({ message: uploadError.message, status: uploadError.status, statusCode: uploadError.statusCode }, "upload"));
      setUploading(false);
      return;
    }

    const recorded = await recordTalentMediaAssetAction({ profileId, storagePath: authorization.path, mediaType, caption });
    if (!recorded.ok) {
      setError(recorded.error);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (captionRef.current) captionRef.current.value = "";
    // Server-rendered media list needs a fresh server round-trip to
    // pick up the new row — router.refresh() re-runs the page's data
    // fetch without a full reload or losing client-side state here.
    router.refresh();
  }

  return (
    <form onSubmit={handleUpload} className="flex items-end gap-3 flex-wrap pt-2 border-t border-black/10">
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">File</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4"
          disabled={uploading}
          className="font-sans text-body-small text-ordift-ink disabled:opacity-60"
        />
      </label>
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Type</span>
        <select
          ref={mediaTypeRef}
          defaultValue="portfolio_image"
          disabled={uploading}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60"
        >
          {TALENT_MEDIA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Caption (optional)</span>
        <input
          ref={captionRef}
          type="text"
          disabled={uploading}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60"
        />
      </label>
      <button
        type="submit"
        disabled={uploading}
        aria-busy={uploading}
        className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Upload media"}
      </button>
      {!uploading && success && <span className="font-sans text-caption text-green-700">Media uploaded successfully.</span>}
      {!uploading && error && <span className="font-sans text-caption text-red-700">{error}</span>}
    </form>
  );
}
