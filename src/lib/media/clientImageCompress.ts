"use client";

// Resizes/recompresses an image in the browser before it's uploaded —
// exists solely to stay under Vercel's ~4.5MB Serverless Function
// payload ceiling (see src/app/api/admin/portfolio/assets/route.ts's
// own comment for the full reasoning). A camera-original JPEG easily
// exceeds that; a 2560px-wide, quality-0.85 JPEG almost never does,
// and is already larger than anything this site actually renders at
// (see next.config.ts's image loader). No new dependency — plain
// Canvas API, supported by every browser this admin console targets.

const MAX_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;
const TARGET_MAX_BYTES = 4 * 1024 * 1024;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
    });
    img.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// GIFs are passed through untouched (canvas re-encoding would drop
// animation); anything already small enough is passed through too —
// this only does work when it's actually needed.
export async function compressImageFile(file: File): Promise<File> {
  if (file.type === "image/gif" || file.size <= TARGET_MAX_BYTES) return file;

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  // One step down if still too large (e.g. a very detailed/large source) —
  // deliberately not an unbounded loop; good enough beats perfect here.
  if (blob && blob.size > TARGET_MAX_BYTES && quality > 0.6) {
    quality -= 0.15;
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
