import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import { uploadPortfolioImage } from "@/lib/content/sanity/portfolioAssets";
import { logActivity } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Shared upload endpoint for Portfolio Hero/Cover Image Management
// (2026-08-23) — used by both Work Landing Images and Portfolio
// Cover/Index Image pickers, since both are "Upload from Device" for
// the same purpose (a presentation-only image, admin/super_admin
// gated) and neither needs its own copy of this logic. Mirrors
// /api/admin/homepage-slideshow/assets/route.ts closely (same size cap,
// same content-sniffing corroboration per TD-030, same generic
// uploadPortfolioImage() call) but is deliberately a separate route so
// neither feature's activity-log semantics or gating can regress the
// other. SANITY_API_TOKEN never reaches the response either way.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManagePortfolioPresentation(user)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  const role = formData.get("role"); // "work_landing_image" | "cover_image" — logged only
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const sniffedMime = await detectFileMimeType(buffer);
  if (!sniffedMime || !ALLOWED_IMAGE_TYPES.has(sniffedMime)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

  try {
    const asset = await uploadPortfolioImage(buffer, file.name, file.type);

    await logActivity({
      actorUserId: user.id,
      action: "portfolio_presentation_image.asset_uploaded",
      metadata: { role, filename: file.name, sizeBytes: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, ...asset });
  } catch (error) {
    console.error("[admin] portfolio presentation image upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}
