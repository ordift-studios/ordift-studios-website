"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { updatePulseSourceAdmin } from "@/lib/content/sanity/pulseAdmin";
import { logActivity } from "@/lib/admin/activityLog";
import type { PulseEditorialTrustLevel, PulsePermissionClassification } from "@/lib/content/types";

async function requirePulseAdmin() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type UpdateSourceState = { ok: boolean; error?: string } | null;

export async function updatePulseSourceAction(_prevState: UpdateSourceState, formData: FormData): Promise<UpdateSourceState> {
  try {
    const user = await requirePulseAdmin();
    const sourceId = String(formData.get("sourceId") ?? "");
    if (!sourceId) return { ok: false, error: "Invalid request." };

    const attributionRequirement = String(formData.get("attributionRequirement") ?? "").trim();
    const lastPolicyReviewDate = String(formData.get("lastPolicyReviewDate") ?? "").trim();

    const result = await updatePulseSourceAdmin(sourceId, {
      isActive: formData.get("isActive") === "on",
      permissionClassification: String(formData.get("permissionClassification") ?? "amber") as PulsePermissionClassification,
      editorialTrustLevel: String(formData.get("editorialTrustLevel") ?? "unverified") as PulseEditorialTrustLevel,
      imageUsePermitted: formData.get("imageUsePermitted") === "on",
      commercialUsePermitted: formData.get("commercialUsePermitted") === "on",
      autoPublishEligible: formData.get("autoPublishEligible") === "on",
      attributionRequirement: attributionRequirement || null,
      lastPolicyReviewDate: lastPolicyReviewDate || null,
    });
    if (!result.ok) return { ok: false, error: result.error };

    await logActivity({
      actorUserId: user.id,
      action: "pulse.source_updated",
      entityType: "pulseSource",
      entityId: sourceId,
    });

    revalidatePath(`/admin/pulse/sources/${sourceId}`);
    revalidatePath("/admin/pulse/sources");
    return { ok: true };
  } catch {
    return { ok: false, error: "You are not authorized to do this." };
  }
}
