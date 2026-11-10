"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { markInstalmentPaid, recordAcquisitionBundle, recordAcquisitionPayment, recordEquipmentAcquisition, setAcquisitionTerms, voidAcquisitionPayment } from "@/lib/organization/equipmentFinancing";
import { parseAcquisitionForm, parseMarkPaidForm, parsePaymentForm, parseTermsForm, parseVoidPaymentForm } from "@/lib/organization/equipmentForms";

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
