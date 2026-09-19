import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { getSourceRecruitmentApplicationId } from "@/lib/recruitment/requisitions";
import { checkEmployeeAgreementReadiness } from "@/lib/legal/employeeAgreements";
import { resolveEmploymentAgreementStatus } from "@/lib/organization/onboardingDocumentsOverview";
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
    .select("id, full_name, email, role_interest, location, submitted_at, status")
    .order("submitted_at", { ascending: false });

  if (error || !data) {
    console.error("[recruitment admin] failed to list applications", error?.message);
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
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

export type HiringBridgeStatus =
  | { stage: "not_invited" }
  | { stage: "invitation_sent"; profileId: string }
  | { stage: "account_created"; profileId: string; positionAssigned: boolean }
  | { stage: "onboarding_in_progress"; profileId: string }
  | { stage: "onboarding_complete"; profileId: string };

// Invitation idempotency fix (2026-09-16, Kelvin QA) — the Recruitment
// application detail page previously always showed "Proceed to Hire",
// even once the bridge had already run and a real account existed
// (Kelvin's own reported case). Reads the SAME real signals the bridge
// itself writes — collaborator.invited's activity_log metadata.email
// (the same lookup convertApplicationToVendorAction already uses),
// profiles.access_status, auth email confirmation, position assignment,
// and staff_onboarding.status — never a separate, second-guessing
// tracker.
export async function getHiringBridgeStatus(application: { id: string; email: string }): Promise<HiringBridgeStatus> {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("activity_log")
    .select("entity_id")
    .eq("action", "collaborator.invited")
    .contains("metadata", { email: application.email })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invite?.entity_id) return { stage: "not_invited" };

  const profileId = invite.entity_id as string;
  const [{ data: profile }, { data: authUser }, { data: staffDetails }, { data: onboarding }] = await Promise.all([
    admin.from("profiles").select("access_status").eq("id", profileId).maybeSingle(),
    admin.auth.admin.getUserById(profileId),
    admin.from("staff_details").select("id").eq("id", profileId).not("position_id", "is", null).maybeSingle(),
    admin.from("staff_onboarding").select("status").eq("profile_id", profileId).maybeSingle(),
  ]);

  if (onboarding) {
    return onboarding.status === "completed"
      ? { stage: "onboarding_complete", profileId }
      : { stage: "onboarding_in_progress", profileId };
  }
  if (!authUser?.user?.email_confirmed_at || profile?.access_status === "invited") {
    return { stage: "invitation_sent", profileId };
  }
  return { stage: "account_created", profileId, positionAssigned: Boolean(staffDetails) };
}

// Recruitment Live Lifecycle Status (Task 4, 2026-09-18) — the
// Recruitment list previously showed only the historical decision
// ("Selected"), which stays permanently true and correct but tells
// the Founder nothing about where a hire has actually reached. This
// layers a CURRENT-PROCESS label on top of the SAME getHiringBridgeStatus()
// signals above plus the SAME Employee Employment Agreement readiness
// Task 1/3 already wired — never a second/fabricated state machine,
// never overwriting recruitment_applications.status itself.
export type RecruitmentLiveStage = { label: string; href: string };

export async function resolveRecruitmentLiveStage(bridge: HiringBridgeStatus): Promise<RecruitmentLiveStage | null> {
  switch (bridge.stage) {
    case "not_invited":
      return null; // no live-stage badge beyond the recruitment decision itself yet
    case "invitation_sent":
      return { label: "Pre-Employment — Invitation Sent", href: `/admin/organization/people/${bridge.profileId}` };
    case "account_created":
      return bridge.positionAssigned
        ? { label: "Ready to Start Onboarding", href: `/admin/organization/people/${bridge.profileId}` }
        : { label: "Pre-Employment — Needs Position", href: `/admin/organization/people/${bridge.profileId}` };
    case "onboarding_complete":
      return { label: "Active Employee", href: `/admin/organization/people/${bridge.profileId}` };
    case "onboarding_in_progress": {
      const onboarding = await getStaffOnboardingByProfileId(bridge.profileId);
      if (!onboarding) return { label: "Onboarding", href: `/admin/organization/people/${bridge.profileId}` };
      const href = `/admin/organization/onboarding/${onboarding.id}`;
      if (onboarding.pipeline !== "employee") return { label: "Onboarding — Documents Pending", href };

      const readiness = await checkEmployeeAgreementReadiness(onboarding.id);
      const agreementStatus = await resolveEmploymentAgreementStatus(
        onboarding.id,
        readiness.ok ? readiness.ready : null,
        readiness.ok ? undefined : readiness.error
      );
      if (agreementStatus === "Not Ready") return { label: "Onboarding — Documents / Agreement Pending", href };
      if (agreementStatus === "Ready to Draft") return { label: "Onboarding — Agreement Preparation", href };
      if (agreementStatus === "Draft") return { label: "Onboarding — Agreement Pending Signature", href };
      return { label: `Onboarding — Agreement ${agreementStatus}`, href };
    }
  }
}

// Convenience: resolves both the hiring bridge AND the live-stage
// label in one call — used by the Recruitment list, which needs this
// for every accepted application.
export async function resolveRecruitmentLiveStageForApplication(application: { id: string; email: string }): Promise<RecruitmentLiveStage | null> {
  const bridge = await getHiringBridgeStatus(application);
  return resolveRecruitmentLiveStage(bridge);
}

// Jurisdiction capture, application-based hire (Task 5, 2026-09-18) —
// PROPOSES a configured Employment Jurisdiction from the applicant's
// own free-text location field, never silently applies it. Only ever
// returns a jurisdiction that is a real, configured
// employment_jurisdictions row (never invents one, never infers from
// nationality/IP), and only when the match is genuinely unambiguous
// (exactly one configured jurisdiction's name appears in the text) —
// an authorized user must still see and explicitly confirm it via the
// existing required Employment Jurisdiction selector before a
// requisition can be created.
export function proposeJurisdictionFromLocationText(
  locationText: string | null,
  jurisdictions: { id: string; name: string }[]
): { id: string; name: string } | null {
  if (!locationText) return null;
  const normalized = locationText.toLowerCase();
  const matches = jurisdictions.filter((j) => normalized.includes(j.name.toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}

export async function proposeJurisdictionForProfile(
  profileId: string,
  jurisdictions: { id: string; name: string }[]
): Promise<{ id: string; name: string } | null> {
  const sourceApplicationId = await getSourceRecruitmentApplicationId(profileId);
  if (!sourceApplicationId) return null;
  const application = await getRecruitmentApplication(sourceApplicationId);
  if (!application) return null;
  return proposeJurisdictionFromLocationText(application.location, jurisdictions);
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
