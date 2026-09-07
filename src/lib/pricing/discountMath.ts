// Ordift Pricing Engine (2026-09-06) — pure discount arithmetic only.
// Zero imports, so this is safe to import from a Client Component
// (ManualDiscountForm.tsx's live preview) without pulling server-only
// code (createAdminClient, next/headers via activityLog.ts's session
// client, etc.) into the browser bundle — same established pure/impure
// split as personalSessionEstimate.ts. discounts.ts (the server-only
// authorization/DB module) imports and re-exports from here rather
// than duplicating this logic.

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
// discount_redemptions and are checked separately (DB-dependent, not
// here).
export function isDiscountCurrentlyValid(discount: { active: boolean; validFrom: string; validTo: string | null }, now: Date = new Date()): { ok: true } | { ok: false; error: string } {
  if (!discount.active) return { ok: false, error: "This discount is not currently active." };
  if (new Date(discount.validFrom).getTime() > now.getTime()) return { ok: false, error: "This discount is not yet valid." };
  if (discount.validTo && new Date(discount.validTo).getTime() <= now.getTime()) return { ok: false, error: "This discount has expired." };
  return { ok: true };
}

// Discount Lifecycle Refinement (2026-09-07) — the pure decision at the
// heart of "delete vs. archive": a discount code with zero historical
// redemptions carries no financial/audit history to protect, so a
// genuine permanent delete is safe. Any redemption at all (even one)
// means deleting the row would orphan discount_redemptions.discount_code_id
// or (given that FK has no ON DELETE clause, i.e. NO ACTION) simply fail
// outright — either way, physically deleting is never attempted; the
// code is retired into the archived state instead, which is reversible
// only in the sense that Admin can always see it, never in the sense
// that it can be reactivated (see setDiscountCodeActive's guard).
// discount_codes is only ever referenced by discount_redemptions.discount_code_id
// in this schema (no direct FK from bookings/enquiries/quotes/payments —
// those relate to a redemption via discount_redemptions.reference_type/
// reference_id, the same polymorphic pattern as payment_obligations),
// so a redemption count of zero is the complete, sufficient dependency
// check for this schema.
export function decideDiscountDeletionOutcome(redemptionCount: number): "delete" | "archive" {
  return redemptionCount > 0 ? "archive" : "delete";
}
