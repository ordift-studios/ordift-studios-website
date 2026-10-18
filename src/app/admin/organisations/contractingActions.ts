"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { chooseContractingEntity } from "@/lib/organization/entityRegistrations";
import { actionFail, actionOk, type ActionState } from "@/lib/shared/actionState";

// Choose the Ordift legal entity that contracts for an ordinary enquiry or quotation. Super Admin only, explicit, append-only and audited: the existing
// chooseContractingEntity() does the work and refuses a historical record. The entity is never inferred from currency, nationality or location, and
// recording it changes nothing else (no quotation, amount, payment, obligation, stage or email).
export async function chooseOrdinaryContractingEntityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can choose the contracting entity.");
  const type = String(formData.get("subjectType") ?? "");
  const id = String(formData.get("subjectId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if ((type !== "enquiry" && type !== "quotation") || !id) return actionFail("Missing record.");
  if (!entityId) return actionFail("Choose the contracting entity.");
  const result = await chooseContractingEntity({ subject: { type, id }, entityId, basis: String(formData.get("basis") ?? ""), actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(type === "enquiry" ? `/admin/enquiries/${id}` : `/admin/pricing/quotations/${id}`);
  return actionOk("Contracting entity recorded. Nothing else was changed.");
}
