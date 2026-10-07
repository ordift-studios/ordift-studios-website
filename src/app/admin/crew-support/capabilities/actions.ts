"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { revokeCapability, setCapability } from "@/lib/crewSupport/capabilities";
import { PROFICIENCIES, type Proficiency } from "@/lib/crewSupport/config";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

export async function setCapabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user) || !user) return actionFail("You don't have permission to manage capabilities.");
  const profileId = String(formData.get("profileId") ?? "");
  const titleId = String(formData.get("titleId") ?? "");
  const proficiency = String(formData.get("proficiency") ?? "");
  const verification = String(formData.get("verification") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !titleId || !(PROFICIENCIES as readonly string[]).includes(proficiency) || (verification !== "verified" && verification !== "self_declared")) {
    return actionFail("Choose a capability, how relevant it is, and its verification status.");
  }
  return runAction(async () => {
    const result = await setCapability({ profileId, titleId, proficiency: proficiency as Proficiency, verification, notes, actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    revalidatePath("/admin/crew-support/capabilities");
    return actionOk(verification === "verified" ? "Capability saved and verified." : "Capability saved as self-declared (not verified).");
  }, "set capability");
}

export async function revokeCapabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user) || !user) return actionFail("You don't have permission to manage capabilities.");
  const capabilityId = String(formData.get("capabilityId") ?? "");
  if (!capabilityId) return actionFail("Nothing to revoke.");
  return runAction(async () => {
    const result = await revokeCapability({ capabilityId, actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    revalidatePath("/admin/crew-support/capabilities");
    return actionOk("Capability revoked.");
  }, "revoke capability");
}
