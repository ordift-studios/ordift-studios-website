"use client";

import { useState } from "react";
import Image from "next/image";
import { getProjectOwnImagesForCoverPickerAction, saveCoverImageAction } from "@/app/admin/portfolio/actions";
import type { PickableProjectImage, ProjectPickableImages } from "@/lib/content/sanity/homepageSlideshowAdmin";
import FocalPointEditor from "./FocalPointEditor";
import { compressImageFile } from "@/lib/media/clientImageCompress";

// Portfolio Cover / Index Image picker (2026-08-23) — a single clickable
// image slot, same "tap to open Choose from Portfolio / Upload from
// Device" interaction already approved for the Homepage Slideshow
// (HomepageSlideshowManagerForm.tsx), simplified to one image (no
// landscape/portrait pair) and scoped to this one project's own hero +
// gallery images only (no cross-project picker needed — a project's
// cover image should come from that project). No manual alt-text field,
// per the same accessibility rule established for the Homepage
// Slideshow: reuse the source image's real alt text when picked from
// Portfolio, or generate a safe non-empty fallback when freshly
// uploaded.
//
// Image Repositioning (2026-08-23) — picking a new image (from
// Portfolio or by upload) or tapping "Reposition" on an already-saved
// one opens FocalPointEditor before the final save, so the focal point
// is always chosen deliberately rather than silently defaulting.
type Mode = "closed" | "menu" | "portfolio" | "reposition";

// Representative crop-frame ratio for the reposition preview — an
// approximation of a discipline index band's typical landscape framing
// (PhotographyIndexStrip clamps each project's own real aspect ratio
// between 0.6–2.4 rather than using one fixed ratio; 16:9 sits well
// inside that range and reads as "a wide editorial band" without
// needing to replicate the per-image clamp exactly here).
const PREVIEW_ASPECT_RATIO = 16 / 9;

function defaultCoverAlt(projectTitle: string): string {
  return `${projectTitle} — Ordift Studios`;
}

// Compresses client-side before sending (2026-08-23) — Vercel's
// Serverless Functions enforce a hard ~4.5MB request body ceiling at
// the platform level; a raw device photo easily exceeds that and gets
// rejected before this route's own size check ever runs, producing a
// confusing raw browser exception instead of a clean error. Same fix,
// same reasoning as WorkLandingImagesManagerForm.tsx's uploadImage() —
// see that file's comment for the full root-cause writeup.
async function uploadImage(file: File) {
  let formData: FormData;
  try {
    const compressed = file.type.startsWith("image/") ? await compressImageFile(file) : file;
    formData = new FormData();
    formData.append("file", compressed);
    formData.append("role", "cover_image");
  } catch (err) {
    throw new Error(`[upload:compress] ${err instanceof Error ? err.message : String(err)}`);
  }

  let res: Response;
  try {
    res = await fetch("/api/admin/portfolio/presentation-images/assets", { method: "POST", body: formData });
  } catch (err) {
    throw new Error(`[upload:fetch] ${err instanceof Error ? err.message : String(err)}`);
  }

  let json: { ok: boolean; error?: string; assetId?: string; url?: string };
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`[upload:response-parse] status ${res.status} — ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok || !json.ok) throw new Error(`[upload:server] ${json.error || `Upload failed (status ${res.status})`}`);
  if (!json.assetId || !json.url) {
    throw new Error(`[upload:missing-fields] server response was missing assetId/url`);
  }
  return { assetId: json.assetId, url: json.url };
}

type PendingImage = { assetId: string; url: string; alt: string; focalX: number; focalY: number };

export default function PortfolioCoverImagePicker({
  projectId,
  projectTitle,
  fallbackUrl,
  fallbackAlt,
  initialAssetId,
  initialUrl,
  initialAlt,
  initialFocalX,
  initialFocalY,
}: {
  projectId: string;
  projectTitle: string;
  fallbackUrl: string | null;
  fallbackAlt: string;
  initialAssetId: string | null;
  initialUrl: string | null;
  initialAlt: string | null;
  initialFocalX: number | null;
  initialFocalY: number | null;
}) {
  const [assetId, setAssetId] = useState(initialAssetId);
  const [url, setUrl] = useState(initialUrl);
  const [alt, setAlt] = useState(initialAlt ?? "");
  const [focalX, setFocalX] = useState(initialFocalX ?? 50);
  const [focalY, setFocalY] = useState(initialFocalY ?? 50);
  const [mode, setMode] = useState<Mode>("closed");
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [images, setImages] = useState<ProjectPickableImages | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function openMenu() {
    setMode((m) => (m === "closed" ? "menu" : "closed"));
    setError(null);
    setSaved(false);
  }

  async function openPortfolioBrowser() {
    setMode("portfolio");
    if (!images) {
      setLoadingImages(true);
      try {
        const result = await getProjectOwnImagesForCoverPickerAction(projectId);
        setImages(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this project's images");
      } finally {
        setLoadingImages(false);
      }
    }
  }

  function openReposition() {
    if (!assetId || !url) return;
    setPending({ assetId, url, alt, focalX, focalY });
    setMode("reposition");
  }

  function selectPickedImage(image: PickableProjectImage) {
    const nextAlt = image.alt || defaultCoverAlt(projectTitle);
    setPending({ assetId: image.assetId, url: image.url, alt: nextAlt, focalX: 50, focalY: 50 });
    setMode("reposition");
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { assetId: newAssetId, url: uploadedUrl } = await uploadImage(file);
      setPending({ assetId: newAssetId, url: uploadedUrl, alt: defaultCoverAlt(projectTitle), focalX: 50, focalY: 50 });
      setMode("reposition");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSavePosition() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveCoverImageAction(projectId, {
        assetId: pending.assetId,
        alt: pending.alt,
        focalX: pending.focalX,
        focalY: pending.focalY,
      });
      if (!result.ok) throw new Error(result.error);
      setAssetId(pending.assetId);
      setUrl(pending.url);
      setAlt(pending.alt);
      setFocalX(pending.focalX);
      setFocalY(pending.focalY);
      setSaved(true);
      setMode("closed");
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      const result = await saveCoverImageAction(projectId, null);
      if (!result.ok) throw new Error(result.error);
      setAssetId(null);
      setUrl(null);
      setAlt("");
      setFocalX(50);
      setFocalY(50);
      setSaved(true);
      setMode("closed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const displayUrl = url ?? fallbackUrl;
  const displayAlt = url ? alt : fallbackAlt;
  const displayFocal = url ? { x: focalX, y: focalY } : { x: 50, y: 50 };

  return (
    <div className="space-y-2 max-w-xs">
      <button
        type="button"
        onClick={openMenu}
        className={`relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-ordift-offwhite border touch-manipulation ${
          mode !== "closed" ? "border-ordift-gold border-2" : "border-black/10 hover:border-black/25"
        }`}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={displayAlt || ""}
            fill
            sizes="320px"
            className="object-cover"
            style={{ objectPosition: `${displayFocal.x}% ${displayFocal.y}%` }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-ordift-ink-muted/70 px-3 text-center">
            <span>No image yet</span>
            <span className="text-ordift-gold-pressed font-semibold">Tap to add</span>
          </div>
        )}
        {displayUrl && mode === "closed" && (
          <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-caption text-center py-1">
            Tap to change
          </div>
        )}
        {!url && fallbackUrl && (
          <div className="absolute top-1 left-1 bg-black/50 text-white text-caption px-2 py-0.5 rounded">
            Using Hero Media (fallback)
          </div>
        )}
      </button>

      {mode === "menu" && (
        <div className="rounded-lg border border-black/15 bg-white p-3 space-y-2">
          <button
            type="button"
            onClick={openPortfolioBrowser}
            className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 hover:border-black/30"
          >
            Choose from this Project&apos;s Images
          </button>
          <label className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 flex items-center justify-center cursor-pointer hover:border-black/30">
            {uploading ? "Uploading…" : "Upload from Device"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={openReposition}
              className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 hover:border-black/30"
            >
              Reposition
            </button>
          )}
          {url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="w-full min-h-9 text-caption text-red-700 underline underline-offset-4"
            >
              Remove (use Hero Media instead)
            </button>
          )}
          <button type="button" onClick={() => setMode("closed")} className="w-full min-h-9 text-caption text-ordift-ink-muted underline">
            Cancel
          </button>
        </div>
      )}

      {mode === "portfolio" && (
        <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
          {loadingImages && <p className="text-caption text-ordift-ink-muted">Loading images…</p>}
          {images && !loadingImages && (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {[...(images.hero ? [images.hero] : []), ...images.gallery].map((img) => (
                <button
                  key={img.assetId}
                  type="button"
                  onClick={() => selectPickedImage(img)}
                  className="relative w-20 h-20 rounded overflow-hidden border border-black/10 hover:border-ordift-gold touch-manipulation"
                >
                  <Image src={img.url} alt={img.alt ?? ""} fill sizes="80px" className="object-cover" />
                </button>
              ))}
              {images.hero === null && images.gallery.length === 0 && (
                <p className="text-caption text-ordift-ink-muted">This project has no usable images yet.</p>
              )}
            </div>
          )}
          <button type="button" onClick={() => setMode("menu")} className="text-caption text-ordift-ink-muted underline">
            Back
          </button>
        </div>
      )}

      {mode === "reposition" && pending && (
        <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
          <p className="font-sans text-caption text-ordift-ink-muted">
            Preview approximates the live crop on the discipline index page.
          </p>
          <FocalPointEditor
            key={pending.assetId}
            imageUrl={pending.url}
            previewAspectRatio={PREVIEW_ASPECT_RATIO}
            initialFocalX={pending.focalX}
            initialFocalY={pending.focalY}
            onChange={(x, y) => setPending((p) => (p ? { ...p, focalX: x, focalY: y } : p))}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSavePosition}
              disabled={saving}
              className="min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Position"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setMode("closed");
              }}
              className="text-caption text-ordift-ink-muted underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && mode === "closed" && <p className="text-caption text-green-700">Saved.</p>}
      {error && <p className="text-caption text-red-700">{error}</p>}
    </div>
  );
}
