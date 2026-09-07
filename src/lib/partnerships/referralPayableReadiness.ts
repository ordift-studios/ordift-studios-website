// Ordift Partnerships & Collaborations — Referral Payable Bridge
// (2026-09-07) — pure, zero-import. Classifies whether a commission
// event is ready for the deliberate "Approve for Payment" action,
// purely from already-fetched facts. Every DB-dependent revalidation
// step (re-deriving eligible revenue, checking the referral lead
// isn't disputed, checking the opportunity has a payee link, checking
// no payment_obligation_id is already set) happens in
// referralCommissions.ts's approveReferralCommissionForPayment() —
// this module only classifies the outcome, it never fetches anything
// itself.

export type ReferralPayableBlockReason = "not_earned" | "already_linked" | "no_payee_setup" | "lead_disputed" | "amount_mismatch";

export type ReferralPayableReadiness = { ready: true } | { ready: false; reason: ReferralPayableBlockReason };

export function classifyReferralPayableReadiness(params: {
  commissionStatus: "calculated" | "earned" | "approved_for_payment" | "paid";
  existingPaymentObligationId: string | null;
  leadStatus: "attributed" | "expired" | "converted" | "disputed";
  hasPayeeProfileLinked: boolean;
  storedEligibleCollectedRevenue: number;
  recomputedEligibleCollectedRevenue: number;
  storedCommissionEarnedAmount: number;
  recomputedCommissionEarnedAmount: number;
}): ReferralPayableReadiness {
  // Already linked to a real payment obligation — this is the
  // idempotent "already submitted" case, not a failure; the caller
  // (approveReferralCommissionForPayment) returns the existing
  // obligation rather than treating this as blocked, but the button
  // state on the Admin UI uses this same classification to show "View
  // Payable" instead of "Approve for Payment".
  if (params.existingPaymentObligationId) return { ready: false, reason: "already_linked" };

  if (params.commissionStatus !== "earned") return { ready: false, reason: "not_earned" };

  // "If qualifying client revenue is refunded/charged back BEFORE the
  // commission is approved for payment, revalidation must prevent
  // payment" — V1 reuses the existing referral-lead dispute mechanism
  // (disputeReferralLead()) as the revalidation signal, rather than
  // inventing a new refund-tracking table.
  if (params.leadStatus === "disputed") return { ready: false, reason: "lead_disputed" };

  if (!params.hasPayeeProfileLinked) return { ready: false, reason: "no_payee_setup" };

  // "Amount comes from authoritative earned commission, not client
  // input" — the amount actually paid is re-derived server-side from
  // the stored gross/excluded figures and compared against what was
  // recorded when the commission became Earned. A mismatch (e.g. data
  // corruption, or a manual row edit) blocks payment rather than
  // silently trusting either figure.
  if (roundMoney(params.storedEligibleCollectedRevenue) !== roundMoney(params.recomputedEligibleCollectedRevenue)) return { ready: false, reason: "amount_mismatch" };
  if (roundMoney(params.storedCommissionEarnedAmount) !== roundMoney(params.recomputedCommissionEarnedAmount)) return { ready: false, reason: "amount_mismatch" };

  return { ready: true };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
