"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createCrewSupportModifierVersion, createCrewSupportRateVersion, RATE_UNITS, type ModifierSlug, type RateUnit } from "@/lib/crewSupport/rates";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

export async function createCrewSupportRateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");
  const marketSlug = String(formData.get("marketSlug") ?? "");
  const titleId = String(formData.get("titleId") ?? "");
  const unitBasis = String(formData.get("unitBasis") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || !titleId || !RATE_UNITS.some((u) => u.value === unitBasis) || !Number.isFinite(priceUsd) || priceUsd <= 0) return actionFail("Choose a capability and unit, and enter a price above zero.");
  return runAction(async () => {
    const r = await createCrewSupportRateVersion({ marketSlug, titleId, unitBasis: unitBasis as RateUnit, priceUsd, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/pricing");
    return actionOk(r.unchanged ? "No change — that rate is already active." : "Saved — new rate version is now active.");
  }, "crew support rate");
}

export async function createCrewSupportModifierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");
  const marketSlug = String(formData.get("marketSlug") ?? "") || null;
  const slug = String(formData.get("modifierSlug") ?? "");
  const percentage = Number(formData.get("percentage"));
  if ((slug !== "urgent_uplift_percent" && slug !== "overtime_uplift_percent") || !Number.isFinite(percentage) || percentage <= 0) return actionFail("Choose a modifier and enter a percentage above zero.");
  return runAction(async () => {
    const r = await createCrewSupportModifierVersion({ slug: slug as ModifierSlug, marketSlug, percentage, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/pricing");
    return actionOk(r.unchanged ? "No change — that value is already active." : "Saved — new modifier version is now active.");
  }, "crew support modifier");
}
