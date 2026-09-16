"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { updateRecruitmentApplicationStatus, getRecruitmentFileSignedUrl, getRecruitmentApplication } from "@/lib/recruitment/adminData";
import { logActivity } from "@/lib/admin/activityLog";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteCollaboratorAction } from "@/app/admin/users/actions";
import type { RecruitmentStatus } from "@/lib/recruitment/types";
import { sendRecruitmentNotification, type RecruitmentNotificationEvent } from "@/lib/notifications/recruitmentNotification";

async function requireRecruitmentAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type UpdateStatusState = { ok: boolean; error?: string } | null;

export async function updateApplicationStatusAction(
  _prevState: UpdateStatusState,
  formData: FormData
): Promise<UpdateStatusState> {
  try {
    const user = await requireRecruitmentAdmin();
    const applicationId = String(formData.get("applicationId") ?? "");
    const status = String(formData.get("status") ?? "") as RecruitmentStatus;
    if (!applicationId || !status) return { ok: false, error: "Invalid request." };

    const result = await updateRecruitmentApplicationStatus(applicationId, status, user.id);
    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({
      actorUserId: user.id,
      action: "recruitment.status_changed",
      entityType: "recruitment_application",
      entityId: applicationId,
      metadata: { status },
    });

    const NOTIFIABLE_STATUSES = new Set<RecruitmentStatus>(["shortlisted", "interview", "accepted", "rejected"]);
    if (NOTIFIABLE_STATUSES.has(status)) {
      const application = await getRecruitmentApplication(applicationId);
      if (application?.email) {
        void sendRecruitmentNotification({ applicantEmail: application.email, event: status as RecruitmentNotificationEvent, applicationId });
      }
    }

    revalidatePath(`/admin/recruitment/${applicationId}`);
    revalidatePath("/admin/recruitment");
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Careers -> Vendor bridge (Vendor Completion Phase, 2026-09-15) — the
// controlled admin action the Vendor Readiness Audit found missing.
// /careers' Role/Department = "Other" and Engagement = "Other" (both
// deliberately unspecial-cased, per recruitment/types.ts) remain a
// SAFE, generic intake — this action is the one deliberate place an
// admin converts a specific application to a vendor account, never an
// automatic inference from "Other"/"Other" alone. Reuses
// inviteCollaboratorAction() verbatim (the real, tested invitation
// mechanism — Auth invite email, user_roles, staff_details,
// classification/member-number) rather than duplicating any of it;
// this action's only job is to supply that function's FormData from
// the application's own fields and force role=vendor/
// engagementType=vendor_supplier, which a generic "Invite Collaborator"
// form would otherwise leave to free admin choice. Idempotent by
// construction: a second attempt for the same email fails at
// inviteUserByEmail() (Supabase rejects a duplicate email) — this
// function surfaces that failure rather than creating a second
// account, and never marks staff status or a formal employee position
// (role=vendor only, never any employee-track role; engagementTypeId
// resolves to vendor_supplier only, never a position/grade/department
// assignment — those never appear in inviteCollaboratorAction's own
// write set at all).
export async function convertApplicationToVendorAction(
  _prevState: UpdateStatusState,
  formData: FormData
): Promise<UpdateStatusState> {
  try {
    const user = await requireRecruitmentAdmin();
    const applicationId = String(formData.get("applicationId") ?? "");
    if (!applicationId) return { ok: false, error: "Invalid request." };

    const application = await getRecruitmentApplication(applicationId);
    if (!application) return { ok: false, error: "Application not found." };

    const admin = createAdminClient();
    const [{ data: vendorRole }, { data: vendorEngagementType }, { data: vendorClassification }] = await Promise.all([
      admin.from("roles").select("id").eq("slug", "vendor").single(),
      admin.from("engagement_types").select("id").eq("slug", "vendor_supplier").single(),
      admin.from("member_number_classifications").select("id").eq("slug", "vendor").single(),
    ]);
    if (!vendorRole || !vendorEngagementType || !vendorClassification) {
      return { ok: false, error: "Vendor role/engagement type/classification reference data is missing — cannot convert." };
    }

    const inviteFormData = new FormData();
    inviteFormData.set("email", application.email);
    inviteFormData.set("fullName", application.fullName);
    inviteFormData.set("role", "vendor");
    inviteFormData.set("engagementTypeId", vendorEngagementType.id);
    inviteFormData.set("classificationId", vendorClassification.id);
    const inviteResult = await inviteCollaboratorAction(inviteFormData);
    if (inviteResult.error) return { ok: false, error: inviteResult.error };

    // Reads back the profile the invite just created — inviteCollaboratorAction
    // itself doesn't return the new id. Its own "collaborator.invited"
    // activity_log entry (written moments ago, above) is the most
    // direct source: entity_id is the invited profile's id, and
    // metadata.email lets this query find THIS specific invite rather
    // than an unrelated one.
    const { data: recentInvite } = await admin
      .from("activity_log")
      .select("entity_id")
      .eq("action", "collaborator.invited")
      .contains("metadata", { email: application.email })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newProfileId = recentInvite?.entity_id ?? null;

    // Preserves audit history back to the originating application —
    // recruitment_applications carries no dedicated "converted to"
    // column (a schema change out of scope for this phase); the link
    // lives in activity_log instead, this codebase's universal audit
    // trail, exactly as the table's own header comment anticipated.
    await logActivity({
      actorUserId: user.id,
      action: "recruitment_application.converted_to_vendor",
      entityType: "recruitment_application",
      entityId: applicationId,
      metadata: { email: application.email, profileId: newProfileId },
    });

    const statusResult = await updateRecruitmentApplicationStatus(applicationId, "accepted", user.id);
    if (!statusResult.ok) console.error("[recruitment admin] converted to vendor but failed to update application status", statusResult.error);

    revalidatePath(`/admin/recruitment/${applicationId}`);
    revalidatePath("/admin/recruitment");
    revalidatePath("/admin/organization/vendors");
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}

// Generates a short-lived signed URL for a photo/CV on demand — the
// file is never linked to directly; a viewer must be an authorized
// admin at the moment they click, not just whenever the page happened
// to render.
export async function getRecruitmentFileUrlAction(
  applicationId: string,
  file: "photo" | "cv"
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const user = await requireRecruitmentAdmin();
    const url = await getRecruitmentFileSignedUrl(applicationId, file);
    if (!url) return { ok: false, error: "File not found." };

    await logActivity({
      actorUserId: user.id,
      action: file === "photo" ? "recruitment.photo_viewed" : "recruitment.cv_viewed",
      entityType: "recruitment_application",
      entityId: applicationId,
    });

    return { ok: true, url };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
