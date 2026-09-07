import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { applyDiscount, isDiscountCurrentlyValid, decideDiscountDeletionOutcome } from "./discountMath";

// Ordift Pricing Engine V1 (2026-09-06) — discount codes and audited
// manual discounts. No discount code is seeded by migration 0053 (no
// FIRST5, no automatic example) — every real code is a deliberate
// future creation by an authorized admin. Reuses the existing
// authority/audit architecture (authorizeWithSuperAdminOverride,
// createAdminClient) rather than inventing a parallel authorization
// mechanism — same pattern as every Payables function in this
// codebase.
//
// The pure arithmetic/validity logic lives in discountMath.ts (zero
// imports) and is re-exported below — this file itself must never be
// imported from a Client Component, since it pulls in
// createAdminClient/logActivity's session-client (next/headers)
// dependency chain, which cannot be bundled for the browser.
// ManualDiscountForm.tsx's live preview imports directly from
// discountMath.ts instead, never from here.

export { applyDiscount, isDiscountCurrentlyValid, decideDiscountDeletionOutcome };

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
  // Discount Lifecycle Refinement (2026-09-07)
  archivedAt: string | null; // set only when a Delete attempt found protected redemption history — retired, not reactivatable
  redemptionCount: number; // live count against discount_redemptions — what a Delete attempt would find
};

export type DeleteDiscountCodeResult =
  | { ok: true; outcome: "deleted" }
  | { ok: true; outcome: "archived"; redemptionCount: number }
  | { ok: false; error: string };

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

  // V1.1 — the discount_redemptions row above is the primary audit
  // record (original/discount/final amounts, actor, reason, timestamp,
  // per the exact business requirement); this activity_log entry makes
  // the same event visible in the existing Admin Overview Recent
  // Activity feed and admin/activity, matching every other financial
  // mutation in this codebase.
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.manual_discount.applied",
    entityType: params.referenceType,
    entityId: params.referenceId ?? undefined,
    metadata: { originalAmountUsd: params.originalAmountUsd, discountType: params.discountType, value: params.value, discountAmountUsd, finalAmountUsd, reason: params.reason },
  });

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
    .select("id, code, discount_type, value, valid_from, valid_to, active, max_uses, max_uses_per_client, archived_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load discount codes", error.message);
    return [];
  }
  const codes = data ?? [];
  if (codes.length === 0) return [];

  // Discount Lifecycle Refinement (2026-09-07) — the Admin list shows
  // each code's live redemption count up front, so the Founder/Admin
  // sees WHY permanent deletion will or won't be available before ever
  // clicking Delete, per the explicit "Admin UX should clearly
  // communicate why permanent deletion is unavailable" requirement.
  const { data: redemptionRows, error: redemptionError } = await admin
    .from("discount_redemptions")
    .select("discount_code_id")
    .in("discount_code_id", codes.map((d) => d.id));
  if (redemptionError) {
    console.error("[pricing] failed to load discount redemption counts", redemptionError.message);
  }
  const redemptionCounts = new Map<string, number>();
  for (const row of redemptionRows ?? []) {
    if (!row.discount_code_id) continue;
    redemptionCounts.set(row.discount_code_id, (redemptionCounts.get(row.discount_code_id) ?? 0) + 1);
  }

  return codes.map((d) => ({
    id: d.id,
    code: d.code,
    discountType: d.discount_type,
    value: Number(d.value),
    validFrom: d.valid_from,
    validTo: d.valid_to,
    active: d.active,
    maxUses: d.max_uses,
    maxUsesPerClient: d.max_uses_per_client,
    archivedAt: d.archived_at,
    redemptionCount: redemptionCounts.get(d.id) ?? 0,
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

  // Discount Lifecycle Refinement (2026-09-07) — an archived code was
  // retired specifically because it has protected redemption history
  // AND the Founder no longer wants it — that is a deliberately
  // different, one-way state from a plain Deactivate (which stays
  // freely reactivatable). Never let a plain Activate toggle silently
  // resurrect it.
  if (params.active) {
    const { data: existing } = await admin.from("discount_codes").select("archived_at").eq("id", params.discountCodeId).maybeSingle();
    if (existing?.archived_at) {
      return { ok: false, error: "This discount was archived (retired) because it has redemption history and can no longer be reused — create a new code instead if you want to run this promotion again." };
    }
  }

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

// Discount Lifecycle Refinement (2026-09-07) — DEACTIVATE (above,
// setDiscountCodeActive) is temporary and reversible: a discount that
// may be reused later (a seasonal promotion, say). DELETE is for a
// configuration the Founder genuinely no longer wants — but it must
// never destroy financial/audit history. The single dependency check
// this schema needs is a redemption count (discount_codes is only ever
// referenced by discount_redemptions.discount_code_id — see
// decideDiscountDeletionOutcome's doc comment): zero means a real,
// permanent DELETE is safe; any redemption means the row is retired
// into the archived state instead (active forced false, archived_at
// set), which Admin can still see and which the audit trail keeps
// pointing at, but which can never be reactivated (see the guard in
// setDiscountCodeActive above) or re-deleted.
export async function deleteDiscountCode(params: { discountCodeId: string; actorUserId: string }): Promise<DeleteDiscountCodeResult> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };

  const admin = createAdminClient();
  const { data: code, error: fetchError } = await admin.from("discount_codes").select("id, code, archived_at").eq("id", params.discountCodeId).maybeSingle();
  if (fetchError || !code) return { ok: false, error: "Discount code not found." };
  if (code.archived_at) return { ok: false, error: "This discount is already archived — there is nothing further to delete." };

  const { count, error: countError } = await admin
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("discount_code_id", params.discountCodeId);
  if (countError) {
    console.error("[pricing] failed to count discount redemptions before delete", countError.message);
    return { ok: false, error: "Could not verify redemption history — try again." };
  }
  const redemptionCount = count ?? 0;
  const outcome = decideDiscountDeletionOutcome(redemptionCount);

  if (outcome === "delete") {
    const { error: deleteError } = await admin.from("discount_codes").delete().eq("id", params.discountCodeId);
    if (deleteError) {
      // Defense in depth: a redemption could theoretically be recorded
      // between the count check above and this delete. The FK on
      // discount_redemptions.discount_code_id has no ON DELETE clause
      // (NO ACTION), so Postgres itself refuses the delete rather than
      // orphaning/cascading — fall back to archiving instead of
      // surfacing a raw DB error.
      console.error("[pricing] delete failed, falling back to archive", deleteError.message);
      const { error: archiveError } = await admin.from("discount_codes").update({ active: false, archived_at: new Date().toISOString() }).eq("id", params.discountCodeId);
      if (archiveError) {
        console.error("[pricing] fallback archive also failed", archiveError.message);
        return { ok: false, error: "Failed to delete or archive the discount code." };
      }
      await logActivity({ actorUserId: params.actorUserId, action: "pricing.discount_code.archived", entityType: "discount_code", entityId: params.discountCodeId, metadata: { code: code.code, reason: "delete attempted but a redemption appeared concurrently" } });
      return { ok: true, outcome: "archived", redemptionCount: 1 };
    }
    await logActivity({ actorUserId: params.actorUserId, action: "pricing.discount_code.deleted", entityType: "discount_code", entityId: params.discountCodeId, metadata: { code: code.code, redemptionCount: 0 } });
    return { ok: true, outcome: "deleted" };
  }

  const { error: archiveError } = await admin.from("discount_codes").update({ active: false, archived_at: new Date().toISOString() }).eq("id", params.discountCodeId);
  if (archiveError) {
    console.error("[pricing] failed to archive discount code", archiveError.message);
    return { ok: false, error: "Failed to archive the discount code." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.discount_code.archived", entityType: "discount_code", entityId: params.discountCodeId, metadata: { code: code.code, redemptionCount } });
  return { ok: true, outcome: "archived", redemptionCount };
}
