"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import type { RoleSlug } from "@/lib/portal/roles";
import {
  canManageSeparationCases,
  acknowledgeSeparationCase,
  confirmLastWorkingDate,
  resolveNoticePolicy,
  updateFinalSettlementStatus,
  cancelSeparationCase,
  finalizeSeparationClearance,
  type NoticePolicySource,
  type FinalSettlementStatus,
} from "@/lib/organization/separationCases";
import { updateSeparationRequirement, type RequirementStatus } from "@/lib/organization/separationRequirements";
import { listUsersWithRoles } from "@/lib/portal/adminData";

// Separation/Clearance Workspace actions (E.5 Stage 2J). Same coarse
// authorization boundary as every onboarding action (Super Admin, or a
// holder of operations.administer) via canManageSeparationCases() — no
// new authorization concept, no standing authority granted here. The
// real gating (final-clearance safety) lives inside
// finalizeSeparationClearance() itself, not in this file.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageSeparationCases(currentUser.id))) return { error: "Not authorized to manage separation cases." };
  return { id: currentUser.id };
}

async function rolesForProfile(profileId: string): Promise<RoleSlug[]> {
  const result = await listUsersWithRoles();
  if (!result.ok) return [];
  return result.users.find((u) => u.id === profileId)?.roles ?? [];
}

export async function acknowledgeSeparationCaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  if (!separationCaseId) return { ok: false, error: "Invalid request." };
  const result = await acknowledgeSeparationCase({ separationCaseId, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

export async function confirmLastWorkingDateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!separationCaseId || !date) return { ok: false, error: "Choose a date." };
  const result = await confirmLastWorkingDate({ separationCaseId, date, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

export async function resolveNoticePolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const source = String(formData.get("source") ?? "") as NoticePolicySource;
  const reference = String(formData.get("reference") ?? "").trim() || undefined;
  const requiredDaysRaw = String(formData.get("requiredDays") ?? "").trim();
  const requiredDays = requiredDaysRaw ? Number(requiredDaysRaw) : undefined;
  if (!separationCaseId || !source) return { ok: false, error: "Invalid request." };
  const result = await resolveNoticePolicy({ separationCaseId, source, reference, requiredDays, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

export async function updateFinalSettlementStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const status = String(formData.get("status") ?? "") as FinalSettlementStatus;
  const reference = String(formData.get("reference") ?? "").trim() || undefined;
  if (!separationCaseId || !status) return { ok: false, error: "Invalid request." };
  const result = await updateFinalSettlementStatus({ separationCaseId, status, reference, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

export async function cancelSeparationCaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!separationCaseId) return { ok: false, error: "Invalid request." };
  const result = await cancelSeparationCase({ separationCaseId, actorUserId: actor.id, reason });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

export async function finalizeSeparationClearanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  if (!separationCaseId || !profileId) return { ok: false, error: "Invalid request." };
  const roles = await rolesForProfile(profileId);
  const result = await finalizeSeparationClearance({ separationCaseId, roles, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}

const REQUIREMENT_STATUSES: readonly RequirementStatus[] = ["pending", "satisfied", "waived", "not_applicable"];

export async function updateSeparationRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const requirementKey = String(formData.get("requirementKey") ?? "");
  const status = String(formData.get("status") ?? "") as RequirementStatus;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const verifiedNow = formData.get("verifiedNow") === "on";
  if (!separationCaseId || !profileId || !requirementKey || !REQUIREMENT_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid request." };
  }
  const roles = await rolesForProfile(profileId);
  const result = await updateSeparationRequirement({ separationCaseId, roles, requirementKey, status, actorUserId: actor.id, notes, verifiedNow });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}`);
  return { ok: true };
}
