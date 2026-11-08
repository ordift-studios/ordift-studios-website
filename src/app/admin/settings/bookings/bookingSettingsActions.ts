"use server";

import { revalidatePath } from "next/cache";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { bookingFlagOn } from "@/lib/bookings/rules";
import { recordBookingSettingsVersion } from "@/lib/bookings/service";
import { parseSettingsForm } from "@/lib/bookings/form";

// Super Admin only. A change is a NEW version of the rules (never an edit); these are internal business rules, not legal thresholds. Past bookings keep the version they were confirmed under.
export async function recordBookingSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can change the booking rules.");     // authorisation FIRST
    if (!bookingFlagOn()) return actionFail("Booking confirmation is not switched on.");
    const p = parseSettingsForm(formData);
    if (p.error) return actionFail(p.error);
    if (String(formData.get("confirmSentence") ?? "").trim().toLowerCase() !== "record new booking rules") return actionFail("To record a new version, type exactly: record new booking rules");
    const r = await recordBookingSettingsVersion({ actorUserId: user.id, thresholds: p.thresholds, alwaysCategories: p.alwaysCategories, escalators: p.escalators, status: p.status, note: p.note });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/settings/bookings");
    return actionOk(`Booking rules version ${r.version} recorded. Existing bookings keep the version they were confirmed under.`);
  }, "record booking settings");
}
