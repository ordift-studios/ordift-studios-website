"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { recordEmployingEntitySensitiveDetails, getEmployingEntityDocumentSignedUrl } from "@/lib/organization/legalEntities";
import { addVaultDocument, chooseContractingEntity, confirmApprovalNoticeDate, confirmExpenseFunding, recordCommercialPermit } from "@/lib/organization/entityRegistrations";

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
  const issuedOn = String(formData.get("issuedOn") ?? "").trim() || null;
  const expiresOn = String(formData.get("expiresOn") ?? "").trim() || null;
  const issuingAuthority = String(formData.get("issuingAuthority") ?? "").trim() || null;
  const replaces = String(formData.get("replaces") ?? "").trim() || null;
  const file = formData.get("file");
  if (!entityId || !documentType) return { ok: false, error: "A document type and file are required." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "A file is required." };

  const result = await addVaultDocument({ entityId, documentType, filename: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), notes, issuedOn, expiresOn, issuingAuthority, replaces, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

export async function recordPermitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  if (!entityId) return { ok: false, error: "Invalid request." };
  const result = await recordCommercialPermit({
    entityId, permitNumber: String(formData.get("permitNumber") ?? ""), licenceNumber: String(formData.get("licenceNumber") ?? "").trim() || null, issuedOn: String(formData.get("issuedOn") ?? ""), expiresOn: String(formData.get("expiresOn") ?? "").trim() || null,
    issuingAuthority: String(formData.get("issuingAuthority") ?? ""), premisesAddress: String(formData.get("premisesAddress") ?? ""), sourceDocumentId: String(formData.get("sourceDocumentId") ?? ""), actorUserId: actor.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

export async function confirmApprovalNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  if (!entityId) return { ok: false, error: "Invalid request." };
  const result = await confirmApprovalNoticeDate({ entityId, approvalNoticeDate: String(formData.get("approvalNoticeDate") ?? ""), source: String(formData.get("source") ?? ""), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

export async function confirmFundingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!entityId || !["company_account", "founder_personal", "other_verified"].includes(status)) return { ok: false, error: "Choose who funded it." };
  const result = await confirmExpenseFunding({ entityId, receiptNumber: String(formData.get("receiptNumber") ?? ""), status: status as "company_account" | "founder_personal" | "other_verified", note: String(formData.get("note") ?? ""), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

// Server-mediated retrieval only — never a stored/public URL. Re-checks
// Super Admin on every call (defense in depth: the page itself already
// gates Super Admin, but a document id could otherwise be replayed
// directly against this action) and issues a fresh, short-lived signed
// URL (getEmployingEntityDocumentSignedUrl, 5-minute TTL) each time,
// redirecting the browser straight to it rather than persisting or
// returning the URL as page state (Mishael Adjei reconciliation, Part K,
// 2026-09-15).
export async function viewEntityDocumentAction(formData: FormData): Promise<void> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return;

  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  const url = await getEmployingEntityDocumentSignedUrl(documentId, actor.id);
  if (!url) return;
  redirect(url);
}

export async function chooseContractingEntityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const requestId = String(formData.get("requestId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!requestId || !entityId) return { ok: false, error: "Choose the contracting entity." };
  const result = await chooseContractingEntity({ subject: { type: "crew_support_request", id: requestId }, entityId, basis: String(formData.get("basis") ?? ""), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/crew-support/${requestId}`);
  return { ok: true };
}
