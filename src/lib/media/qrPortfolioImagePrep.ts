"use client";

// Prepares a photograph in the browser before it is uploaded for the QR portfolio: keeps it at up to 2560 px on the longer side and under 4 MB (Vercel refuses bigger request bodies), and leaves a
// photograph that already fits completely untouched. Pure sizing decisions are in `planResize` so they can be tested without a browser.

export const PREP = { maxLongEdge: 2560, targetMaxBytes: 4 * 1024 * 1024, jpegQuality: 0.88 } as const;

export type ResizePlan = { action: "keep" } | { action: "reencode"; width: number; height: number };

export function planResize(width: number, height: number, bytes: number, type: string): ResizePlan {
  const long = Math.max(width, height);
  const tooBig = long > PREP.maxLongEdge;
  if (!tooBig && bytes <= PREP.targetMaxBytes) return { action: "keep" };
  const scale = tooBig ? PREP.maxLongEdge / long : 1;
  void type;
  return { action: "reencode", width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => { img.onload = () => resolve(img); img.onerror = () => reject(new Error("decode")); });
    img.src = url;
    return await loaded;
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/** Returns the file to upload: the original if it already fits, otherwise a JPEG re-encoding at up to 2560 px that is under 4 MB. Throws a message fit to show a person if it cannot. */
export async function prepareQrPortfolioImage(file: File): Promise<File> {
  let source: ImageBitmap | HTMLImageElement;
  try { source = await decode(file); } catch { throw new Error("That file could not be read as a photograph."); }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width, h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const plan = planResize(w, h, file.size, file.type);
  if (plan.action === "keep") return file;

  let { width, height } = plan;
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare the photograph. Try another browser.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);          // a PNG with transparency becomes JPEG: fill, rather than turn transparent areas black
    ctx.drawImage(source, 0, 0, width, height);
    const blob = await toBlob(canvas, Math.max(0.6, PREP.jpegQuality - attempt * 0.08));
    if (blob && blob.size <= PREP.targetMaxBytes) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    width = Math.round(width * 0.85); height = Math.round(height * 0.85);   // still too heavy: scale down a little and retry
  }
  throw new Error("That photograph could not be made small enough to upload. Try a smaller one.");
}
