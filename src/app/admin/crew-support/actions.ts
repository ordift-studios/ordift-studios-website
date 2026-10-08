"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { setCrewSupportStatus, setRequestEquipment } from "@/lib/crewSupport/admin";
import { CREW_SUPPORT_STATUSES, STATUS_LABELS, type CrewSupportStatus } from "@/lib/crewSupport/config";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

export async function updateCrewSupportStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user) || !user) return actionFail("You don't have permission to manage Crew Support requests.");
  const requestId = String(formData.get("requestId") ?? "");
  const to = String(formData.get("status") ?? "");
  if (!requestId || !(CREW_SUPPORT_STATUSES as readonly string[]).includes(to)) return actionFail("Choose a valid status.");

  return runAction(async () => {
    const result = await setCrewSupportStatus({ requestId, to: to as CrewSupportStatus, actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    revalidatePath(`/admin/crew-support/${requestId}`);
    revalidatePath("/admin/crew-support");
    const note = result.warnings?.length ? ` Note: ${result.warnings.join(" ")}` : "";
    return actionOk(`Status updated to “${STATUS_LABELS[to as CrewSupportStatus]}”.${note}`);
  }, "crew support status");
}

export async function setRequestEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user) || !user) return actionFail("You don't have permission to manage Crew Support requests.");
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const result = await setRequestEquipment({ requestId, value: String(formData.get("equipment") ?? ""), actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    revalidatePath(`/admin/crew-support/${requestId}`);
    return actionOk("Equipment responsibility saved on the request.");
  }, "set equipment");
}
