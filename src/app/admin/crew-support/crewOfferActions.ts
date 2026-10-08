"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { sendCrewOffer, setCrewInstructions, withdrawOrReleaseSlot } from "@/lib/crewSupport/crewOffers";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

async function authorize() {
  const user = await getCurrentUser();
  return canManageCrewSupport(user) && user ? user : null;
}
const DENIED = "You don't have permission to manage Crew Support requests.";
function refresh(requestId: string) {
  revalidatePath(`/admin/crew-support/${requestId}`);
  revalidatePath("/admin/crew-support");
}

// Staff OFFER a job. The person is not assigned until they accept it
// themselves in their portal.
export async function sendCrewOfferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  const overrideProfileId = String(formData.get("overrideProfileId") ?? "") || null;
  const assigneeProfileId = overrideProfileId ?? String(formData.get("assigneeProfileId") ?? "");
  if (!assigneeProfileId) return actionFail("Choose who to offer the job to.");
  return runAction(async () => {
    const r = await sendCrewOffer({
      slotId: String(formData.get("slotId") ?? ""), assigneeProfileId,
      amount: Number(String(formData.get("amount") ?? "")), currency: String(formData.get("currency") ?? "").toUpperCase(), message: String(formData.get("message") ?? ""),
      overrideReason: overrideProfileId ? String(formData.get("overrideReason") ?? "").trim() || null : null, actorUserId: user.id,
    });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    const base = r.suppressedTest ? "Offer recorded. This is a QA/test record, so the crew member was not emailed." : "Offer sent. The person is not assigned until they accept it in their portal.";
    return actionOk(r.warnings.length ? `${base} Note: ${r.warnings.join(" ")}` : base);
  }, "send crew offer");
}

export async function withdrawOrReleaseSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await withdrawOrReleaseSlot({ slotId: String(formData.get("slotId") ?? ""), reason: String(formData.get("reason") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk(r.wasAccepted ? "The crew member was released and the slot is open again." : "Offer withdrawn.");
  }, "withdraw offer");
}

export async function setCrewInstructionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = String(formData.get("requestId") ?? "");
  return runAction(async () => {
    const r = await setCrewInstructions({ slotId: String(formData.get("slotId") ?? ""), text: String(formData.get("instructions") ?? ""), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Instructions saved. The crew member sees them in their assignment once they have accepted.");
  }, "set crew instructions");
}
