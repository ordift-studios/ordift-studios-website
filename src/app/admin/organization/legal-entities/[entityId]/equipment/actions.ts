"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { markInstalmentPaid, recordAcquisitionPayment, recordEquipmentAcquisition, setAcquisitionTerms, voidAcquisitionPayment } from "@/lib/organization/equipmentFinancing";
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

// The purchase is recorded FIRST (one atomic database call). Terms and a first payment follow as separate audited calls: if one of them is refused the purchase stays recorded with the arrangement
// "to be confirmed" and the message says exactly what is missing, so nothing is ever assumed paid.
export async function recordEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseAcquisitionForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await recordEquipmentAcquisition({ actorUserId: actor.id, acquisition: p.acquisition, financing: p.financing });
  if (!r.ok) return { ok: false, error: r.error };
  refresh(p.acquisition.entityId);
  if (p.terms) {
    const t = await setAcquisitionTerms({ actorUserId: actor.id, entityId: p.acquisition.entityId, acquisitionId: r.acquisitionId, terms: p.terms });
    if (!t.ok) return { ok: false, error: `The purchase was recorded, but how it is paid was not: ${t.error} Set it from the purchase's "How is it paid?" section.` };
  }
  if (p.payment) {
    const pay = await recordAcquisitionPayment({ actorUserId: actor.id, entityId: p.acquisition.entityId, acquisitionId: r.acquisitionId, payment: p.payment });
    if (!pay.ok) return { ok: false, error: `The purchase was recorded, but the payment was not: ${pay.error} Add it from the purchase's Payments section.` };
  }
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
