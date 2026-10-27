"use client";
// Browser-side PDF generation for the rate card (nothing is sent to a server). Draft content is always watermarked; an approved edition is released unwatermarked by the caller only
// after the server has verified it. Returns the Blob so the caller can preview it or save it.
import type { EditionStatus, RateCardContent } from "../types";

export async function renderRateCardPdf(content: RateCardContent, status: EditionStatus, opts: { coverPanelOpacity?: number } = {}): Promise<Blob> {
  const [{ pdf }, { registerBrandFonts }, { RateCardDocument }] = await Promise.all([import("@react-pdf/renderer"), import("../../fonts"), import("../RateCardDocument")]);
  registerBrandFonts("/fonts/pdf");
  const { createElement } = await import("react");
  const blob = await pdf(createElement(RateCardDocument, { content, status, logoWhite: "/brand/logo-full-white.png", coverPanelOpacity: opts.coverPanelOpacity ?? 0.7 }) as never).toBlob();
  const head = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (head !== "%PDF-") throw new Error("The generated file is not a PDF.");
  return blob;
}
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
