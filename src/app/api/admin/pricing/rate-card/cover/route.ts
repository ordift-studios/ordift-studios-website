import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";
import { isOwnCoverUrl, uploadCoverPhoto } from "@/lib/pdf/rateCard/coverUpload";

// Rate card cover photographs. Super Admin only, like the rest of the rate card builder.
//   POST  multipart "file"  → stores the photograph as an image asset and returns its immutable address (the builder keeps that address in the draft).
//   GET   ?src=<address>    → streams that photograph back SAME-ORIGIN, so the browser-side PDF engine can embed it without widening the page's connect-src policy.
// Nothing here reads or writes pricing, editions or any database table.
const MAX_BYTES = 4 * 1024 * 1024;   // Vercel's request-body ceiling is about 4.5 MB; the builder compresses larger photographs in the browser before sending
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function guard() {
  const user = await getCurrentUser();
  return user && isSuperAdmin(user) ? user : null;
}

export async function POST(request: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ ok: false, error: "invalid-form-data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "missing-file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  if (!TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = await detectFileMimeType(buffer);
  if (!sniffed || !TYPES.has(sniffed)) return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 415 });
  try {
    const asset = await uploadCoverPhoto(buffer, file.name, sniffed);
    await logActivity({ actorUserId: user.id, action: "rate_card.cover_uploaded", metadata: { filename: file.name, sizeBytes: file.size, contentType: sniffed, width: asset.width, height: asset.height } });
    return NextResponse.json({ ok: true, ...asset });
  } catch (error) {
    console.error("[admin] rate card cover upload failed", error);
    return NextResponse.json({ ok: false, error: "upload-failed" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await guard())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  const src = request.nextUrl.searchParams.get("src") ?? "";
  if (!isOwnCoverUrl(src, { projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET })) return NextResponse.json({ ok: false, error: "not-a-cover-photograph" }, { status: 400 });
  const token = process.env.SANITY_API_TOKEN;
  const upstream = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: "error" });   // the token goes only to the pinned image host and never to the browser
  if (!upstream.ok) return NextResponse.json({ ok: false, error: "photograph-unavailable" }, { status: 502 });
  const type = upstream.headers.get("content-type") ?? "";
  if (!TYPES.has(type)) return NextResponse.json({ ok: false, error: "unsupported-file-type" }, { status: 502 });
  return new NextResponse(upstream.body, { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
