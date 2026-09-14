"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { recordEmployingEntitySensitiveDetails, addEmployingEntityDocument } from "@/lib/organization/legalEntities";

export type ActionState = { ok: boolean; error?: string } | null;

async function requireSuperAdminActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser)) return { error: "Only Super Admin may view or edit this." };
  return { id: currentUser.id };
}

export async function recordSensitiveDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const entityId = String(formData.get("entityId") ?? "");
  const registrationNumber = String(formData.get("registrationNumber") ?? "").trim() || null;
  const taxIdentifier = String(formData.get("taxIdentifier") ?? "").trim() || null;
  const registeredAddress = String(formData.get("registeredAddress") ?? "").trim() || null;
  if (!entityId) return { ok: false, error: "Invalid request." };

  const result = await recordEmployingEntitySensitiveDetails({ entityId, registrationNumber, taxIdentifier, registeredAddress, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

export async function uploadEntityDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const entityId = String(formData.get("entityId") ?? "");
  const documentType = String(formData.get("documentType") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const file = formData.get("file");
  if (!entityId || !documentType) return { ok: false, error: "A document type and file are required." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "A file is required." };

  const result = await addEmployingEntityDocument({ entityId, documentType, file, notes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}
