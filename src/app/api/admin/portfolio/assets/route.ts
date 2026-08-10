import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { canCreatePortfolioProjectsNatively } from "@/lib/admin/portfolioPermissions";
import { uploadPortfolioFile, uploadPortfolioImage } from "@/lib/content/sanity/portfolioAssets";
import { logActivity } from "@/lib/admin/activityLog";

// Native Portfolio Project creator (2026-08-05) — the one route where a
// browser payload reaches the server carrying real media bytes. Every
// upload still goes through the existing server-side Sanity write
// client (src/lib/content/sanity/portfolioAssets.ts); SANITY_API_TOKEN
// is never referenced here and never reaches the response. Gated
// Super-Admin-only, same tier as the rest of the native creation flow
// — see src/lib/admin/portfolioPermissions.ts for why this is
// deliberately narrower than the general Portfolio Admin capability set.
//
// Size cap: Vercel's Serverless Functions enforce a hard ~4.5MB request
// body ceiling at the platform level — not a Next.js setting, not
// something this route can raise. The wizard compresses images
// client-side before they ever reach this route (see
// src/lib/media/clientImageCompress.ts), so the cap here is a safety
// net against a bypassed/malicious client, not the primary control.
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  ...ALLOWED_IMAGE_TYPES,
]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreatePortfolioProjectsNatively(user)) {
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
  const kind = formData.get("kind"); // "image" | "file"
  if (!(file instanceof File) || (kind !== "image" && kind !== "file")) {
    return NextResponse.json({ ok: false, error: "missing-file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  }

  const allowed = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_FILE_TYPES;
  if (!allowed.has(file.type)) {
    return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const asset =
      kind === "image"
        ? await uploadPortfolioImage(buffer, file.name, file.type)
        : await uploadPortfolioFile(buffer, file.name, file.type);

    // Who uploaded this specific asset wasn't previously recorded —
    // the downstream project-creation/field-save actions that consume
    // it are audit-logged, but the upload itself wasn't. Added 2026-08-10
    // (Workstream I security re-review).
    await logActivity({
      actorUserId: user.id,
      action: "portfolio.asset_uploaded",
      metadata: { kind, filename: file.name, sizeBytes: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, ...asset });
  } catch (error) {
    console.error("[admin] portfolio asset upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}
