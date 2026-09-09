"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestTalentMediaUploadAction, replaceTalentMediaAssetAction, removeTalentMediaAssetAction } from "../actions";
import { createClient } from "@/lib/supabase/client";
import { TALENT_MEDIA_TYPES } from "@/lib/talent/talentMediaCatalogue";

const TALENT_MEDIA_BUCKET = "talent-media";

type Mode = "idle" | "confirmRemove" | "removing" | "replacing" | "uploading";

// Talent Media Remove + Replace (2026-09-09) — per-item controls,
// rendered beneath each card in TalentMediaGallery.tsx (which stays a
// plain server component; only this one interactive piece needs to be
// a client component). Same manual-async-flow reasoning as
// TalentMediaUpload.tsx for Replace (a real browser-side Storage PUT
// has to happen between two server calls); Remove is a single server
// call, but still needs client state for its own required confirmation
// step before that call ever fires.
export function TalentMediaItemControls({
  assetId,
  profileId,
  mediaType,
  caption,
}: {
  assetId: string;
  profileId: string;
  mediaType: string;
  caption: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaTypeRef = useRef<HTMLSelectElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  async function handleConfirmRemove() {
    setError(null);
    setMode("removing");
    const result = await removeTalentMediaAssetAction({ assetId, profileId });
    if (!result.ok) {
      setError(result.error);
      setMode("confirmRemove");
      return;
    }
    router.refresh();
    // No further local state to reset — this card is about to
    // disappear entirely once the server re-render lands.
  }

  async function handleReplaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    const newMediaType = mediaTypeRef.current?.value ?? mediaType;
    const newCaption = captionRef.current?.value.trim() || null;
    if (!file) {
      setError("Choose a replacement file.");
      return;
    }

    setMode("uploading");

    // Steps A-D (select Replace, pick file, existing bucket
    // validation, signed-upload authorization) — the exact same
    // request used for a brand-new upload; a replacement is just a
    // fresh path under the same profile, nothing special about it at
    // this stage.
    const authorization = await requestTalentMediaUploadAction({ profileId, originalFilename: file.name });
    if (!authorization.ok) {
      setError(authorization.error);
      setMode("replacing");
      return;
    }

    // Step E-F: upload the new object and let it fully succeed before
    // touching the existing record at all. If anything above or here
    // fails, the original media is completely untouched — nothing
    // irreversible has happened yet.
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(TALENT_MEDIA_BUCKET)
      .uploadToSignedUrl(authorization.path, authorization.token, file, { contentType: file.type });
    if (uploadError) {
      setError("Upload failed. The existing media was not changed. Please try again.");
      setMode("replacing");
      return;
    }

    // Step G: only now does the existing record change, and only
    // after the new file is confirmed uploaded.
    const replaced = await replaceTalentMediaAssetAction({
      assetId,
      profileId,
      newStoragePath: authorization.path,
      mediaType: newMediaType,
      caption: newCaption ?? caption,
    });
    if (!replaced.ok) {
      setError(replaced.error);
      setMode("replacing");
      return;
    }

    setMode("idle");
    router.refresh();
  }

  if (mode === "confirmRemove" || mode === "removing") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-2 space-y-2">
        <p className="font-sans text-caption text-red-700">
          Remove this {mediaType.replace("_", " ")}? The private Talent Media asset will be permanently deleted.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmRemove}
            disabled={mode === "removing"}
            aria-busy={mode === "removing"}
            className="rounded-md bg-red-700 text-white px-3 py-1 font-sans text-caption font-semibold disabled:opacity-60"
          >
            {mode === "removing" ? "Removing…" : "Confirm remove"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={mode === "removing"}
            className="rounded-md border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      </div>
    );
  }

  if (mode === "replacing" || mode === "uploading") {
    const uploading = mode === "uploading";
    return (
      <form onSubmit={handleReplaceSubmit} className="rounded-md border border-black/10 bg-black/5 p-2 space-y-2">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={uploading} className="font-sans text-caption text-ordift-ink disabled:opacity-60" />
        <select ref={mediaTypeRef} defaultValue={mediaType} disabled={uploading} className="w-full rounded-md border border-black/15 px-2 py-1 font-sans text-caption bg-white disabled:opacity-60">
          {TALENT_MEDIA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          ref={captionRef}
          type="text"
          defaultValue={caption ?? ""}
          placeholder="Caption"
          disabled={uploading}
          className="w-full rounded-md border border-black/15 px-2 py-1 font-sans text-caption bg-white disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={uploading} aria-busy={uploading} className="rounded-md bg-ordift-navy-950 text-white px-3 py-1 font-sans text-caption font-semibold disabled:opacity-60">
            {uploading ? "Uploading…" : "Upload replacement"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            disabled={uploading}
            className="rounded-md border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setMode("replacing")} className="font-sans text-caption underline text-ordift-ink-muted hover:text-ordift-ink">
        Replace
      </button>
      <button type="button" onClick={() => setMode("confirmRemove")} className="font-sans text-caption underline text-red-700 hover:text-red-800">
        Remove
      </button>
    </div>
  );
}
