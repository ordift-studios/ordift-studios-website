"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { decideLeaveRequest, ensureLeaveBalance, canManageLeave } from "@/lib/organization/leaveRequests";
import { decideLeaveBid, configureLeaveBiddingWindow, type LeaveBiddingHalf } from "@/lib/organization/leaveBidding";
import { decideLeaveSwap } from "@/lib/organization/leaveSwap";
import type { WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Leave workspace actions (Phase B5 Step 2, 2026-09-14; manager-scoped
// review + Leave Bidding/Swap extension 2026-09-15). The OUTER gate
// here is deliberately coarse (any authenticated staff/admin) — it is
// NEVER the real authorization boundary. Every underlying function
// (decideLeaveRequest/decideLeaveBid/decideLeaveSwap) independently
// re-checks canReviewLeaveRequestFor() (global HR tier OR a genuine
// direct manager) against the SPECIFIC subject(s) involved before any
// write — narrowing this outer gate any further would have blocked a
// legitimate manager from ever reaching that real, subject-aware check.
// configureLeaveBiddingWindow()/ensureLeaveBalance() remain HR/Super-
// Admin-only, unchanged, since window/balance configuration is not a
// per-employee decision a manager should make for their own team.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireStaffActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { error: "Not authenticated." };
  return { id: currentUser.id };
}

export async function decideLeaveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaffActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "declined" | "alternative_proposed";
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || undefined;
  const alternativeStartDate = String(formData.get("alternativeStartDate") ?? "").trim() || undefined;
  const alternativeEndDate = String(formData.get("alternativeEndDate") ?? "").trim() || undefined;
  const isBid = formData.get("isBid") === "true";
  const drawForwardApproved = formData.get("drawForwardApproved") === "true";

  if (!requestId || !["approved", "declined", "alternative_proposed"].includes(decision)) {
    return { ok: false, error: "Invalid request." };
  }
  if (decision === "alternative_proposed" && (!alternativeStartDate || !alternativeEndDate)) {
    return { ok: false, error: "Proposing alternative dates requires both a start and end date." };
  }

  const result = isBid
    ? await decideLeaveBid({ requestId, decision, drawForwardApproved, decisionNotes, alternativeStartDate, alternativeEndDate, actorUserId: actor.id })
    : await decideLeaveRequest({ requestId, decision, decisionNotes, alternativeStartDate, alternativeEndDate, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/leave");
  return { ok: true };
}

export async function ensureLeaveBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaffActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  if (!(await canManageLeave(actor.id))) return { ok: false, error: "Not authorized to manage leave balances." };

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

export async function configureLeaveBiddingWindowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaffActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const jurisdiction = String(formData.get("jurisdiction") ?? "") as WorkforceJurisdiction;
  const leaveYear = Number(formData.get("leaveYear") ?? "");
  const half = String(formData.get("half") ?? "") as LeaveBiddingHalf;
  const planningAllocationDays = Number(formData.get("planningAllocationDays") ?? "");
  const windowOpensAt = String(formData.get("windowOpensAt") ?? "");
  const windowClosesAt = String(formData.get("windowClosesAt") ?? "");
  const drawForwardAllowed = formData.get("drawForwardAllowed") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!jurisdiction || !leaveYear || (half !== "H1" && half !== "H2") || !(planningAllocationDays > 0) || !windowOpensAt || !windowClosesAt) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await configureLeaveBiddingWindow({
    jurisdiction,
    leaveYear,
    half,
    planningAllocationDays,
    windowOpensAt: new Date(windowOpensAt).toISOString(),
    windowClosesAt: new Date(windowClosesAt).toISOString(),
    drawForwardAllowed,
    notes,
    actorUserId: actor.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/leave");
  return { ok: true };
}

export async function decideLeaveSwapAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaffActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const swapId = String(formData.get("swapId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "rejected";
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || undefined;
  if (!swapId || (decision !== "approved" && decision !== "rejected")) return { ok: false, error: "Invalid request." };

  const result = await decideLeaveSwap({ swapId, decision, decisionNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/leave");
  return { ok: true };
}
