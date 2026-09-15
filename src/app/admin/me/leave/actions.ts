"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { submitLeaveRequest, cancelLeaveRequest } from "@/lib/organization/leaveRequests";
import { submitLeaveBid, type LeaveBiddingHalf } from "@/lib/organization/leaveBidding";
import { proposeLeaveSwap, respondToLeaveSwap, cancelLeaveSwap } from "@/lib/organization/leaveSwap";

// Employee Self-Service — My Leave (Phase B5 Step 13, 2026-09-14;
// Leave Bidding/Swap extension 2026-09-15). Only ever acts on the
// caller's OWN behalf — profileId is always currentUser.id, never
// taken from the form.

export type ActionState = { ok: boolean; error?: string; info?: string } | null;

// A request tagged H1/H2 now genuinely routes through submitLeaveBid()
// — window-validated, day-count independently computed from the real
// working-day calendar, never a bare client-submitted number — instead
// of the plain submitLeaveRequest() path, which remains unchanged for
// every non-bidding leave type (sick, maternity, etc. never use H1/H2
// at all).
export async function submitOwnLeaveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const halfAllocationRaw = String(formData.get("halfAllocation") ?? "");
  const halfAllocation: LeaveBiddingHalf | null = halfAllocationRaw === "H1" || halfAllocationRaw === "H2" ? halfAllocationRaw : null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const certificateReference = String(formData.get("certificateReference") ?? "").trim() || null;

  if (!leaveTypeId || !startDate || !endDate) return { ok: false, error: "Invalid request." };

  if (halfAllocation) {
    const result = await submitLeaveBid({ profileId: currentUser.id, leaveTypeId, startDate, endDate, half: halfAllocation, reason, actorUserId: currentUser.id });
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/admin/me/leave");
    return { ok: true, info: result.drawForwardRequired ? "Submitted. This bid exceeds your remaining planning allocation and will need draw-forward approval." : undefined };
  }

  const daysRequested = Number(formData.get("daysRequested") ?? "");
  if (!(daysRequested > 0)) return { ok: false, error: "Invalid request." };
  const result = await submitLeaveRequest({ profileId: currentUser.id, leaveTypeId, startDate, endDate, daysRequested, halfAllocation: null, reason, certificateReference, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}

export async function cancelOwnLeaveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Invalid request." };
  const result = await cancelLeaveRequest({ requestId, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}

export async function proposeOwnLeaveSwapAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };
  const initiatorLeaveRequestId = String(formData.get("initiatorLeaveRequestId") ?? "");
  const counterpartProfileId = String(formData.get("counterpartProfileId") ?? "");
  const counterpartLeaveRequestId = String(formData.get("counterpartLeaveRequestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!initiatorLeaveRequestId || !counterpartProfileId || !counterpartLeaveRequestId) return { ok: false, error: "Invalid request." };

  const result = await proposeLeaveSwap({
    initiatorProfileId: currentUser.id,
    initiatorLeaveRequestId,
    counterpartProfileId,
    counterpartLeaveRequestId,
    reason,
    actorUserId: currentUser.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}

export async function respondToOwnLeaveSwapAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };
  const swapId = String(formData.get("swapId") ?? "");
  const responseRaw = String(formData.get("response") ?? "");
  if (!swapId || (responseRaw !== "accepted" && responseRaw !== "declined")) return { ok: false, error: "Invalid request." };
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || null;

  const result = await respondToLeaveSwap({ swapId, response: responseRaw, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}

export async function cancelOwnLeaveSwapAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };
  const swapId = String(formData.get("swapId") ?? "");
  if (!swapId) return { ok: false, error: "Invalid request." };
  const result = await cancelLeaveSwap({ swapId, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/leave");
  return { ok: true };
}
