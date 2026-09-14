"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageSeparationCases, getSeparationCaseById } from "@/lib/organization/separationCases";
import {
  createFinalSettlement,
  updateFinalSettlementComponents,
  addFinalSettlementDeduction,
  advanceFinalSettlementStatus,
  type FinalSettlementComponents,
  type FinalSettlementDecision,
} from "@/lib/organization/finalSettlements";

// Final Settlement workspace actions (Phase B5 Step 4, 2026-09-14).
// Same coarse authorization boundary as every separation action.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageSeparationCases(currentUser.id))) return { error: "Not authorized to manage final settlements." };
  return { id: currentUser.id };
}

export async function createFinalSettlementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  if (!separationCaseId) return { ok: false, error: "Invalid request." };
  const separationCase = await getSeparationCaseById(separationCaseId);
  if (!separationCase) return { ok: false, error: "Separation case not found." };

  const result = await createFinalSettlement({ separationCaseId, profileId: separationCase.profileId, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}/final-settlement`);
  return { ok: true };
}

const COMPONENT_FIELDS: (keyof FinalSettlementComponents)[] = [
  "salaryThroughFinalWorkingDay",
  "outstandingEarningsOvertime",
  "annualLeaveSettlement",
  "approvedReimbursements",
  "noticePilonAmount",
  "otherLawfulEntitlements",
];

export async function updateFinalSettlementComponentsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const finalSettlementId = String(formData.get("finalSettlementId") ?? "");
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  if (!finalSettlementId) return { ok: false, error: "Invalid request." };

  const components: FinalSettlementComponents = {};
  for (const field of COMPONENT_FIELDS) {
    const raw = String(formData.get(field) ?? "").trim();
    if (raw) components[field] = Number(raw);
  }

  const result = await updateFinalSettlementComponents({ finalSettlementId, components, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}/final-settlement`);
  return { ok: true };
}

export async function addFinalSettlementDeductionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const finalSettlementId = String(formData.get("finalSettlementId") ?? "");
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const classification = String(formData.get("classification") ?? "").trim();
  const basis = String(formData.get("basis") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  const supportingRecordReference = String(formData.get("supportingRecordReference") ?? "").trim() || undefined;

  if (!finalSettlementId || !profileId || !classification || !basis || !(amount > 0)) return { ok: false, error: "All fields except the supporting record reference are required." };

  const result = await addFinalSettlementDeduction({ finalSettlementId, profileId, classification, basis, amount, supportingRecordReference, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}/final-settlement`);
  return { ok: true };
}

export async function advanceFinalSettlementStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const finalSettlementId = String(formData.get("finalSettlementId") ?? "");
  const separationCaseId = String(formData.get("separationCaseId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as FinalSettlementDecision;
  if (!finalSettlementId || !["submitted", "approved", "paid"].includes(toStatus)) return { ok: false, error: "Invalid request." };

  const result = await advanceFinalSettlementStatus({ finalSettlementId, toStatus, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/separation/${separationCaseId}/final-settlement`);
  return { ok: true };
}
