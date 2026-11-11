"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { markInstalmentPaid, recordAcquisitionBundle, recordAcquisitionPayment, recordEquipmentAcquisition, setAcquisitionTerms, voidAcquisitionPayment, voidEquipmentAcquisition } from "@/lib/organization/equipmentFinancing";
import { linkAcquisitionToAsset, recordAssetOwnership, recordFounderAssetOwnership, unlinkAcquisitionFromAsset, voidAssetOwnership } from "@/lib/organization/assetReconciliation";
import { parseAcquisitionForm, parseMarkPaidForm, parsePaymentForm, parseTermsForm, parseVoidAcquisitionForm, parseVoidPaymentForm } from "@/lib/organization/equipmentForms";

// Equipment & Financing server actions. Super Admin only, re-checked on EVERY call (and again inside the library and the database function).
// Nothing here creates an expense, a journal or a bank reconciliation; "paid" means reported/evidenced, never bank-verified.
export type ActionState = { ok: boolean; error?: string } | null;

async function requireSuperAdminActor(): Promise<{ id: string } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Not authenticated." };
  if (!isSuperAdmin(u)) return { error: "Only Super Admin may view or edit this." };
  return { id: u.id };
}
const refresh = (entityId: string) => revalidatePath(`/admin/organization/legal-entities/${entityId}/equipment`);

// A financed purchase keeps its own atomic path (purchase + agreement + instalments in one database call). A NON-financed purchase with terms and/or a first payment is ONE atomic database call too
// (purchase + terms + payment: all or nothing). A plain purchase left "to be confirmed" uses the original call. So no half-recorded purchase can be created by this form.
export async function recordEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseAcquisitionForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = p.financing || (!p.terms && !p.payment)
    ? await recordEquipmentAcquisition({ actorUserId: actor.id, acquisition: p.acquisition, financing: p.financing })
    : await recordAcquisitionBundle({ actorUserId: actor.id, acquisition: p.acquisition, terms: p.terms, payment: p.payment });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.acquisition.entityId);
  return { ok: true };
}

export async function markInstalmentPaidAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseMarkPaidForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await markInstalmentPaid({ actorUserId: actor.id, entityId: p.entityId, instalmentId: p.instalmentId, paidOn: p.paidOn, evidenceDocumentId: p.evidenceDocumentId, evidenceNote: p.evidenceNote });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.entityId);
  return { ok: true };
}

export async function setTermsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseTermsForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await setAcquisitionTerms({ actorUserId: actor.id, entityId: p.entityId, acquisitionId: p.acquisitionId, terms: p.terms });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.entityId);
  return { ok: true };
}

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parsePaymentForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await recordAcquisitionPayment({ actorUserId: actor.id, entityId: p.entityId, acquisitionId: p.acquisitionId, payment: p.payment });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.entityId);
  return { ok: true };
}

export async function voidPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseVoidPaymentForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await voidAcquisitionPayment({ actorUserId: actor.id, entityId: p.entityId, paymentId: p.paymentId, reason: p.reason });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.entityId);
  return { ok: true };
}

export async function voidAcquisitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseVoidAcquisitionForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await voidEquipmentAcquisition({ actorUserId: actor.id, entityId: p.entityId, acquisitionId: p.acquisitionId, reason: p.reason });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.entityId);
  return { ok: true };
}

// ---- asset ownership and the acquisition ↔ asset link (migration 0188). The asset register is never edited; each action is one audited database call.
const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export async function recordOwnershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = field(formData, "entityId");
  if (!entityId) return { ok: false, error: "Invalid request." };
  const r = await recordAssetOwnership({ actorUserId: actor.id, ownership: { assetId: field(formData, "assetId"), entityId, purchaserAsStated: field(formData, "purchaserAsStated") || null, businessPurpose: field(formData, "businessPurpose"),
    incidentalPersonalUse: field(formData, "incidentalPersonalUse") === "yes", personalUseNote: field(formData, "personalUseNote") || null, basisStatement: field(formData, "basisStatement"), evidenceDocumentId: field(formData, "evidenceDocumentId") || null } });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(entityId);
  return { ok: true };
}
export async function voidOwnershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = field(formData, "entityId");
  if (!entityId || !field(formData, "ownershipId")) return { ok: false, error: "Invalid request." };
  const r = await voidAssetOwnership({ actorUserId: actor.id, entityId, ownershipId: field(formData, "ownershipId"), reason: field(formData, "reason") });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(entityId);
  return { ok: true };
}
export async function linkAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = field(formData, "entityId");
  if (!entityId || !field(formData, "acquisitionId") || !field(formData, "assetId")) return { ok: false, error: "Choose the registered asset to link." };
  if (field(formData, "confirmLink") !== "yes") return { ok: false, error: "Tick the box to confirm this links the purchase to the EXISTING asset (no new asset is created and the asset record is not edited)." };
  const r = await linkAcquisitionToAsset({ actorUserId: actor.id, entityId, acquisitionId: field(formData, "acquisitionId"), assetId: field(formData, "assetId") });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(entityId);
  return { ok: true };
}

export async function recordFounderOwnershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = field(formData, "entityId");
  if (!entityId) return { ok: false, error: "Invalid request." };
  const r = await recordFounderAssetOwnership({ actorUserId: actor.id, ownership: { assetId: field(formData, "assetId"), entityId, purchaserAsStated: field(formData, "purchaserAsStated") || null, primaryUserAsStated: field(formData, "primaryUserAsStated") || null,
    financingObligorAsStated: field(formData, "financingObligorAsStated") || null, businessPurpose: field(formData, "businessPurpose"), companyFunded: field(formData, "companyFunded") === "yes", basisStatement: field(formData, "basisStatement"), evidenceDocumentId: field(formData, "evidenceDocumentId") || null } });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(entityId);
  return { ok: true };
}
export async function unlinkAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const entityId = field(formData, "entityId");
  if (!entityId || !field(formData, "acquisitionId")) return { ok: false, error: "Invalid request." };
  const r = await unlinkAcquisitionFromAsset({ actorUserId: actor.id, entityId, acquisitionId: field(formData, "acquisitionId"), reason: field(formData, "reason") });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(entityId);
  return { ok: true };
}

