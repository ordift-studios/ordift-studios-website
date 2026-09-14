"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { requestSalaryAdvance } from "@/lib/organization/compensation";

// Employee Self-Service — My Compensation (Phase B5 Step 16,
// 2026-09-14). requestedAmount is validated and the 50% cap computed
// server-side in requestSalaryAdvance() itself (against the person's
// real current basic salary) — never accepted or computed here.

export type ActionState = { ok: boolean; error?: string } | null;

export async function requestOwnSalaryAdvanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { ok: false, error: "Not authorized." };

  const requestedAmount = Number(formData.get("requestedAmount") ?? "");
  if (!(requestedAmount > 0)) return { ok: false, error: "The requested amount must be greater than zero." };

  const result = await requestSalaryAdvance({ profileId: currentUser.id, requestedAmount, actorUserId: currentUser.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/compensation");
  return { ok: true };
}
