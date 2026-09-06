import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Pricing Engine V1 (2026-09-06) — discount codes and audited
// manual discounts. No discount code is seeded by migration 0053 (no
// FIRST5, no automatic example) — every real code is a deliberate
// future creation by an authorized admin. Reuses the existing
// authority/audit architecture (authorizeWithSuperAdminOverride,
// createAdminClient) rather than inventing a parallel authorization
// mechanism — same pattern as every Payables function in this
// codebase.

export type DiscountCode = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  value: number;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  maxUses: number | null;
  maxUsesPerClient: number | null;
};

// Pure — the actual arithmetic, directly unit-testable. Never mutates
// anything; the caller decides whether/how to record the result.
export function applyDiscount(originalAmountUsd: number, discount: { discountType: "percentage" | "fixed"; value: number }): { discountAmountUsd: number; finalAmountUsd: number } {
  const discountAmountUsd =
    discount.discountType === "percentage"
      ? Math.round(originalAmountUsd * (discount.value / 100) * 100) / 100
      : Math.min(discount.value, originalAmountUsd);
  const finalAmountUsd = Math.round((originalAmountUsd - discountAmountUsd) * 100) / 100;
  return { discountAmountUsd, finalAmountUsd };
}

// Pure eligibility check — validity window and active flag only. Usage
// caps (max_uses/max_uses_per_client) require a live count against
// discount_redemptions and are checked separately in
// redeemDiscountCode() below, not here, since counting genuinely needs
// a database read.
export function isDiscountCurrentlyValid(discount: { active: boolean; validFrom: string; validTo: string | null }, now: Date = new Date()): { ok: true } | { ok: false; error: string } {
  if (!discount.active) return { ok: false, error: "This discount is not currently active." };
  if (new Date(discount.validFrom).getTime() > now.getTime()) return { ok: false, error: "This discount is not yet valid." };
  if (discount.validTo && new Date(discount.validTo).getTime() <= now.getTime()) return { ok: false, error: "This discount has expired." };
  return { ok: true };
}

export async function recordManualDiscount(params: {
  originalAmountUsd: number;
  discountType: "percentage" | "fixed";
  value: number;
  referenceType: string;
  referenceId: string | null;
  actorUserId: string;
  reason: string;
}): Promise<{ ok: true; finalAmountUsd: number } | { ok: false; error: string }> {
  // Reuses the existing Payables authorization architecture rather
  // than inventing a parallel one — a manual discount is exactly the
  // kind of "authorized correction to a financial figure" this
  // codebase already has a proven, audited pattern for.
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to apply a manual discount." };
  if (!params.reason.trim()) return { ok: false, error: "A reason is required for a manual discount." };
  if (params.value <= 0) return { ok: false, error: "Discount value must be greater than zero." };
  if (params.discountType === "percentage" && params.value > 100) return { ok: false, error: "A percentage discount cannot exceed 100%." };

  const { discountAmountUsd, finalAmountUsd } = applyDiscount(params.originalAmountUsd, { discountType: params.discountType, value: params.value });

  const admin = createAdminClient();
  const { error } = await admin.from("discount_redemptions").insert({
    discount_code_id: null,
    reference_type: params.referenceType,
    reference_id: params.referenceId,
    original_amount_usd: params.originalAmountUsd,
    discount_type: params.discountType,
    discount_value: params.value,
    discount_amount_usd: discountAmountUsd,
    final_amount_usd: finalAmountUsd,
    actor_user_id: params.actorUserId,
    reason: params.reason,
  });
  if (error) {
    console.error("[pricing] failed to record manual discount", error.message);
    return { ok: false, error: "Failed to record the discount." };
  }
  return { ok: true, finalAmountUsd };
}

// ============================================================
// Admin management (finance.pricing.administer)
// ============================================================

export async function listAllDiscountCodesForAdmin(actorUserId: string): Promise<DiscountCode[]> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("discount_codes")
    .select("id, code, discount_type, value, valid_from, valid_to, active, max_uses, max_uses_per_client")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load discount codes", error.message);
    return [];
  }
  return (data ?? []).map((d) => ({
    id: d.id,
    code: d.code,
    discountType: d.discount_type,
    value: Number(d.value),
    validFrom: d.valid_from,
    validTo: d.valid_to,
    active: d.active,
    maxUses: d.max_uses,
    maxUsesPerClient: d.max_uses_per_client,
  }));
}

// V1 only exposes percentage-type creation through this function's
// intended caller (the admin form) — fixed-value discounts are
// schema-supported (migration 0053) but deliberately not offered yet,
// per explicit "future fixed-value discounts" phrasing in the
// authorizing request. Nothing here prevents a future admin action
// from passing "fixed" once that's genuinely wanted.
export async function createDiscountCode(params: {
  code: string;
  discountType: "percentage" | "fixed";
  value: number;
  validFrom: string;
  validTo: string | null;
  maxUses: number | null;
  maxUsesPerClient: number | null;
  reason: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!params.code.trim()) return { ok: false, error: "A code is required." };
  if (params.value <= 0) return { ok: false, error: "Discount value must be greater than zero." };
  if (params.discountType === "percentage" && params.value > 100) return { ok: false, error: "A percentage discount cannot exceed 100%." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("discount_codes")
    .insert({
      code: params.code.trim().toUpperCase(),
      discount_type: params.discountType,
      value: params.value,
      valid_from: params.validFrom,
      valid_to: params.validTo,
      max_uses: params.maxUses,
      max_uses_per_client: params.maxUsesPerClient,
      reason: params.reason || null,
      created_by: params.actorUserId,
      active: false, // created inactive by default — a deliberate second step activates it, never live the moment it's typed
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to create discount code", error.message);
    return { ok: false, error: error.message.includes("duplicate") ? "That code already exists." : "Failed to create the discount code." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.discount_code.created",
    entityType: "discount_code",
    entityId: data?.id,
    metadata: { code: params.code, discountType: params.discountType, value: params.value },
  });
  return { ok: true };
}

export async function setDiscountCodeActive(params: { discountCodeId: string; active: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };

  const admin = createAdminClient();
  const { error } = await admin.from("discount_codes").update({ active: params.active }).eq("id", params.discountCodeId);
  if (error) {
    console.error("[pricing] failed to update discount code active state", error.message);
    return { ok: false, error: "Failed to update the discount code." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.discount_code.active_changed",
    entityType: "discount_code",
    entityId: params.discountCodeId,
    metadata: { active: params.active },
  });
  return { ok: true };
}
