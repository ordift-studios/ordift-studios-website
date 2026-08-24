"use client";

import { useRef, useState, useTransition } from "react";
import FocalPointEditor from "@/components/admin/FocalPointEditor";
import { compressImageFile } from "@/lib/media/clientImageCompress";
import { updateAvatarFocalPointAction } from "./actions";

// Portrait upload + focal-point positioning for one team member. Reuses
// the exact drag-to-reposition FocalPointEditor already built for
// Sanity images (Work Landing Images, Portfolio Cover) — same 0-100
// coordinate contract, just wired to profiles.avatar_focal_x/y via a
// server action instead of a Sanity hotspot field. previewAspectRatio
// is 1 (square) here; the public carousel applies the circular mask —
// this editor doesn't need to render a literal circle to be accurate.
export default function PortraitEditor({
  profileId,
  initialUrl,
  initialFocalX,
  initialFocalY,
}: {
  profileId: string;
  initialUrl: string | null;
  initialFocalX: number;
  initialFocalY: number;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("profileId", profileId);
      const res = await fetch("/api/admin/team/portrait", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error === "file-too-large" ? "File is too large." : "Upload failed.");
      setUrl(data.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {url ? (
        <FocalPointEditor
          key={url}
          imageUrl={url}
          previewAspectRatio={1}
          initialFocalX={initialFocalX}
          initialFocalY={initialFocalY}
          onChange={(x, y) => startTransition(() => updateAvatarFocalPointAction(profileId, x, y))}
        />
      ) : (
        <div className="w-full max-w-[420px] aspect-square rounded-lg border-2 border-dashed border-ordift-ink/20 bg-black/5 flex items-center justify-center">
          <span className="font-sans text-body-small text-ordift-ink-muted">No portrait yet</span>
        </div>
      )}
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-full border border-ordift-ink/30 text-ordift-ink font-sans text-button font-semibold px-6 py-2.5 hover:border-ordift-ink/60 transition-colors disabled:opacity-50"
      >
        {uploading ? "Uploading…" : url ? "Replace Portrait" : "Upload Portrait"}
      </button>
    </div>
  );
}
