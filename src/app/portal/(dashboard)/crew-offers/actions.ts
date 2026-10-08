"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { respondToCrewOffer } from "@/lib/crewSupport/crewOffers";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// The crew member's OWN response. The identity comes from the signed-in
// session — never from the form — so nobody can answer for someone else.
export async function respondToOfferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in again.");
  const slotId = String(formData.get("slotId") ?? "");
  const response = String(formData.get("response") ?? "");
  if (response !== "accept" && response !== "decline") return actionFail("Choose Accept or Decline.");
  if (response === "accept" && formData.get("confirm") !== "on") return actionFail("Please tick the box to confirm you accept this job and the compensation offered.");
  return runAction(async () => {
    const r = await respondToCrewOffer({ slotId, userId: user.id, response, note: String(formData.get("note") ?? "") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/portal/crew-offers");
    revalidatePath(`/portal/crew-offers/${slotId}`);
    return actionOk(r.state === "accepted" ? "You've accepted this job. Ordift will confirm it with the client and be in touch with the details." : "You've declined this job. Thank you for letting us know.");
  }, "respond to crew offer");
}
