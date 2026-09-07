// Ordift Partnerships & Collaborations V1 (2026-09-07) — referral
// commission economics. Pure, zero-import.
//
// Commission is based on qualifying money Ordift ACTUALLY COLLECTS —
// never quote value, invoice-issued value, signed-contract value, or
// unpaid balance. computeEligibleCollectedRevenue() takes an already-
// collected gross amount and the amounts to exclude (tax, refunds,
// chargebacks, supplier pass-through, venue/equipment/talent/travel
// reimbursement, permits, other non-Ordift pass-through) — it never
// itself decides what counts as collected; that's a governed fact
// recorded against a real payment (see referralCommissions.ts).

export const REFERRAL_COMMISSION_PRESETS = [5, 7.5, 10, 12.5, 15, 20] as const;
export const DEFAULT_REFERRAL_COMMISSION_PERCENTAGE = 10;
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 90;
export const DEFAULT_ATTRIBUTION_DURATION_MONTHS = 12; // ceiling before Founder approval is required for anything longer

export type ReferralDurationPreset = "first_engagement" | "six_months" | "twelve_months" | "custom";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeEligibleCollectedRevenue(grossCollectedAmount: number, excludedAmount: number): number {
  return Math.max(0, roundMoney(grossCollectedAmount - excludedAmount));
}

export function computeReferralCommissionEarned(eligibleCollectedRevenue: number, commissionPercentage: number): number {
  if (eligibleCollectedRevenue <= 0) return 0;
  return roundMoney(eligibleCollectedRevenue * (commissionPercentage / 100));
}

// "15% or above requires documented commercial reason."
export function commissionRequiresDocumentedReason(commissionPercentage: number): boolean {
  return commissionPercentage >= 15;
}

// "Above 20%: Custom arrangement + Founder/Super Admin approval."
export function commissionRequiresFounderApproval(commissionPercentage: number): boolean {
  return commissionPercentage > 20;
}

export function isRecognisedCommissionPreset(commissionPercentage: number): boolean {
  return (REFERRAL_COMMISSION_PRESETS as readonly number[]).includes(commissionPercentage);
}

// "Anything beyond 12 months: Founder/Super Admin approval. No
// perpetual referral commissions by default."
export function durationRequiresFounderApproval(preset: ReferralDurationPreset, customMonths?: number): boolean {
  if (preset === "first_engagement" || preset === "six_months") return false;
  if (preset === "twelve_months") return false;
  // "custom"
  return customMonths === undefined || customMonths > DEFAULT_ATTRIBUTION_DURATION_MONTHS || customMonths <= 0;
}

export function isWithinAttributionWindow(introducedAt: Date, asOf: Date, windowDays: number = DEFAULT_ATTRIBUTION_WINDOW_DAYS): boolean {
  const diffMs = asOf.getTime() - introducedAt.getTime();
  if (diffMs < 0) return false; // asOf before introducedAt — nonsensical, never "within window"
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}
