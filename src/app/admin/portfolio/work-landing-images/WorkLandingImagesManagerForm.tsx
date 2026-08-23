"use client";

import { useState } from "react";
import Image from "next/image";
import { getProjectImagesForWorkLandingPickerAction, saveWorkLandingImageAction } from "./actions";
import type { PickableProjectImage, ProjectPickableImages, PortfolioProjectRefOption } from "@/lib/content/sanity/homepageSlideshowAdmin";
import type { WorkLandingImageAdmin } from "@/lib/content/sanity/workLandingImagesAdmin";
import FocalPointEditor from "@/components/admin/FocalPointEditor";
import { compressImageFile } from "@/lib/media/clientImageCompress";

// Work Landing Images manager (2026-08-23) — one image per discipline
// for its band on /work (WorkDisciplineBands). Same "tap to open Choose
// from Portfolio / Upload from Device" interaction as the Homepage
// Slideshow and the Portfolio Cover Image picker, saved independently
// per discipline (no whole-array replace — each Service document holds
// its own single image field).
//
// Image Repositioning (2026-08-23) — picking a new image or tapping
// "Reposition" on an already-saved one opens FocalPointEditor before
// the final save.
type Mode = "closed" | "menu" | "portfolio" | "reposition";

// Representative crop-frame ratio for the reposition preview —
// approximates WorkDisciplineBands' wide horizontal band (its exact
// ratio varies by breakpoint, from ~1.9:1 on mobile to ~5:1 on desktop;
// this sits toward the more compressed desktop end, where focal point
// matters most).
const PREVIEW_ASPECT_RATIO = 3.5;

type PendingImage = { assetId: string; url: string; alt: string; focalX: number; focalY: number };

type RowState = {
  serviceId: string;
  discipline: string;
  name: string;
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

function defaultAlt(name: string): string {
  return `${name} — Ordift Studios`;
}

// Root cause of the device-upload failure (2026-08-23): this route
// never compressed the file before sending it, unlike the Portfolio
// native creator wizard, which always has (see
// src/app/api/admin/portfolio/assets/route.ts's own comment) — Vercel's
// Serverless Functions enforce a hard ~4.5MB request body ceiling at
// the platform level, below this route's own MAX_BYTES check and
// entirely outside this app's control. A raw camera photo (an iPad
// photo commonly runs 5-10MB) blows past that ceiling; the platform
// rejects the request before this route's code ever runs, and the
// non-JSON rejection response is what produced the confusing raw
// browser exception — Choose from Portfolio never hit this because it
// uploads nothing, only a reference to an already-existing asset.
// compressImageFile (already proven by the wizard) resizes/re-encodes
// client-side to comfortably clear that ceiling before this ever
// becomes a request body. Each stage below still tags its own errors
// with where they occurred, as a safety net for any other failure
// class this doesn't cover.
async function uploadImage(file: File) {
  let compressed: File;
  try {
    compressed = file.type.startsWith("image/") ? await compressImageFile(file) : file;
  } catch (err) {
    throw new Error(`[upload:compress] ${err instanceof Error ? err.message : String(err)}`);
  }

  let formData: FormData;
  try {
    formData = new FormData();
    formData.append("file", compressed);
    formData.append("role", "work_landing_image");
  } catch (err) {
    throw new Error(`[upload:form-data] ${err instanceof Error ? err.message : String(err)}`);
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

  function patchRow(serviceId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, ...patch } : r)));
  }

  function toggleMenu(serviceId: string) {
    setRows((prev) =>
      prev.map((r) => (r.serviceId === serviceId ? { ...r, mode: r.mode === "closed" ? "menu" : "closed", error: null, saved: false } : r))
    );
  }

  function openReposition(row: RowState) {
    if (!row.assetId || !row.url) return;
    patchRow(row.serviceId, { pending: { assetId: row.assetId, url: row.url, alt: row.alt, focalX: row.focalX, focalY: row.focalY }, mode: "reposition" });
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

  function selectPickedImage(row: RowState, image: PickableProjectImage) {
    const alt = image.alt || defaultAlt(row.name);
    patchRow(row.serviceId, { pending: { assetId: image.assetId, url: image.url, alt, focalX: 50, focalY: 50 }, mode: "reposition" });
  }

  async function handleUpload(row: RowState, file: File) {
    patchRow(row.serviceId, { uploading: true, error: null });
    try {
      const { assetId, url } = await uploadImage(file);
      patchRow(row.serviceId, { pending: { assetId, url, alt: defaultAlt(row.name), focalX: 50, focalY: 50 }, mode: "reposition" });
    } catch (err) {
      patchRow(row.serviceId, { error: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      patchRow(row.serviceId, { uploading: false });
    }
  }

  async function handleSavePosition(row: RowState) {
    if (!row.pending) return;
    patchRow(row.serviceId, { saving: true, error: null });
    try {
      const result = await saveWorkLandingImageAction(row.serviceId, row.name, {
        assetId: row.pending.assetId,
        alt: row.pending.alt,
        focalX: row.pending.focalX,
        focalY: row.pending.focalY,
      });
      if (!result.ok) throw new Error(result.error);
      patchRow(row.serviceId, {
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
      patchRow(row.serviceId, { saving: false, error: err instanceof Error ? err.message : "Save failed" });
    }
  }

  async function handleRemove(row: RowState) {
    patchRow(row.serviceId, { saving: true, error: null });
    try {
      const result = await saveWorkLandingImageAction(row.serviceId, row.name, null);
      if (!result.ok) throw new Error(result.error);
      patchRow(row.serviceId, { assetId: null, url: null, alt: "", focalX: 50, focalY: 50, saving: false, saved: true, mode: "closed" });
    } catch (err) {
      patchRow(row.serviceId, { saving: false, error: err instanceof Error ? err.message : "Save failed" });
    }
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
              <Image
                src={row.url}
                alt=""
                fill
                sizes="320px"
                className="object-cover"
                style={{ objectPosition: `${row.focalX}% ${row.focalY}%` }}
              />
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

          {row.mode === "reposition" && row.pending && (
            <div className="rounded-lg border border-black/15 bg-white p-3 space-y-3">
              <p className="font-sans text-caption text-ordift-ink-muted">
                Preview approximates the live band on /work.
              </p>
              <FocalPointEditor
                key={row.pending.assetId}
                imageUrl={row.pending.url}
                previewAspectRatio={PREVIEW_ASPECT_RATIO}
                initialFocalX={row.pending.focalX}
                initialFocalY={row.pending.focalY}
                onChange={(x, y) =>
                  patchRow(row.serviceId, { pending: row.pending ? { ...row.pending, focalX: x, focalY: y } : row.pending })
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
                  onClick={() => patchRow(row.serviceId, { mode: "closed", pending: null })}
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
