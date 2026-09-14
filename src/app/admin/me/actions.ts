"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { recordPolicyAcknowledgement } from "@/lib/organization/policyAcknowledgements";

// Employee Self-Service — My Workspace landing page (Phase B5 Step 15,
// 2026-09-14). Self-acknowledgement only — recordPolicyAcknowledgement()
// itself still independently verifies the caller isn't acting on
// someone else's behalf, but this action never accepts a profileId
// from the form at all, so it can only ever record for the caller.

export type ActionState = { ok: boolean; error?: string } | null;

export async function acknowledgeOwnPolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const documentVersionId = String(formData.get("documentVersionId") ?? "");
  if (!documentVersionId) return { ok: false, error: "Invalid request." };

  const result = await recordPolicyAcknowledgement({
    profileId: currentUser.id,
    documentVersionId,
    method: "digital_click_through",
    actorUserId: currentUser.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me");
  return { ok: true };
}
