"use client";

import { useState } from "react";
import Image from "next/image";
import { getProjectImagesForWorkLandingPickerAction, saveWorkLandingImageAction } from "./actions";
import type { PickableProjectImage, ProjectPickableImages, PortfolioProjectRefOption } from "@/lib/content/sanity/homepageSlideshowAdmin";
import type { WorkLandingImageAdmin } from "@/lib/content/sanity/workLandingImagesAdmin";

// Work Landing Images manager (2026-08-23) — one image per discipline
// for its band on /work (WorkDisciplineBands). Same "tap to open Choose
// from Portfolio / Upload from Device" interaction as the Homepage
// Slideshow and the Portfolio Cover Image picker, saved independently
// per discipline (no whole-array replace — each Service document holds
// its own single image field).
type Mode = "closed" | "menu" | "portfolio";

type RowState = {
  serviceId: string;
  discipline: string;
  name: string;
  url: string | null;
  mode: Mode;
  pickerProjectId: string;
  images: ProjectPickableImages | null;
  loadingImages: boolean;
  uploading: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

function defaultAlt(name: string): string {
  return `${name} — Ordift Studios`;
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", "work_landing_image");
  const res = await fetch("/api/admin/portfolio/presentation-images/assets", { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
  return { assetId: json.assetId as string, url: json.url as string };
}

export default function WorkLandingImagesManagerForm({
  initialImages,
  projectOptions,
}: {
  initialImages: WorkLandingImageAdmin[];
  projectOptions: PortfolioProjectRefOption[];
}) {
  const [rows, setRows] = useState<RowState[]>(
    initialImages.map((img) => ({
      serviceId: img.serviceId,
      discipline: img.discipline,
      name: img.name,
      url: img.url,
      mode: "closed",
      pickerProjectId: "",
      images: null,
      loadingImages: false,
      uploading: false,
      saving: false,
      saved: false,
      error: null,
    }))
  );

  function patchRow(serviceId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, ...patch } : r)));
  }

  function toggleMenu(serviceId: string) {
    setRows((prev) =>
      prev.map((r) => (r.serviceId === serviceId ? { ...r, mode: r.mode === "closed" ? "menu" : "closed", error: null, saved: false } : r))
    );
  }

  async function openPortfolioBrowser(serviceId: string) {
    patchRow(serviceId, { mode: "portfolio" });
  }

  async function loadPickerProjectImages(serviceId: string, projectId: string) {
    patchRow(serviceId, { pickerProjectId: projectId, images: null });
    if (!projectId) return;
    patchRow(serviceId, { loadingImages: true });
    try {
      const images = await getProjectImagesForWorkLandingPickerAction(projectId);
      patchRow(serviceId, { images, loadingImages: false });
    } catch (err) {
      patchRow(serviceId, { loadingImages: false, error: err instanceof Error ? err.message : "Could not load images" });
    }
  }

  async function persist(row: RowState, image: { assetId: string; alt: string } | null, nextUrl: string | null) {
    patchRow(row.serviceId, { saving: true, error: null });
    try {
      const result = await saveWorkLandingImageAction(row.serviceId, row.name, image);
      if (!result.ok) throw new Error(result.error);
      patchRow(row.serviceId, { url: nextUrl, saving: false, saved: true, mode: "closed" });
    } catch (err) {
      patchRow(row.serviceId, { saving: false, error: err instanceof Error ? err.message : "Save failed" });
    }
  }

  function selectPickedImage(row: RowState, image: PickableProjectImage) {
    const alt = image.alt || defaultAlt(row.name);
    persist(row, { assetId: image.assetId, alt }, image.url);
  }

  async function handleUpload(row: RowState, file: File) {
    patchRow(row.serviceId, { uploading: true, error: null });
    try {
      const { assetId, url } = await uploadImage(file);
      await persist(row, { assetId, alt: defaultAlt(row.name) }, url);
    } catch (err) {
      patchRow(row.serviceId, { error: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      patchRow(row.serviceId, { uploading: false });
    }
  }

  function handleRemove(row: RowState) {
    persist(row, null, null);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {rows.map((row) => (
        <div key={row.serviceId} className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <p className="font-sans font-semibold text-body-small text-ordift-ink">{row.name}</p>

          <button
            type="button"
            onClick={() => toggleMenu(row.serviceId)}
            className={`relative w-full aspect-video rounded-lg overflow-hidden bg-ordift-offwhite border touch-manipulation ${
              row.mode !== "closed" ? "border-ordift-gold border-2" : "border-black/10 hover:border-black/25"
            }`}
          >
            {row.url ? (
              <Image src={row.url} alt="" fill sizes="320px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-caption text-ordift-ink-muted/70 px-3 text-center">
                <span>No custom image</span>
                <span className="text-ordift-gold-pressed font-semibold">Tap to add</span>
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
                onClick={() => openPortfolioBrowser(row.serviceId)}
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
                  onClick={() => handleRemove(row)}
                  disabled={row.saving}
                  className="w-full min-h-9 text-caption text-red-700 underline underline-offset-4"
                >
                  Remove (use automatic fallback)
                </button>
              )}
              <button type="button" onClick={() => toggleMenu(row.serviceId)} className="w-full min-h-9 text-caption text-ordift-ink-muted underline">
                Cancel
              </button>
            </div>
          )}

          {row.mode === "portfolio" && (
            <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
              <select
                value={row.pickerProjectId}
                onChange={(e) => loadPickerProjectImages(row.serviceId, e.target.value)}
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

              <button type="button" onClick={() => patchRow(row.serviceId, { mode: "menu" })} className="text-caption text-ordift-ink-muted underline">
                Back
              </button>
            </div>
          )}

          {row.saved && row.mode === "closed" && <p className="text-caption text-green-700">Saved.</p>}
          {row.error && <p className="text-caption text-red-700">{row.error}</p>}
        </div>
      ))}
    </div>
  );
}
