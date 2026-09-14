"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { submitLeaveRequest } from "@/lib/organization/leaveRequests";

// Employee Self-Service — My Leave (Phase B5 Step 13, 2026-09-14). Only
// ever submits on the caller's OWN behalf — profileId is always
// currentUser.id, never taken from the form, so this action can never
// be used to submit a request for someone else regardless of what a
// tampered request body contains.

export type ActionState = { ok: boolean; error?: string } | null;

export async function submitOwnLeaveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const daysRequested = Number(formData.get("daysRequested") ?? "");
  const halfAllocationRaw = String(formData.get("halfAllocation") ?? "");
  const halfAllocation = halfAllocationRaw === "H1" || halfAllocationRaw === "H2" ? halfAllocationRaw : null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const certificateReference = String(formData.get("certificateReference") ?? "").trim() || null;

  if (!leaveTypeId || !startDate || !endDate || !(daysRequested > 0)) return { ok: false, error: "Invalid request." };

  const result = await submitLeaveRequest({
    profileId: currentUser.id,
    leaveTypeId,
    startDate,
    endDate,
    daysRequested,
    halfAllocation,
    reason,
    certificateReference,
    actorUserId: currentUser.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}
