"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { recordEmployingEntitySensitiveDetails, getEmployingEntityDocumentSignedUrl } from "@/lib/organization/legalEntities";
import { addVaultDocument, chooseContractingEntity, confirmApprovalNoticeDate, confirmExpenseFunding, recordCommercialPermit, recordEntityRegistration, linkSignatoryToFounderIdentity, recordRenewalConfirmation, setSignatoryLegalCapacity, type LegalCapacity } from "@/lib/organization/entityRegistrations";

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
  // a further page (2 or more) of a multi-page official form: attaches to page 1 of the SAME document; page 1 is never touched
  const pageOf = String(formData.get("pageOf") ?? "").trim() || null;
  const pageNumber = Number(formData.get("pageNumber") ?? 0);
  const pageCount = Number(formData.get("pageCount") ?? 0);
  const file = formData.get("file");
  if (!entityId || !documentType) return { ok: false, error: "A document type and file are required." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "A file is required." };

  const result = await addVaultDocument({ entityId, documentType, filename: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), notes, issuedOn, expiresOn, issuingAuthority, replaces, ...(pageOf ? { continuationOf: { documentId: pageOf, pageNumber, pageCount } } : {}), actorUserId: actor.id });
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

// Records a legal / tax registration from its official document (number checked against the jurisdiction's own format; nothing generated; duplicates refused).
export async function recordRegistrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "commercial_registration" && kind !== "tax_registration") return { ok: false, error: "Choose which registration this is." };
  const result = await recordEntityRegistration({
    entityId, kind, identifier: String(formData.get("identifier") ?? ""), issuedOn: String(formData.get("issuedOn") ?? "").trim() || null, expiresOn: String(formData.get("expiresOn") ?? "").trim() || null,
    issuingAuthority: String(formData.get("issuingAuthority") ?? ""), sourceDocumentId: String(formData.get("sourceDocumentId") ?? ""), founderCrossChecked: formData.get("founderCrossChecked") === "on", actorUserId: actor.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

// Records the LEGAL capacity of an existing signatory (once). The management title is not changed and no person is duplicated.
export async function setSignatoryCapacityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  const result = await setSignatoryLegalCapacity({ signatoryId: String(formData.get("signatoryId") ?? ""), capacity: String(formData.get("capacity") ?? "") as LegalCapacity, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

// Records an annual renewal confirmation: a Founder statement is stored as exactly that; an official verification needs the Registrar's record or a certificate/receipt.
export async function recordRenewalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  const status = String(formData.get("status") ?? "") as "founder_confirmed" | "official_verified" | "lapsed";
  const result = await recordRenewalConfirmation({
    entityId, registrationId: String(formData.get("registrationId") ?? ""), coversFrom: String(formData.get("coversFrom") ?? ""), coversTo: String(formData.get("coversTo") ?? ""), status,
    basis: String(formData.get("basis") ?? "") as "founder_statement" | "official_registry_check" | "renewal_certificate_or_receipt", statement: String(formData.get("statement") ?? "") || null,
    officialReference: String(formData.get("officialReference") ?? "") || null, nextDueOn: String(formData.get("nextDueOn") ?? "") || null, actorUserId: actor.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}

// Links a signatory record to the authoritative Founder identity, once. The person is never chosen here: it is always the active Founder identity.
export async function linkSignatoryToFounderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = String(formData.get("entityId") ?? "");
  const capacity = String(formData.get("capacity") ?? "") as LegalCapacity;
  const result = await linkSignatoryToFounderIdentity({ signatoryId: String(formData.get("signatoryId") ?? ""), entityId, capacity: capacity || null, confirmsSamePerson: formData.get("confirmsSamePerson") === "on", actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/organization/legal-entities/${entityId}`);
  return { ok: true };
}
