import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { isDestination, type Destination } from "@/lib/portfolio/destinations";
import { buildInternalPreview } from "@/lib/portfolio/editionPreview";

// Returns a watermarked INTERNAL PREVIEW PDF to the signed-in Super Admin who asked for it. Nothing is stored, published or sent; only the fact that a preview was
// made is written to the activity log. There is deliberately no external-edition path here.
export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });
const text = (v: string | null, fallback: string, max: number) => (v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) || fallback;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user) || !PORTFOLIO_LIBRARY_ENABLED) return NOT_FOUND();
  const q = request.nextUrl.searchParams;
  const collectionId = q.get("collection") ?? "";
  if (!UUID.test(collectionId)) return NOT_FOUND();
  const dest = q.get("destination") ?? "portfolio";
  const destination: Destination = isDestination(dest) ? dest : "portfolio";

  const result = await buildInternalPreview({ collectionId, destination, title: text(q.get("title"), "Portfolio", 80), editionLabel: text(q.get("edition"), "Portfolio, working draft", 80) });
  if (!result.ok) return new NextResponse(result.error, { status: 422, headers: { "Cache-Control": "private, no-store" } });

  await logActivity({ actorUserId: user.id, action: "portfolio.internal_preview_generated", entityType: "portfolio_collection", entityId: collectionId, metadata: { destination, photographs: result.photographs, skipped: result.skipped.length, wouldBlockExternal: result.wouldBlockExternal } });
  return new NextResponse(new Uint8Array(result.pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="portfolio-internal-preview.pdf"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
