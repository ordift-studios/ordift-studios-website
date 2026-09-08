import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { uploadPortfolioImage } from "@/lib/content/sanity/portfolioAssets";
import { logActivity } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Ordift Pulse — Adaptive Discovery Remediation, Part 6 (2026-09-08).
// Hero-media image upload proxy for the Admin Pulse review screen —
// same secure pattern as /api/admin/portfolio/assets (the only other
// place a browser reaches this class of endpoint in this codebase):
// the actual Sanity write client/token never leaves the server, and
// this route reuses uploadPortfolioImage() directly rather than
// standing up a second, competing upload implementation — Part 6's own
// explicit instruction ("do not create a second competing media
// architecture"). Admin/Super Admin gated, mirroring the rest of Pulse
// admin (not the narrower Super-Admin-only tier the native Portfolio
// creator uses — this is a same-sensitivity-class upload of a single
// image onto an existing document, not project creation).
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
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

  // Corroborates the declared Content-Type against the file's actual
  // magic bytes — same TD-030 defense-in-depth precedent as the
  // Portfolio upload route.
  const sniffedMime = await detectFileMimeType(buffer);
  if (!sniffedMime || !ALLOWED_IMAGE_TYPES.has(sniffedMime)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

  try {
    const asset = await uploadPortfolioImage(buffer, file.name, file.type);

    await logActivity({
      actorUserId: user.id,
      action: "pulse.hero_media_uploaded",
      metadata: { filename: file.name, sizeBytes: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, ...asset });
  } catch (error) {
    console.error("[admin] pulse hero media upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}
