"use client";

import { useActionState, useState } from "react";
import { setPulseArticleHeroMediaAction, clearPulseArticleHeroMediaAction, type HeroMediaState } from "../actions";
import type { MediaAsset } from "@/lib/content/types";

// Ordift Pulse — Adaptive Discovery Remediation, Part 6 (2026-09-08).
// The missing hero-media editorial control. Two source modes, matching
// Part 6/7's explicit menu of where hero media may come from:
//   - "Upload Image" — an Ordift-created/generated visual, uploaded
//     directly through the existing Sanity asset pipeline (the same
//     server-side upload proxy pattern PortfolioProjectForm.tsx
//     already uses — /api/admin/pulse/assets never exposes a write
//     token to the browser).
//   - "Embed URL" — an already-hosted, appropriately-licensed asset
//     Ordift controls the use of, matching mediaAsset's existing
//     "embed" variant (the same one Reel/video embeds already use).
// Deliberately does NOT offer "reuse the source's own photograph" as
// an option anywhere in this control — Part 7 requires that Ordift
// never automatically or semi-automatically reach for a discovered
// article's third-party image, and the cleanest way to guarantee that
// is to never surface it as a choice here at all.
function uploadHeroImage(file: File): Promise<{ assetId: string; url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/pulse/assets");
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve({ assetId: data.assetId, url: data.url });
        else reject(new Error(data.error === "file-too-large" ? "Image is too large (8MB max)." : "Upload failed."));
      } catch {
        reject(new Error("Upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export default function HeroMediaControl({ articleId, heroMedia, origin }: { articleId: string; heroMedia: MediaAsset | null; origin: string }) {
  // Original vs. Curated Publishing Model, Part D (2026-09-08) —
  // mirrors publishReadiness.ts's own isCuratedExternalDiscovery()
  // exactly (origin === "curated" only, not "community" — see that
  // file's comment for why) so this messaging never drifts out of sync
  // with the actual readiness rule it's describing.
  const heroOptional = origin === "curated";
  const [mode, setMode] = useState<"image" | "embed">("image");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedAsset, setUploadedAsset] = useState<{ assetId: string; url: string } | null>(null);
  const [alt, setAlt] = useState(heroMedia?.alt ?? "");
  const [embedUrl, setEmbedUrl] = useState(heroMedia?.type === "embed" ? (heroMedia.url ?? "") : "");

  const [setState, setFormAction, setPending] = useActionState<HeroMediaState, FormData>(setPulseArticleHeroMediaAction, null);
  const [clearState, clearFormAction, clearPending] = useActionState<HeroMediaState, FormData>(clearPulseArticleHeroMediaAction, null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadedAsset(null);
    try {
      const asset = await uploadHeroImage(file);
      setUploadedAsset(asset);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {heroMedia ? (
        <div className="flex items-start gap-4">
          {heroMedia.type === "image" && heroMedia.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of a Sanity CDN asset, not a public page image
            <img src={heroMedia.url} alt={heroMedia.alt} className="w-40 h-28 object-cover rounded-lg border border-black/10" />
          ) : (
            <div className="w-40 h-28 rounded-lg border border-black/10 bg-black/5 flex items-center justify-center px-2 text-center">
              <p className="font-sans text-caption text-ordift-ink-muted">Embed — {heroMedia.url}</p>
            </div>
          )}
          <div>
            <p className="font-sans text-body-small text-ordift-ink font-semibold">Currently set</p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{heroMedia.alt}</p>
            <form action={clearFormAction} className="mt-2">
              <input type="hidden" name="articleId" value={articleId} />
              <button type="submit" disabled={clearPending} className="font-sans text-caption text-red-700 hover:underline disabled:opacity-60">
                {clearPending ? "Clearing…" : "Clear hero media"}
              </button>
            </form>
            {clearState?.ok === false && <p className="mt-1 font-sans text-caption text-red-700">{clearState.error}</p>}
          </div>
        </div>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted italic">
          {heroOptional
            ? "Not set — optional for curated discovery content. Without one, this publishes as a discovery brief (title, context, and a prominent link to the original article) rather than a conventional article page."
            : "Not set — required before this article can be published."}
        </p>
      )}

      <div className="border-t border-black/10 pt-4">
        <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted mb-2">{heroMedia ? "Replace hero media" : "Set hero media"}</p>

        <div className="flex gap-1 mb-3" role="tablist" aria-label="Hero media source">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "image"}
            onClick={() => setMode("image")}
            className={`px-3 py-1.5 rounded-md font-sans text-caption font-semibold ${mode === "image" ? "bg-ordift-navy-950 text-white" : "border border-black/15 text-ordift-ink"}`}
          >
            Upload Image
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "embed"}
            onClick={() => setMode("embed")}
            className={`px-3 py-1.5 rounded-md font-sans text-caption font-semibold ${mode === "embed" ? "bg-ordift-navy-950 text-white" : "border border-black/15 text-ordift-ink"}`}
          >
            Embed URL
          </button>
        </div>

        <form action={setFormAction} className="space-y-3">
          <input type="hidden" name="articleId" value={articleId} />
          <input type="hidden" name="mediaType" value={mode} />

          {mode === "image" ? (
            <div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} className="font-sans text-body-small" />
              {uploading && <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Uploading…</p>}
              {uploadError && <p className="mt-1 font-sans text-caption text-red-700">{uploadError}</p>}
              {uploadedAsset && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- transient upload preview, not a public page image */}
                  <img src={uploadedAsset.url} alt="" className="w-20 h-14 object-cover rounded-md border border-black/10" />
                  <span className="font-sans text-caption text-green-700">Ready to save</span>
                </div>
              )}
              <input type="hidden" name="assetId" value={uploadedAsset?.assetId ?? ""} />
            </div>
          ) : (
            <input
              type="url"
              name="embedUrl"
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink"
            />
          )}

          <input
            type="text"
            name="alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Alt text (required)"
            required
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink"
          />

          <button
            type="submit"
            disabled={setPending || (mode === "image" && !uploadedAsset)}
            className="min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
          >
            {setPending ? "Saving…" : heroMedia ? "Replace Hero Media" : "Set Hero Media"}
          </button>
          {setState?.ok === false && <p className="font-sans text-caption text-red-700">{setState.error}</p>}
          {!setPending && setState?.ok === true && <p className="font-sans text-caption text-green-700">Saved.</p>}
        </form>
      </div>
    </div>
  );
}
