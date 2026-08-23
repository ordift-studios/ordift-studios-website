import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageHomepageSlideshow } from "@/lib/admin/homepageSlideshowPermissions";
import { uploadPortfolioImage } from "@/lib/content/sanity/portfolioAssets";
import { logActivity } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Homepage Slideshow Manager image upload (2026-08-23) — gated
// admin+super_admin (canManageHomepageSlideshow), deliberately not the
// narrower canCreatePortfolioProjectsNatively (Super-Admin-only) used by
// the Portfolio asset route this otherwise mirrors closely. Reuses the
// existing, genuinely generic uploadPortfolioImage() (a plain Sanity
// image-asset upload, nothing Portfolio-specific in its implementation)
// rather than duplicating the upload call. Same size cap and
// content-sniffing corroboration (TD-030) as the Portfolio route —
// SANITY_API_TOKEN never reaches the response either way.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageHomepageSlideshow(user)) {
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
  const orientation = formData.get("orientation"); // "landscape" | "portrait" — logged only, doesn't affect the upload itself
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
      action: "homepage_slideshow.asset_uploaded",
      metadata: { orientation, filename: file.name, sizeBytes: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, ...asset });
  } catch (error) {
    console.error("[admin] homepage slideshow asset upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}
