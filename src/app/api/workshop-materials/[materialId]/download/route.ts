import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { getMaterialDownloadUrl } from "@/lib/workshops/materials";

// Workshop Learning Infrastructure V1 (2026-09-19) — every material
// download, for admin/instructor/participant alike, goes through this
// one route so the visibility + engagement/registration check in
// getMaterialDownloadUrl() runs server-side before a short-lived
// signed URL is ever issued — never a direct, permanent storage link.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/portal/login", _request.url));

  const result = await getMaterialDownloadUrl(materialId, user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });

  return NextResponse.redirect(result.url);
}
