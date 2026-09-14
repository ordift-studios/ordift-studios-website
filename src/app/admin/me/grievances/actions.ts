"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { submitGrievance, submitSpeakUpReport } from "@/lib/organization/grievances";
import { submitAppeal } from "@/lib/organization/appeals";

// Employee Self-Service — My Grievances, Speak-Up & Appeals (Phase B6
// Step 6, 2026-09-15). Grievances and Speak-Up are deliberately never
// combined into one form or one table — each action below calls its
// own genuinely separate backend function. Every submission is always
// on the caller's own behalf; none of these accept a profileId from
// the form.

export type ActionState = { ok: boolean; error?: string } | null;

export async function submitOwnGrievanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const grievanceType = String(formData.get("grievanceType") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const bypassedManager = formData.get("bypassedManager") === "true";
  if ((grievanceType !== "informal" && grievanceType !== "formal") || !description) return { ok: false, error: "Invalid request." };

  const result = await submitGrievance({ raisedBy: currentUser.id, grievanceType, description, bypassedManager });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/grievances");
  return { ok: true };
}

// Anonymous by choice — reportedBy is only set when the employee opts
// in; submitSpeakUpReport() itself never calls logActivity() when it
// is omitted, so an anonymous report leaves no actor trail at all.
export async function submitOwnSpeakUpReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const description = String(formData.get("description") ?? "").trim();
  const stayAnonymous = formData.get("stayAnonymous") === "true";
  if (!description) return { ok: false, error: "A description is required." };

  const result = await submitSpeakUpReport({ reportedBy: stayAnonymous ? null : currentUser.id, description });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/grievances");
  return { ok: true };
}

export async function submitOwnAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const appealedDecisionType = String(formData.get("appealedDecisionType") ?? "").trim();
  const appealedDecisionReference = String(formData.get("appealedDecisionReference") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const decisionDate = String(formData.get("decisionDate") ?? "").trim() || null;
  if (!appealedDecisionType || !appealedDecisionReference || !reason) return { ok: false, error: "Invalid request." };

  const result = await submitAppeal({ profileId: currentUser.id, appealedDecisionType, appealedDecisionReference, reason, decisionDate, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/grievances");
  return { ok: true };
}
