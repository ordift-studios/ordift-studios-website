"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { updateRecruitmentApplicationStatus, getRecruitmentFileSignedUrl } from "@/lib/recruitment/adminData";
import { logActivity } from "@/lib/admin/activityLog";
import type { RecruitmentStatus } from "@/lib/recruitment/types";

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

    revalidatePath(`/admin/recruitment/${applicationId}`);
    revalidatePath("/admin/recruitment");
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
