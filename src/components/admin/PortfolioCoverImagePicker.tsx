"use client";

import { useState } from "react";
import Image from "next/image";
import { getProjectOwnImagesForCoverPickerAction, saveCoverImageAction } from "@/app/admin/portfolio/actions";
import type { PickableProjectImage, ProjectPickableImages } from "@/lib/content/sanity/homepageSlideshowAdmin";

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
type Mode = "closed" | "menu" | "portfolio";

function defaultCoverAlt(projectTitle: string): string {
  return `${projectTitle} — Ordift Studios`;
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", "cover_image");
  const res = await fetch("/api/admin/portfolio/presentation-images/assets", { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
  return { assetId: json.assetId as string, url: json.url as string };
}

export default function PortfolioCoverImagePicker({
  projectId,
  projectTitle,
  fallbackUrl,
  fallbackAlt,
  initialUrl,
  initialAlt,
}: {
  projectId: string;
  projectTitle: string;
  fallbackUrl: string | null;
  fallbackAlt: string;
  initialUrl: string | null;
  initialAlt: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [alt, setAlt] = useState(initialAlt ?? "");
  const [mode, setMode] = useState<Mode>("closed");
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

  async function persist(image: { assetId: string; alt: string } | null, nextUrl: string | null, nextAlt: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await saveCoverImageAction(projectId, image);
      if (!result.ok) throw new Error(result.error);
      setUrl(nextUrl);
      setAlt(nextAlt);
      setSaved(true);
      setMode("closed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function selectPickedImage(image: PickableProjectImage) {
    const nextAlt = image.alt || defaultCoverAlt(projectTitle);
    persist({ assetId: image.assetId, alt: nextAlt }, image.url, nextAlt);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { assetId, url: uploadedUrl } = await uploadImage(file);
      const nextAlt = defaultCoverAlt(projectTitle);
      await persist({ assetId, alt: nextAlt }, uploadedUrl, nextAlt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    persist(null, null, "");
  }

  const displayUrl = url ?? fallbackUrl;
  const displayAlt = url ? alt : fallbackAlt;

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
          <Image src={displayUrl} alt={displayAlt || ""} fill sizes="320px" className="object-cover" />
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

      {saved && mode === "closed" && <p className="text-caption text-green-700">Saved.</p>}
      {error && <p className="text-caption text-red-700">{error}</p>}
    </div>
  );
}
