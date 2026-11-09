import type { createAdminClient } from "@/lib/supabase/admin";

// PAYMENT REVIEW CASES (additive table payment_review_cases, proposal PROPOSAL_payment_integrity_controls.sql). A case says "a person must look at this payment". It is NOT a payment status:
// nothing that reads payments.status changes. Opening a case is best effort and idempotent (one open case per payment and reason); it must never break the payment flow that opens it, and if the
// table or function is not there yet (the migration not applied) the failure is logged and the payment flow continues exactly as before.
export const REVIEW_REASONS = ["amount_mismatch", "completion_conflict", "over_collection", "reference_unrecorded"] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_REASON_LABELS: Record<ReviewReason, { title: string; explain: string }> = {
  amount_mismatch: { title: "Amount or currency did not match", explain: "The provider reported a payment whose amount or currency differs from what was asked. The attempt was marked Failed, but the customer may have been charged. Check the provider dashboard, then refund, credit or record it." },
  completion_conflict: { title: "Paid after being marked failed", explain: "The provider reported success for an attempt that had already been marked Failed. The customer was charged but the payment is not counted. Confirm with the provider and record it or refund it." },
  over_collection: { title: "Collected more than is owed", explain: "A card payment completed and the total collected now exceeds the amount due on the record. The money is held; decide whether to refund the excess or adjust the amount due." },
  reference_unrecorded: { title: "Provider reference not recorded", explain: "A checkout session was created but its provider reference could not be saved, so a later webhook could not be matched automatically." },
};

export const RESOLUTIONS = ["confirmed_not_charged", "refunded_or_credited_manually", "recorded_as_payment", "other"] as const;
export type ReviewResolution = (typeof RESOLUTIONS)[number];
export const RESOLUTION_LABELS: Record<ReviewResolution, string> = {
  confirmed_not_charged: "I confirmed with the provider that the customer was not charged",
  refunded_or_credited_manually: "I refunded or credited the customer manually",
  recorded_as_payment: "I recorded it as a payment (the amount due or payment was corrected)",
  other: "Other (explain below)",
};
export const MIN_RESOLUTION_NOTE = 10;

export function validateResolution(resolution: string, note: string): { ok: true; resolution: ReviewResolution } | { ok: false; error: string } {
  if (!(RESOLUTIONS as readonly string[]).includes(resolution)) return { ok: false, error: "Choose how the case was resolved." };
  if (note.trim().length < MIN_RESOLUTION_NOTE) return { ok: false, error: "Write what you checked and what you did (at least a short sentence)." };
  return { ok: true, resolution: resolution as ReviewResolution };
}

export const RESOLVE_ERRORS: Record<string, string> = {
  resolver_not_authorized: "Only a Super Admin or authorised Finance personnel can resolve a payment review case.",
  case_not_found: "That case no longer exists.",
  case_already_resolved: "That case was already resolved. Refresh to see its record.",
  invalid_resolution: "Choose how the case was resolved.",
  note_required: "Write what you checked and what you did (at least a short sentence).",
};
export const describeResolveError = (message: string | null | undefined) => { const k = Object.keys(RESOLVE_ERRORS).find((c) => message?.includes(c)); return k ? RESOLVE_ERRORS[k] : "The case could not be updated. Nothing was changed. Please try again."; };

type Admin = ReturnType<typeof createAdminClient>;
export async function openReviewCase(admin: Admin, paymentId: string, reason: ReviewReason, detail: Record<string, unknown>, source: string): Promise<boolean> {
  try {
    const { error } = await admin.rpc("open_payment_review_case", { p_payment_id: paymentId, p_reason: reason, p_detail: detail, p_source: source });
    if (error) { console.error("[payments] could not open a review case (is the payment-integrity migration applied?)", reason, paymentId, error.message); return false; }
    return true;
  } catch (err) { console.error("[payments] opening a review case threw", reason, paymentId, err); return false; }
}
