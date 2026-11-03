import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { loadIssuedQuotationDocument } from "@/lib/commercial/quotationDocumentData";
import { DRIFT_MESSAGE, documentFileName } from "@/lib/commercial/quotationDocument";
import { renderQuotationPdf } from "@/lib/pdf/quotation/render";
import { findUnsupportedText, unsupportedMessage } from "@/lib/pdf/quotation/coverage";

// The quotation PDF of an ISSUED ordinary quotation, for the signed-in admin who asked for it. Built on the server from the frozen issued content; nothing is stored, emailed or sent.
// A draft has no document here (it keeps the print preview); a quotation whose content no longer matches the fingerprint recorded at issue is refused rather than silently re-printed.
export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const plain = (message: string, status: number) => new NextResponse(message, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return plain("Not found", 404);
  if (!UUID.test(id)) return plain("Not found", 404);

  const result = await loadIssuedQuotationDocument(id);
  if (!result.ok) return plain(result.message, result.code === "not_found" ? 404 : 422);
  const { doc } = result;
  if (doc.drift.state === "changed") return plain(DRIFT_MESSAGE, 409);
  // Never print a client's name (or any text) wrongly or leave it out: if the fonts cannot draw something on the document, say so instead of producing a PDF.
  const unsupported = findUnsupportedText(doc.content, doc.context);
  if (unsupported.length > 0) return plain(unsupportedMessage(unsupported), 422);

  const pdf = await renderQuotationPdf({ content: doc.content, context: doc.context, fingerprint: doc.fingerprint });
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${documentFileName(doc.content.reference, doc.fingerprint)}"`, "X-Content-Fingerprint": doc.fingerprint },
  });
}
