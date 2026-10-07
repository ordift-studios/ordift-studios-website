"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { setCrewSupportSlot, setCrewSupportStatus } from "@/lib/crewSupport/admin";
import { CREW_SUPPORT_STATUSES, SLOT_STATUSES, STATUS_LABELS, type CrewSupportStatus, type SlotStatus } from "@/lib/crewSupport/config";
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

export async function updateCrewSupportSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user) || !user) return actionFail("You don't have permission to manage Crew Support requests.");
  const slotId = String(formData.get("slotId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const profileId = String(formData.get("assigneeProfileId") ?? "") || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!slotId || !(SLOT_STATUSES as readonly string[]).includes(status)) return actionFail("Choose a valid slot status.");

  return runAction(async () => {
    const result = await setCrewSupportSlot({ slotId, status: status as SlotStatus, assigneeProfileId: profileId, note, actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    if (requestId) revalidatePath(`/admin/crew-support/${requestId}`);
    revalidatePath("/admin/crew-support");
    return actionOk("Crew slot updated.");
  }, "crew support slot");
}
