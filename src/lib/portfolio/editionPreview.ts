import { createElement } from "react";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerBrandFonts } from "@/lib/pdf/fonts";
import { prepareEdition } from "@/lib/pdf/portfolio/build";
import { PortfolioDocument } from "@/lib/pdf/portfolio/PortfolioDocument";
import type { PortfolioContent } from "@/lib/pdf/portfolio/types";
import { listCollectionFileIds, listCollections } from "./library";
import type { Destination } from "./destinations";

// INTERNAL PREVIEW of a portfolio collection. The mode is fixed here: this module cannot produce an external edition, stores nothing, publishes nothing and sends nothing.
// It reads photographs from the private bucket (read-only) only to draw them into the PDF that is returned to the signed-in Super Admin who asked for it.
export const PREVIEW_MAX_PHOTOS = 30;
const EMBEDDABLE = /^image\/(jpeg|png)$/i;

export type PreviewResult =
  | { ok: true; pdf: Buffer; photographs: number; skipped: { name: string; reason: string }[]; wouldBlockExternal: number; collectionName: string; truncated: boolean }
  | { ok: false; error: string };

async function toDataUri(buf: Buffer, mime: string): Promise<string> {
  try {
    const sharp = (await import("sharp")).default; // already shipped with Next.js; falls back to the original bytes if unavailable
    const out = await sharp(buf).rotate().resize({ width: 1500, height: 1500, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}

export async function buildInternalPreview(input: { collectionId: string; title: string; editionLabel: string; destination: Destination }): Promise<PreviewResult> {
  const collection = (await listCollections()).find((c) => c.id === input.collectionId);
  if (!collection) return { ok: false, error: "That collection was not found, or the portfolio library is not switched on." };
  const all = await listCollectionFileIds(input.collectionId);
  const fileIds = all.slice(0, PREVIEW_MAX_PHOTOS);
  if (fileIds.length === 0) return { ok: false, error: "That collection has no photographs yet." };

  const admin = createAdminClient();
  const { data: rows } = await admin.from("project_files").select("id, storage_bucket, storage_path, original_filename, client_title, mime_type, purged_at").in("id", fileIds);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

  const items: PortfolioContent["categories"][number]["items"] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const id of fileIds) {
    const r = byId.get(id);
    const name = (r?.client_title as string | null) || (r?.original_filename as string | undefined) || id;
    if (!r || r.purged_at) { skipped.push({ name, reason: "file no longer available" }); continue; }
    const mime = String(r.mime_type ?? "");
    if (!EMBEDDABLE.test(mime)) { skipped.push({ name, reason: "format cannot be drawn into a PDF (JPEG and PNG only)" }); continue; }
    const { data: blob, error } = await admin.storage.from(r.storage_bucket as string).download(r.storage_path as string);
    if (error || !blob) { skipped.push({ name, reason: "could not be read from storage" }); continue; }
    items.push({ fileId: id, imageSrc: await toDataUri(Buffer.from(await blob.arrayBuffer()), mime), caption: name });
  }
  if (items.length === 0) return { ok: false, error: "None of the photographs in that collection could be drawn into a preview." };

  // No studio introduction, category text or contact wording is invented here: each stays empty/marked until management supplies and approves it.
  const content: PortfolioContent = {
    title: input.title, editionLabel: input.editionLabel, preparedOn: new Date().toISOString().slice(0, 10), studioIntro: [],
    categories: [{ key: collection.id, title: collection.name, items }],
    contact: [{ label: "Contact details", value: "To be supplied and approved before an external edition" }], approvals: [],
  };
  const prepared = await prepareEdition({ content, mode: "internal_preview", destination: input.destination });
  if (!prepared.ok) return { ok: false, error: prepared.error };

  registerBrandFonts(path.join(process.cwd(), "public/fonts/pdf"));
  const pdf = Buffer.from(await renderToBuffer(createElement(PortfolioDocument, { content, mode: "internal_preview" }) as never));
  return { ok: true, pdf, photographs: items.length, skipped, wouldBlockExternal: prepared.wouldBlockExternal.length, collectionName: collection.name, truncated: all.length > fileIds.length };
}
