"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { createStatutoryWageRule, RATE_BASES, type RateBasis } from "@/lib/organization/statutoryWageEngine";

export type ActionState = { ok: boolean; error?: string } | null;

async function requireSuperAdminActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!isSuperAdmin(currentUser)) return { error: "Only Super Admin may manage statutory wage rules." };
  return { id: currentUser.id };
}

export async function createStatutoryWageRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSuperAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const jurisdictionId = String(formData.get("jurisdictionId") ?? "");
  const rateBasis = String(formData.get("rateBasis") ?? "");
  const rateAmountRaw = String(formData.get("rateAmount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const monthlyConversionFactorRaw = String(formData.get("monthlyConversionFactor") ?? "").trim();
  const workerCategory = String(formData.get("workerCategory") ?? "").trim() || null;
  const sourceAuthority = String(formData.get("sourceAuthority") ?? "").trim() || null;
  const sourceReference = String(formData.get("sourceReference") ?? "").trim() || null;
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const legalReviewRequired = formData.get("legalReviewRequired") === "true";

  if (!jurisdictionId || !currency || !effectiveFrom) return { ok: false, error: "Jurisdiction, currency, and effective date are required." };
  if (!(RATE_BASES as readonly string[]).includes(rateBasis)) return { ok: false, error: "Invalid rate basis." };

  const result = await createStatutoryWageRule({
    jurisdictionId,
    rateBasis: rateBasis as RateBasis,
    rateAmount: rateAmountRaw ? Number(rateAmountRaw) : null,
    currency,
    monthlyConversionFactor: monthlyConversionFactorRaw ? Number(monthlyConversionFactorRaw) : null,
    workerCategory,
    sourceAuthority,
    sourceReference,
    effectiveFrom,
    notes,
    legalReviewRequired,
    actorUserId: actor.id,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/statutory-wages");
  return { ok: true };
}
