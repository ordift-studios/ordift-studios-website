import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { registerBrandFonts } from "../fonts";
import type { QuotationDocumentContent, QuotationDocumentContext } from "@/lib/commercial/quotationDocument";
import { QuotationDocument, type LetterheadAssets } from "./QuotationDocument";

// Server-side render of the issued-quotation PDF. Nothing is stored, emailed or published here: the caller returns the bytes to the signed-in staff member who asked for them.
// The page is the approved letterhead design with its contact strip removed (public/brand/os-letterhead-base.jpg) and the three approved contact icons (public/brand/letterhead-icons);
// the contact details of the issuing entity are printed as live text. Both are built from the approved letterhead by scripts/build_letterhead_assets.py. A missing file is tolerated:
// the document is still produced, only without that image.
const read = (root: string, rel: string): Buffer | null => { try { return readFileSync(path.join(root, rel)); } catch { return null; } };

export function loadLetterhead(root: string = process.cwd()): LetterheadAssets {
  return {
    base: read(root, "public/brand/os-letterhead-base.jpg"),
    icons: { email: read(root, "public/brand/letterhead-icons/email.png"), phone: read(root, "public/brand/letterhead-icons/phone.png"), web: read(root, "public/brand/letterhead-icons/web.png") },
  };
}

export async function renderQuotationPdf(p: { content: QuotationDocumentContent; context: QuotationDocumentContext; fingerprint: string; root?: string }): Promise<Buffer> {
  const root = p.root ?? process.cwd();
  registerBrandFonts(path.join(root, "public/fonts/pdf"));
  const element = createElement(QuotationDocument, { content: p.content, context: p.context, fingerprint: p.fingerprint, letterhead: loadLetterhead(root) });
  return Buffer.from(await renderToBuffer(element as never));
}
