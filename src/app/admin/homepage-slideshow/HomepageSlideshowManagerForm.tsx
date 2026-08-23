"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { saveHomepageSlideshowSlidesAction } from "./actions";
import type { AdminSlideshowSlide, PortfolioProjectRefOption } from "@/lib/content/sanity/homepageSlideshowAdmin";

type SlideDraft = {
  projectId: string | null;
  landscapeAssetId: string | null;
  landscapeUrl: string | null;
  landscapeAlt: string;
  portraitAssetId: string | null;
  portraitUrl: string | null;
  portraitAlt: string;
  enabled: boolean;
};

function toDraft(s: AdminSlideshowSlide): SlideDraft {
  return {
    projectId: s.projectId,
    landscapeAssetId: s.landscapeAssetId,
    landscapeUrl: s.landscapeUrl,
    landscapeAlt: s.landscapeAlt ?? "",
    portraitAssetId: s.portraitAssetId,
    portraitUrl: s.portraitUrl,
    portraitAlt: s.portraitAlt ?? "",
    enabled: s.enabled,
  };
}

function emptyDraft(): SlideDraft {
  return {
    projectId: null,
    landscapeAssetId: null,
    landscapeUrl: null,
    landscapeAlt: "",
    portraitAssetId: null,
    portraitUrl: null,
    portraitAlt: "",
    enabled: true,
  };
}

// Simple, dependency-free reordering — no drag-and-drop library added
// for this ("do not over-engineer this into a full page builder"). Up/
// down buttons are the established pattern this codebase already uses
// where ordering matters without a new dependency.
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

async function uploadImage(file: File, orientation: "landscape" | "portrait") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("orientation", orientation);
  const res = await fetch("/api/admin/homepage-slideshow/assets", { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
  return { assetId: json.assetId as string, url: json.url as string };
}

export default function HomepageSlideshowManagerForm({
  homepageId,
  initialSlides,
  projectOptions,
}: {
  homepageId: string;
  initialSlides: AdminSlideshowSlide[];
  projectOptions: PortfolioProjectRefOption[];
}) {
  const [slides, setSlides] = useState<SlideDraft[]>(initialSlides.map(toDraft));
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateSlide(i: number, patch: Partial<SlideDraft>) {
    setSlides((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  async function handleUpload(i: number, orientation: "landscape" | "portrait", file: File) {
    const key = `${i}-${orientation}`;
    setUploadingKey(key);
    setError(null);
    try {
      const { assetId, url } = await uploadImage(file, orientation);
      if (orientation === "landscape") {
        updateSlide(i, { landscapeAssetId: assetId, landscapeUrl: url });
      } else {
        updateSlide(i, { portraitAssetId: assetId, portraitUrl: url });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  }

  function handleSave() {
    setError(null);
    // Alt text is required by assistive tech whenever its image exists —
    // enforced here so a slide can never be saved with an image but no
    // accessible name, same rule the Sanity schema itself enforces in
    // Studio.
    for (const s of slides) {
      if (s.landscapeAssetId && !s.landscapeAlt.trim()) {
        setError("Every slide with a Landscape image needs Landscape alt text.");
        return;
      }
      if (s.portraitAssetId && !s.portraitAlt.trim()) {
        setError("Every slide with a Portrait image needs Portrait alt text.");
        return;
      }
    }

    startTransition(async () => {
      try {
        await saveHomepageSlideshowSlidesAction(
          homepageId,
          slides.map((s) => ({
            projectId: s.projectId,
            landscapeAssetId: s.landscapeAssetId,
            landscapeAlt: s.landscapeAlt,
            portraitAssetId: s.portraitAssetId,
            portraitAlt: s.portraitAlt,
            enabled: s.enabled,
          })),
        );
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {slides.map((slide, i) => (
          <div key={i} className="rounded-xl border border-black/10 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-sans font-semibold text-body-small text-ordift-ink">Slide {i + 1}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => setSlides((prev) => moveItem(prev, i, i - 1))}
                  className="min-h-8 px-2 rounded border border-black/15 text-caption disabled:opacity-30"
                >
                  &uarr; Move up
                </button>
                <button
                  type="button"
                  disabled={i === slides.length - 1}
                  onClick={() => setSlides((prev) => moveItem(prev, i, i + 1))}
                  className="min-h-8 px-2 rounded border border-black/15 text-caption disabled:opacity-30"
                >
                  &darr; Move down
                </button>
                <label className="flex items-center gap-1.5 text-caption text-ordift-ink-muted ml-2">
                  <input
                    type="checkbox"
                    checked={slide.enabled}
                    onChange={(e) => updateSlide(i, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  onClick={() => setSlides((prev) => prev.filter((_, idx) => idx !== i))}
                  className="min-h-8 px-2 rounded border border-red-700/30 text-red-700 text-caption"
                >
                  Remove
                </button>
              </div>
            </div>

            <div>
              <label className="block text-caption text-ordift-ink-muted mb-1">Portfolio Project (optional — internal attribution only, never shown publicly)</label>
              <select
                value={slide.projectId ?? ""}
                onChange={(e) => updateSlide(i, { projectId: e.target.value || null })}
                className="w-full min-h-10 rounded border border-black/15 px-3 text-body-small"
              >
                <option value="">— No linked project —</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {(["landscape", "portrait"] as const).map((orientation) => {
                const url = orientation === "landscape" ? slide.landscapeUrl : slide.portraitUrl;
                const alt = orientation === "landscape" ? slide.landscapeAlt : slide.portraitAlt;
                const key = `${i}-${orientation}`;
                return (
                  <div key={orientation} className="space-y-2">
                    <p className="font-sans font-semibold uppercase tracking-[0.1em] text-caption text-ordift-gold-pressed">
                      {orientation}
                    </p>
                    <div
                      className={`relative rounded-lg overflow-hidden bg-ordift-offwhite border border-black/10 ${
                        orientation === "landscape" ? "aspect-video" : "aspect-[3/4] max-w-[180px]"
                      }`}
                    >
                      {url ? (
                        <Image src={url} alt={alt || ""} fill sizes="300px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-caption text-ordift-ink-muted/60">
                          No {orientation} image yet
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={uploadingKey === key}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(i, orientation, file);
                        e.target.value = "";
                      }}
                      className="text-caption"
                    />
                    {uploadingKey === key && <p className="text-caption text-ordift-ink-muted">Uploading…</p>}
                    <input
                      type="text"
                      placeholder={`${orientation === "landscape" ? "Landscape" : "Portrait"} image alt text`}
                      value={alt}
                      onChange={(e) =>
                        updateSlide(i, orientation === "landscape" ? { landscapeAlt: e.target.value } : { portraitAlt: e.target.value })
                      }
                      className="w-full min-h-9 rounded border border-black/15 px-2.5 text-body-small"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSlides((prev) => [...prev, emptyDraft()])}
        className="min-h-11 px-5 rounded-full border border-black/15 text-body-small font-sans"
      >
        + Add Slide
      </button>

      <div className="flex items-center gap-4 pt-4 border-t border-black/10">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="min-h-11 px-6 rounded-full bg-ordift-navy-950 text-white font-sans font-semibold text-body-small disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save Slideshow"}
        </button>
        {saved && <p className="text-body-small text-green-700">Saved. The live homepage now reflects these slides.</p>}
        {error && <p className="text-body-small text-red-700">{error}</p>}
      </div>
    </div>
  );
}
