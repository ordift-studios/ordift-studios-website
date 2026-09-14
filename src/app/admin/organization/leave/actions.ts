"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageLeave, decideLeaveRequest, ensureLeaveBalance } from "@/lib/organization/leaveRequests";

// Leave workspace actions (Phase B5 Step 2, 2026-09-14). Same coarse
// authorization boundary as every other HR action in this engagement
// (Super Admin, or a holder of operations.administer) via
// canManageLeave() — no new authorization concept.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageLeave(currentUser.id))) return { error: "Not authorized to manage leave requests." };
  return { id: currentUser.id };
}

export async function decideLeaveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "declined" | "alternative_proposed";
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || undefined;
  const alternativeStartDate = String(formData.get("alternativeStartDate") ?? "").trim() || undefined;
  const alternativeEndDate = String(formData.get("alternativeEndDate") ?? "").trim() || undefined;

  if (!requestId || !["approved", "declined", "alternative_proposed"].includes(decision)) {
    return { ok: false, error: "Invalid request." };
  }
  if (decision === "alternative_proposed" && (!alternativeStartDate || !alternativeEndDate)) {
    return { ok: false, error: "Proposing alternative dates requires both a start and end date." };
  }

  const result = await decideLeaveRequest({ requestId, decision, decisionNotes, alternativeStartDate, alternativeEndDate, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/leave");
  return { ok: true };
}

export async function ensureLeaveBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const profileId = String(formData.get("profileId") ?? "");
  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const leaveYear = Number(formData.get("leaveYear") ?? "");
  const entitlementDays = Number(formData.get("entitlementDays") ?? "");

  if (!profileId || !leaveTypeId || !leaveYear || !(entitlementDays >= 0)) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await ensureLeaveBalance({ profileId, leaveTypeId, leaveYear, entitlementDays });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/leave");
  return { ok: true };
}
