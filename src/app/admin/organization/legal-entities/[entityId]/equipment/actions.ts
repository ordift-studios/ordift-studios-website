"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { markInstalmentPaid, recordEquipmentAcquisition } from "@/lib/organization/equipmentFinancing";
import { parseAcquisitionForm, parseMarkPaidForm } from "@/lib/organization/equipmentForms";

// Equipment & Financing server actions. Super Admin only, re-checked on EVERY call (and again inside the library and the database function).
// Nothing here creates an expense, a journal or a bank reconciliation; "paid" means reported/evidenced, never bank-verified.
export type ActionState = { ok: boolean; error?: string } | null;

async function requireSuperAdminActor(): Promise<{ id: string } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Not authenticated." };
  if (!isSuperAdmin(u)) return { error: "Only Super Admin may view or edit this." };
  return { id: u.id };
}

export async function recordEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseAcquisitionForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await recordEquipmentAcquisition({ actorUserId: actor.id, acquisition: p.acquisition, financing: p.financing });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/admin/organization/legal-entities/${p.acquisition.entityId}/equipment`);
  return { ok: true };
}

export async function markInstalmentPaidAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const p = parseMarkPaidForm(formData);
  if (!p.ok) return { ok: false, error: p.error };
  const r = await markInstalmentPaid({ actorUserId: actor.id, entityId: p.entityId, instalmentId: p.instalmentId, paidOn: p.paidOn, evidenceDocumentId: p.evidenceDocumentId, evidenceNote: p.evidenceNote });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/admin/organization/legal-entities/${p.entityId}/equipment`);
  return { ok: true };
}
