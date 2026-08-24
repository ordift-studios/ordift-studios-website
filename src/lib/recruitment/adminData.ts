import { createAdminClient } from "@/lib/supabase/admin";
import type {
  RecruitmentApplicationDetail,
  RecruitmentApplicationSummary,
  RecruitmentStatus,
} from "./types";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — long enough to view/download once, short-lived by design

type Row = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  role_interest: string;
  engagement_type: string | null;
  intro: string | null;
  experience: string | null;
  portfolio_url: string | null;
  social_url: string | null;
  availability: string | null;
  message: string | null;
  photo_storage_path: string | null;
  cv_storage_path: string | null;
  status: RecruitmentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
};

export async function listRecruitmentApplications(): Promise<RecruitmentApplicationSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recruitment_applications")
    .select("id, full_name, role_interest, location, submitted_at, status")
    .order("submitted_at", { ascending: false });

  if (error || !data) {
    console.error("[recruitment admin] failed to list applications", error?.message);
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    roleInterest: r.role_interest,
    location: r.location,
    submittedAt: r.submitted_at,
    status: r.status,
  }));
}

export async function getRecruitmentApplication(id: string): Promise<RecruitmentApplicationDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("recruitment_applications").select("*").eq("id", id).maybeSingle<Row>();
  if (error || !data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone,
    location: data.location,
    roleInterest: data.role_interest,
    engagementType: data.engagement_type,
    intro: data.intro,
    experience: data.experience,
    portfolioUrl: data.portfolio_url,
    socialUrl: data.social_url,
    availability: data.availability,
    message: data.message,
    hasPhoto: Boolean(data.photo_storage_path),
    hasCv: Boolean(data.cv_storage_path),
    status: data.status,
    reviewedBy: data.reviewed_by,
    reviewedAt: data.reviewed_at,
    submittedAt: data.submitted_at,
  };
}

// Signed URLs, generated on demand — the storage paths themselves are
// never exposed to the client; this is the one place a browser ever
// receives a working link, and it expires shortly after.
export async function getRecruitmentFileSignedUrl(
  applicationId: string,
  file: "photo" | "cv"
): Promise<string | null> {
  const admin = createAdminClient();
  const column = file === "photo" ? "photo_storage_path" : "cv_storage_path";
  const { data: row } = await admin.from("recruitment_applications").select(column).eq("id", applicationId).maybeSingle();
  const path = row ? (row as Record<string, string | null>)[column] : null;
  if (!path) return null;

  const { data, error } = await admin.storage.from("recruitment-applications").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[recruitment admin] failed to sign file URL", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function updateRecruitmentApplicationStatus(
  id: string,
  status: RecruitmentStatus,
  reviewerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("recruitment_applications")
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[recruitment admin] failed to update status", error.message);
    return { ok: false, error: "Couldn't update status — please try again." };
  }
  return { ok: true };
}
