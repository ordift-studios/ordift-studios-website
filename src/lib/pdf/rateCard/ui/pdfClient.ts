"use client";
// Browser-side PDF generation for the rate card (nothing is sent to a server). Draft content is always watermarked; an approved edition is released unwatermarked by the caller only
// after the server has verified it. Returns the Blob so the caller can preview it or save it.
import { coverProxyUrl, isSanityCoverUrl } from "../cover";
import type { EditionStatus, RateCardContent } from "../types";

// An uploaded cover photograph lives on the image CDN; the PDF engine is given it as an embedded image fetched through the same-origin cover route (signed-in Super Admin only), so the page's
// connect-src policy stays as it is. Only this render copy carries the embedded bytes — the draft / edition content (and its hash) keeps the immutable address.
export async function embedCover(content: RateCardContent): Promise<RateCardContent> {
  if (!isSanityCoverUrl(content.coverImage)) return content;
  const r = await fetch(coverProxyUrl(content.coverImage), { credentials: "same-origin" });
  if (!r.ok) throw new Error("The cover photograph could not be loaded. Check that you are signed in as Super Admin and that the photograph still exists.");
  const blob = await r.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
  return { ...content, coverImage: dataUrl };
}

export async function renderRateCardPdf(content: RateCardContent, status: EditionStatus, opts: { coverPanelOpacity?: number } = {}): Promise<Blob> {
  const [{ pdf }, { registerBrandFonts }, { RateCardDocument }] = await Promise.all([import("@react-pdf/renderer"), import("../../fonts"), import("../RateCardDocument")]);
  registerBrandFonts("/fonts/pdf");
  const { createElement } = await import("react");
  const blob = await pdf(createElement(RateCardDocument, { content: await embedCover(content), status, logoWhite: "/brand/logo-full-white.png", coverPanelOpacity: opts.coverPanelOpacity ?? 0.7 }) as never).toBlob();
  const head = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (head !== "%PDF-") throw new Error("The generated file is not a PDF.");
  return blob;
}
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
