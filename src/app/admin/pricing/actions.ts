"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createPersonalSessionRateVersion, setPricingMarketActive } from "@/lib/pricing/personalSessionPricing";
import { createDiscountCode, setDiscountCodeActive } from "@/lib/pricing/discounts";

// Ordift Pricing Engine V1 (2026-09-06) — thin Server Action wrappers.
// All real authorization/validation/audit logic lives in
// src/lib/pricing/* (authorizeWithSuperAdminOverride + logActivity),
// matching the established Payables pattern — these actions only read
// the current session and hand off to it, same shape as every other
// admin Server Action in this codebase.

export async function createPersonalSessionRateVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const durationHours = Number(formData.get("durationHours"));
  const priceUsd = Number(formData.get("priceUsd"));
  const signatureRetouchedImages = Number(formData.get("signatureRetouchedImages"));
  const professionallyEditedImages = Number(formData.get("professionallyEditedImages"));
  if (!marketSlug || ![1, 2, 3, 4].includes(durationHours) || !Number.isFinite(priceUsd)) return;

  const result = await createPersonalSessionRateVersion({
    marketSlug,
    durationHours: durationHours as 1 | 2 | 3 | 4,
    priceUsd,
    signatureRetouchedImages,
    professionallyEditedImages,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create personal session rate version", result.error);

  revalidatePath("/admin/pricing");
}

export async function setPricingMarketActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const active = formData.get("active") === "true";
  if (!marketSlug) return;

  const result = await setPricingMarketActive({ marketSlug, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update pricing market", result.error);

  revalidatePath("/admin/pricing");
}

export async function createDiscountCodeAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const code = String(formData.get("code") ?? "");
  const value = Number(formData.get("value"));
  const reason = String(formData.get("reason") ?? "");
  if (!code || !Number.isFinite(value)) return;

  const result = await createDiscountCode({
    code,
    discountType: "percentage",
    value,
    validFrom: new Date().toISOString(),
    validTo: null,
    maxUses: null,
    maxUsesPerClient: null,
    reason,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create discount code", result.error);

  revalidatePath("/admin/pricing");
}

export async function setDiscountCodeActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const discountCodeId = String(formData.get("discountCodeId") ?? "");
  const active = formData.get("active") === "true";
  if (!discountCodeId) return;

  const result = await setDiscountCodeActive({ discountCodeId, active: !active, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update discount code", result.error);

  revalidatePath("/admin/pricing");
}
