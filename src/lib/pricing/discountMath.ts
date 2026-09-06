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
