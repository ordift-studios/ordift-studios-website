"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { getProjectImagesForPickerAction, saveHomepageSlideshowSlidesAction } from "./actions";
import type {
  AdminSlideshowSlide,
  PickableProjectImage,
  PortfolioProjectRefOption,
  ProjectPickableImages,
} from "@/lib/content/sanity/homepageSlideshowAdmin";

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

type Orientation = "landscape" | "portrait";

// One clickable image slot's transient UI state — which slot is open
// (`${slideIndex}-${orientation}`), which sub-view it's showing, and the
// in-progress "Choose from Portfolio" selection. Only one slot can be
// open at a time, matching the requested "tap image -> small choice"
// interaction rather than a full page-builder-style multi-panel editor.
type PickerState = {
  key: string;
  slideIndex: number;
  orientation: Orientation;
  mode: "menu" | "portfolio";
  pickerProjectId: string;
  images: ProjectPickableImages | null;
  loadingImages: boolean;
};

// Automatic alt-text fallback (2026-08-23) — the manual Landscape/
// Portrait alt text inputs were removed from this UI ("purely visual
// image-selection interface"); every image still gets a real,
// non-empty accessible name, generated rather than left blank. Mirrors
// the exact same "no CMS value yet -> honest generic description"
// pattern already used elsewhere in this codebase (e.g. the homepage
// hero's own `heroVisual.alt || "Ordift Studios signature campaign
// visual"` fallback) rather than inventing a new convention.
function defaultSlideAlt(projectTitle: string | null | undefined): string {
  return projectTitle ? `${projectTitle} — Ordift Studios` : "Ordift Studios — homepage slideshow photograph";
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
  const [picker, setPicker] = useState<PickerState | null>(null);

  function openPicker(slideIndex: number, orientation: Orientation) {
    const slide = slides[slideIndex];
    setPicker({
      key: `${slideIndex}-${orientation}`,
      slideIndex,
      orientation,
      mode: "menu",
      pickerProjectId: slide.projectId ?? "",
      images: null,
      loadingImages: false,
    });
    setError(null);
  }

  function closePicker() {
    setPicker(null);
  }

  async function loadPickerProjectImages(projectId: string) {
    if (!projectId) {
      setPicker((p) => (p ? { ...p, pickerProjectId: projectId, images: null } : p));
      return;
    }
    setPicker((p) => (p ? { ...p, pickerProjectId: projectId, loadingImages: true, images: null } : p));
    try {
      const images = await getProjectImagesForPickerAction(projectId);
      setPicker((p) => (p && p.pickerProjectId === projectId ? { ...p, images, loadingImages: false } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that project's images");
      setPicker((p) => (p ? { ...p, loadingImages: false } : p));
    }
  }

  function selectPickedImage(image: PickableProjectImage) {
    if (!picker) return;
    const linkedProjectTitle = projectOptions.find((p) => p.id === slides[picker.slideIndex]?.projectId)?.title;
    // Prefer the source image's own real Portfolio alt text; only fall
    // back to the generic default if that image genuinely has none.
    const alt = image.alt || defaultSlideAlt(linkedProjectTitle);
    const patch =
      picker.orientation === "landscape"
        ? { landscapeAssetId: image.assetId, landscapeUrl: image.url, landscapeAlt: alt }
        : { portraitAssetId: image.assetId, portraitUrl: image.url, portraitAlt: alt };
    updateSlide(picker.slideIndex, patch);
    closePicker();
  }

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
      // A freshly uploaded file has no source alt text to inherit
      // (unlike "Choose from Portfolio"), so it always gets the
      // automatic fallback — see defaultSlideAlt()'s own comment.
      const linkedProjectTitle = projectOptions.find((p) => p.id === slides[i]?.projectId)?.title;
      const alt = defaultSlideAlt(linkedProjectTitle);
      if (orientation === "landscape") {
        updateSlide(i, { landscapeAssetId: assetId, landscapeUrl: url, landscapeAlt: alt });
      } else {
        updateSlide(i, { portraitAssetId: assetId, portraitUrl: url, portraitAlt: alt });
      }
      closePicker();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  }

  function handleSave() {
    setError(null);

    startTransition(async () => {
      try {
        await saveHomepageSlideshowSlidesAction(
          homepageId,
          slides.map((s) => {
            const linkedProjectTitle = projectOptions.find((p) => p.id === s.projectId)?.title;
            return {
              projectId: s.projectId,
              landscapeAssetId: s.landscapeAssetId,
              // Alt text is auto-generated whenever an image is chosen
              // (see selectPickedImage()/handleUpload()) — there's no
              // manual field for it in this UI, so this is only a
              // defensive fallback for the rare case a value somehow
              // never got set (never leaves an image with a blank
              // accessible name, same rule Sanity's own schema enforces).
              landscapeAlt: s.landscapeAssetId ? s.landscapeAlt || defaultSlideAlt(linkedProjectTitle) : s.landscapeAlt,
              portraitAssetId: s.portraitAssetId,
              portraitAlt: s.portraitAssetId ? s.portraitAlt || defaultSlideAlt(linkedProjectTitle) : s.portraitAlt,
              enabled: s.enabled,
            };
          }),
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
                const isOpen = picker?.key === key;
                const boxSizeClass = orientation === "landscape" ? "aspect-video" : "aspect-[3/4] max-w-[180px]";
                return (
                  <div key={orientation} className="space-y-2">
                    <p className="font-sans font-semibold uppercase tracking-[0.1em] text-caption text-ordift-gold-pressed">
                      {orientation}
                    </p>

                    {/* The whole image/placeholder area is one large,
                        touch-friendly tap target (no hover dependency) —
                        tapping it (whether empty or already has an
                        image, so replacing is just as easy as adding)
                        opens the Choose from Portfolio / Upload from
                        Device menu below it. */}
                    <button
                      type="button"
                      onClick={() => (isOpen ? closePicker() : openPicker(i, orientation))}
                      className={`relative w-full rounded-lg overflow-hidden bg-ordift-offwhite border touch-manipulation ${boxSizeClass} ${
                        isOpen ? "border-ordift-gold border-2" : "border-black/10 hover:border-black/25"
                      }`}
                    >
                      {url ? (
                        <Image src={url} alt={alt || ""} fill sizes="300px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-ordift-ink-muted/70 px-3 text-center">
                          <span>No {orientation} image yet</span>
                          <span className="text-ordift-gold-pressed font-semibold">Tap to add</span>
                        </div>
                      )}
                      {url && !isOpen && (
                        <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-caption text-center py-1">
                          Tap to replace
                        </div>
                      )}
                    </button>

                    {isOpen && picker && (
                      <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
                        {picker.mode === "menu" && (
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPicker((p) => (p ? { ...p, mode: "portfolio" } : p));
                                if (picker.pickerProjectId) loadPickerProjectImages(picker.pickerProjectId);
                              }}
                              className="min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 hover:border-black/30"
                            >
                              Choose from Portfolio
                            </button>
                            <label className="min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 flex items-center justify-center cursor-pointer hover:border-black/30">
                              {uploadingKey === key ? "Uploading…" : "Upload from Device"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                disabled={uploadingKey === key}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUpload(i, orientation, file);
                                  e.target.value = "";
                                }}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={closePicker}
                              className="min-h-9 text-caption text-ordift-ink-muted underline"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {picker.mode === "portfolio" && (
                          <div className="space-y-3">
                            <select
                              value={picker.pickerProjectId}
                              onChange={(e) => loadPickerProjectImages(e.target.value)}
                              className="w-full min-h-10 rounded border border-black/15 px-3 text-body-small"
                            >
                              <option value="">— Select a project —</option>
                              {projectOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))}
                            </select>

                            {picker.loadingImages && <p className="text-caption text-ordift-ink-muted">Loading images…</p>}

                            {picker.images && !picker.loadingImages && (
                              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                                {[...(picker.images.hero ? [picker.images.hero] : []), ...picker.images.gallery].map(
                                  (img) => (
                                    <button
                                      key={img.assetId}
                                      type="button"
                                      onClick={() => selectPickedImage(img)}
                                      className="relative w-20 h-20 rounded overflow-hidden border border-black/10 hover:border-ordift-gold touch-manipulation"
                                    >
                                      <Image src={img.url} alt={img.alt ?? ""} fill sizes="80px" className="object-cover" />
                                    </button>
                                  ),
                                )}
                                {picker.images.hero === null && picker.images.gallery.length === 0 && (
                                  <p className="text-caption text-ordift-ink-muted">This project has no usable images yet.</p>
                                )}
                              </div>
                            )}

                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => setPicker((p) => (p ? { ...p, mode: "menu" } : p))}
                                className="text-caption text-ordift-ink-muted underline"
                              >
                                Back
                              </button>
                              <button type="button" onClick={closePicker} className="text-caption text-ordift-ink-muted underline">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
