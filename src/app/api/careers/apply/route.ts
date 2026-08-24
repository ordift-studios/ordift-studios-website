import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";
import { RECRUITMENT_ROLE_OPTIONS, RECRUITMENT_ENGAGEMENT_OPTIONS } from "@/lib/recruitment/types";

// Public "Join Our Team" application submission (2026-08-24). No user
// session exists for an applicant, so — same shape as
// saveEnquiryToSupabase — every write here goes through the
// service-role admin client, never a request-scoped/RLS-governed one.
//
// Deliberately a foundation, not the full enquiry pipeline: basic IP
// rate-limiting is reused (checkRateLimit, already built for /api/
// enquiry), but Turnstile/email-notification/Google-Sheets-sync
// infrastructure is NOT wired up here — a real scope decision, not an
// oversight, to keep this first pass to "the smallest coherent
// implementation." Worth adding before this goes live in Production.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(`careers:${clientKey(request)}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate-limited", message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES * 2 + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "file-too-large" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-form-data" }, { status: 400 });
  }

  const fullName = str(formData, "fullName");
  const email = str(formData, "email");
  const roleInterest = str(formData, "roleInterest");
  const consentAcknowledged = formData.get("consentAcknowledged") === "true";

  if (!fullName || !email || !roleInterest) {
    return NextResponse.json({ ok: false, error: "missing-required-field" }, { status: 400 });
  }
  if (!RECRUITMENT_ROLE_OPTIONS.includes(roleInterest as (typeof RECRUITMENT_ROLE_OPTIONS)[number])) {
    return NextResponse.json({ ok: false, error: "invalid-role-interest" }, { status: 400 });
  }
  if (!consentAcknowledged) {
    return NextResponse.json({ ok: false, error: "consent-required" }, { status: 400 });
  }
  const engagementType = str(formData, "engagementType") || null;
  if (engagementType && !RECRUITMENT_ENGAGEMENT_OPTIONS.includes(engagementType as (typeof RECRUITMENT_ENGAGEMENT_OPTIONS)[number])) {
    return NextResponse.json({ ok: false, error: "invalid-engagement-type" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Insert first (without file paths) so a file-upload failure never
  // loses the applicant's text submission — files are attached in a
  // follow-up update once uploaded.
  const { data: inserted, error: insertError } = await admin
    .from("recruitment_applications")
    .insert({
      full_name: fullName,
      email,
      phone: str(formData, "phone") || null,
      location: str(formData, "location") || null,
      role_interest: roleInterest,
      engagement_type: engagementType,
      intro: str(formData, "intro") || null,
      experience: str(formData, "experience") || null,
      portfolio_url: str(formData, "portfolioUrl") || null,
      social_url: str(formData, "socialUrl") || null,
      availability: str(formData, "availability") || null,
      message: str(formData, "message") || null,
      consent_acknowledged: true,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[careers] failed to save application", insertError?.message);
    return NextResponse.json({ ok: false, error: "save-failed" }, { status: 502 });
  }

  const applicationId = inserted.id as string;
  const filePaths: { photo_storage_path?: string; cv_storage_path?: string } = {};

  async function uploadOne(
    field: string,
    allowed: Set<string>,
    prefix: "photo" | "cv"
  ): Promise<{ ok: true; path: string } | { ok: false } | { ok: true; skipped: true }> {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) return { ok: true, skipped: true };
    if (file.size > MAX_BYTES || !allowed.has(file.type)) return { ok: false };

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = await detectFileMimeType(buffer);
    if (!sniffed || !allowed.has(sniffed)) return { ok: false };

    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${applicationId}/${prefix}-${Date.now()}.${extension}`;
    const { error } = await admin.storage.from("recruitment-applications").upload(path, buffer, { contentType: file.type });
    if (error) return { ok: false };
    return { ok: true, path };
  }

  const photoResult = await uploadOne("photo", ALLOWED_PHOTO_TYPES, "photo");
  if (photoResult.ok && "path" in photoResult) filePaths.photo_storage_path = photoResult.path;
  const cvResult = await uploadOne("cv", ALLOWED_CV_TYPES, "cv");
  if (cvResult.ok && "path" in cvResult) filePaths.cv_storage_path = cvResult.path;

  if (Object.keys(filePaths).length > 0) {
    await admin.from("recruitment_applications").update(filePaths).eq("id", applicationId);
  }

  const photoFailed = !photoResult.ok;
  const cvFailed = !cvResult.ok;

  return NextResponse.json({
    ok: true,
    id: applicationId,
    warnings: {
      ...(photoFailed ? { photo: "Your photo couldn't be uploaded — the rest of your application was saved." } : {}),
      ...(cvFailed ? { cv: "Your CV couldn't be uploaded — the rest of your application was saved." } : {}),
    },
  });
}
