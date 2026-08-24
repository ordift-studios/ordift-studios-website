"use client";

import { useState } from "react";
import Image from "next/image";
import { getProjectImagesForAboutVisualsPickerAction, saveHomepageAboutImageAction } from "./actions";
import type { PickableProjectImage, ProjectPickableImages, PortfolioProjectRefOption } from "@/lib/content/sanity/homepageSlideshowAdmin";
import type { HomepageAboutImageAdmin, HomepageAboutImageField } from "@/lib/content/sanity/homepageAboutVisualsAdmin";
import FocalPointEditor from "@/components/admin/FocalPointEditor";
import { compressImageFile } from "@/lib/media/clientImageCompress";

// Homepage About Visuals manager (2026-08-24) — same "tap to open
// Choose from Portfolio / Upload from Device" interaction as Work
// Landing Images (WorkLandingImagesManagerForm.tsx), independently
// implemented rather than sharing that component so neither feature
// can regress the other (same reasoning as
// canManagePortfolioPresentation's own doc comment). Fixed two rows
// (Mission/Vision) on the single `homepage` document rather than one
// row per Service.
type Mode = "closed" | "menu" | "portfolio" | "reposition";

// The public bands render at roughly 4:5 on mobile up to a wide
// letterboxed band on desktop — this sits in between as a reasonable
// single preview ratio for positioning either.
const PREVIEW_ASPECT_RATIO = 1.2;

type PendingImage = { assetId: string; url: string; alt: string; focalX: number; focalY: number };

type RowState = {
  fieldKey: HomepageAboutImageField;
  label: string;
  assetId: string | null;
  url: string | null;
  alt: string;
  focalX: number;
  focalY: number;
  mode: Mode;
  pending: PendingImage | null;
  pickerProjectId: string;
  images: ProjectPickableImages | null;
  loadingImages: boolean;
  uploading: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

function defaultAlt(label: string): string {
  return `${label} — Ordift Studios`;
}

async function uploadImage(file: File) {
  const compressed = file.type.startsWith("image/") ? await compressImageFile(file) : file;
  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("role", "homepage_about_visual");

  const res = await fetch("/api/admin/portfolio/presentation-images/assets", { method: "POST", body: formData });
  const json: { ok: boolean; error?: string; assetId?: string; url?: string } = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `Upload failed (status ${res.status})`);
  if (!json.assetId || !json.url) throw new Error("Upload response was missing assetId/url");
  return { assetId: json.assetId, url: json.url };
}

export default function HomepageAboutVisualsManagerForm({
  initialImages,
  projectOptions,
}: {
  initialImages: HomepageAboutImageAdmin[];
  projectOptions: PortfolioProjectRefOption[];
}) {
  const [rows, setRows] = useState<RowState[]>(
    initialImages.map((img) => ({
      fieldKey: img.fieldKey,
      label: img.label,
      assetId: img.assetId ?? null,
      url: img.url,
      alt: img.alt ?? "",
      focalX: img.focalX ?? 50,
      focalY: img.focalY ?? 50,
      mode: "closed",
      pending: null,
      pickerProjectId: "",
      images: null,
      loadingImages: false,
      uploading: false,
      saving: false,
      saved: false,
      error: null,
    }))
  );

  function patchRow(fieldKey: HomepageAboutImageField, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.fieldKey === fieldKey ? { ...r, ...patch } : r)));
  }

  function toggleMenu(fieldKey: HomepageAboutImageField) {
    setRows((prev) =>
      prev.map((r) => (r.fieldKey === fieldKey ? { ...r, mode: r.mode === "closed" ? "menu" : "closed", error: null, saved: false } : r))
    );
  }

  function openReposition(row: RowState) {
    if (!row.assetId || !row.url) return;
    patchRow(row.fieldKey, { pending: { assetId: row.assetId, url: row.url, alt: row.alt, focalX: row.focalX, focalY: row.focalY }, mode: "reposition" });
  }

  async function loadPickerProjectImages(fieldKey: HomepageAboutImageField, projectId: string) {
    patchRow(fieldKey, { pickerProjectId: projectId, images: null });
    if (!projectId) return;
    patchRow(fieldKey, { loadingImages: true });
    try {
      const images = await getProjectImagesForAboutVisualsPickerAction(projectId);
      patchRow(fieldKey, { images, loadingImages: false });
    } catch (err) {
      patchRow(fieldKey, { loadingImages: false, error: err instanceof Error ? err.message : "Could not load images" });
    }
  }

  function selectPickedImage(row: RowState, image: PickableProjectImage) {
    const alt = image.alt || defaultAlt(row.label);
    patchRow(row.fieldKey, { pending: { assetId: image.assetId, url: image.url, alt, focalX: 50, focalY: 50 }, mode: "reposition" });
  }

  async function handleUpload(row: RowState, file: File) {
    patchRow(row.fieldKey, { uploading: true, error: null });
    try {
      const { assetId, url } = await uploadImage(file);
      patchRow(row.fieldKey, { pending: { assetId, url, alt: defaultAlt(row.label), focalX: 50, focalY: 50 }, mode: "reposition" });
    } catch (err) {
      patchRow(row.fieldKey, { error: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      patchRow(row.fieldKey, { uploading: false });
    }
  }

  async function handleSavePosition(row: RowState) {
    if (!row.pending) return;
    patchRow(row.fieldKey, { saving: true, error: null });
    try {
      const result = await saveHomepageAboutImageAction(row.fieldKey, row.label, {
        assetId: row.pending.assetId,
        alt: row.pending.alt,
        focalX: row.pending.focalX,
        focalY: row.pending.focalY,
      });
      if (!result.ok) throw new Error(result.error);
      patchRow(row.fieldKey, {
        assetId: row.pending.assetId,
        url: row.pending.url,
        alt: row.pending.alt,
        focalX: row.pending.focalX,
        focalY: row.pending.focalY,
        saving: false,
        saved: true,
        mode: "closed",
        pending: null,
      });
    } catch (err) {
      patchRow(row.fieldKey, { saving: false, error: err instanceof Error ? err.message : "Save failed" });
    }
  }

  async function handleRemove(row: RowState) {
    patchRow(row.fieldKey, { saving: true, error: null });
    try {
      const result = await saveHomepageAboutImageAction(row.fieldKey, row.label, null);
      if (!result.ok) throw new Error(result.error);
      patchRow(row.fieldKey, { assetId: null, url: null, alt: "", focalX: 50, focalY: 50, saving: false, saved: true, mode: "closed" });
    } catch (err) {
      patchRow(row.fieldKey, { saving: false, error: err instanceof Error ? err.message : "Save failed" });
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl">
      {rows.map((row) => (
        <div key={row.fieldKey} className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <p className="font-sans font-semibold text-body-small text-ordift-ink">{row.label}</p>

          <button
            type="button"
            onClick={() => toggleMenu(row.fieldKey)}
            className={`relative w-full aspect-[4/5] rounded-lg overflow-hidden bg-ordift-navy-950 border touch-manipulation ${
              row.mode !== "closed" ? "border-ordift-gold border-2" : "border-black/10 hover:border-black/25"
            }`}
          >
            {row.url ? (
              <Image
                src={row.url}
                alt=""
                fill
                sizes="320px"
                className="object-cover"
                style={{ objectPosition: `${row.focalX}% ${row.focalY}%` }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-white/60 px-3 text-center">
                <span>No image — clean solid-color fallback shows publicly</span>
                <span className="text-ordift-gold font-semibold">Tap to add</span>
              </div>
            )}
            {row.url && row.mode === "closed" && (
              <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-caption text-center py-1">
                Tap to change
              </div>
            )}
          </button>

          {row.mode === "menu" && (
            <div className="rounded-lg border border-black/15 bg-white p-3 space-y-2">
              <button
                type="button"
                onClick={() => patchRow(row.fieldKey, { mode: "portfolio" })}
                className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 hover:border-black/30"
              >
                Choose from Portfolio
              </button>
              <label className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 flex items-center justify-center cursor-pointer hover:border-black/30">
                {row.uploading ? "Uploading…" : "Upload from Device"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={row.uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(row, file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              {row.url && (
                <button
                  type="button"
                  onClick={() => openReposition(row)}
                  className="w-full min-h-11 rounded-md border border-black/15 text-body-small font-sans px-3 hover:border-black/30"
                >
                  Reposition
                </button>
              )}
              {row.url && (
                <button
                  type="button"
                  onClick={() => handleRemove(row)}
                  disabled={row.saving}
                  className="w-full min-h-9 text-caption text-red-700 underline underline-offset-4"
                >
                  Remove (use solid-colour fallback)
                </button>
              )}
              <button type="button" onClick={() => toggleMenu(row.fieldKey)} className="w-full min-h-9 text-caption text-ordift-ink-muted underline">
                Cancel
              </button>
            </div>
          )}

          {row.mode === "portfolio" && (
            <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
              <select
                value={row.pickerProjectId}
                onChange={(e) => loadPickerProjectImages(row.fieldKey, e.target.value)}
                className="w-full min-h-10 rounded border border-black/15 px-3 text-body-small"
              >
                <option value="">— Select a project —</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>

              {row.loadingImages && <p className="text-caption text-ordift-ink-muted">Loading images…</p>}

              {row.images && !row.loadingImages && (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {[...(row.images.hero ? [row.images.hero] : []), ...row.images.gallery].map((img) => (
                    <button
                      key={img.assetId}
                      type="button"
                      onClick={() => selectPickedImage(row, img)}
                      className="relative w-16 h-16 rounded overflow-hidden border border-black/10 hover:border-ordift-gold touch-manipulation"
                    >
                      <Image src={img.url} alt={img.alt ?? ""} fill sizes="64px" className="object-cover" />
                    </button>
                  ))}
                  {row.images.hero === null && row.images.gallery.length === 0 && (
                    <p className="text-caption text-ordift-ink-muted">This project has no usable images yet.</p>
                  )}
                </div>
              )}

              <button type="button" onClick={() => patchRow(row.fieldKey, { mode: "menu" })} className="text-caption text-ordift-ink-muted underline">
                Back
              </button>
            </div>
          )}

          {row.mode === "reposition" && row.pending && (
            <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
              <p className="font-sans text-caption text-ordift-ink-muted">
                Preview approximates the live band on the Homepage About Preview.
              </p>
              <FocalPointEditor
                key={row.pending.assetId}
                imageUrl={row.pending.url}
                previewAspectRatio={PREVIEW_ASPECT_RATIO}
                initialFocalX={row.pending.focalX}
                initialFocalY={row.pending.focalY}
                onChange={(x, y) =>
                  patchRow(row.fieldKey, { pending: row.pending ? { ...row.pending, focalX: x, focalY: y } : row.pending })
                }
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSavePosition(row)}
                  disabled={row.saving}
                  className="min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-50"
                >
                  {row.saving ? "Saving…" : "Save Position"}
                </button>
                <button
                  type="button"
                  onClick={() => patchRow(row.fieldKey, { mode: "closed", pending: null })}
                  className="text-caption text-ordift-ink-muted underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {row.saved && row.mode === "closed" && <p className="text-caption text-green-700">Saved.</p>}
          {row.error && <p className="text-caption text-red-700">{row.error}</p>}
        </div>
      ))}
    </div>
  );
}
