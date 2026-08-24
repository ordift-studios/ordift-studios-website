import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Portrait upload for the Meet the Team profile editor
// (src/app/admin/team/[id]/profile/page.tsx) — same shape as the
// existing Portfolio asset upload route (src/app/api/admin/portfolio/
// assets/route.ts): size cap as a safety net against a bypassed client
// (the editor compresses client-side first via clientImageCompress.ts),
// declared-Content-Type + sniffed-magic-bytes double check. Writes to
// the new `staff-portraits` Supabase Storage bucket (public read,
// staff/admin-only write — see migration 0035) rather than Sanity,
// since this is staff-identity data, not portfolio content.
//
// Super-Admin-only, same tier as the rest of this feature's admin
// surface (Admin -> Team) — editing someone else's public profile
// content is not a self-service action.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) {
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
  const profileId = formData.get("profileId");
  if (!(file instanceof File) || typeof profileId !== "string" || !profileId) {
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

  const admin = createAdminClient();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profileId}/${Date.now()}.${extension}`;

  try {
    const { error: uploadError } = await admin.storage
      .from("staff-portraits")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = admin.storage.from("staff-portraits").getPublicUrl(path);

    // New portrait -> fresh focal point. The previous crop position was
    // chosen for the old image and has no meaning against a new one.
    const { error: profileError } = await admin
      .from("profiles")
      .update({ avatar_url: publicUrlData.publicUrl, avatar_focal_x: 50, avatar_focal_y: 50 })
      .eq("id", profileId);
    if (profileError) throw profileError;

    await logActivity({
      actorUserId: user.id,
      action: "team.portrait_uploaded",
      entityType: "user",
      entityId: profileId,
      metadata: { filename: file.name, sizeBytes: file.size, contentType: file.type },
    });

    return NextResponse.json({ ok: true, url: publicUrlData.publicUrl });
  } catch (error) {
    console.error("[admin] team portrait upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}
