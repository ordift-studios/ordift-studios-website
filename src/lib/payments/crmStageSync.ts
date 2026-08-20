import type { createAdminClient } from "@/lib/supabase/admin";
import { CRM_STAGES } from "@/lib/admin/enquiries";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { sendBookingConfirmedEmail } from "@/lib/enquiry/lifecycleEmails";

// TD-043 follow-up (Item 3, 2026-08-19) — the moment an enquiry's
// aggregate payment status reaches "Paid", the booking is secured and
// the CRM pipeline should reflect that automatically, without staff
// having to remember to flip the stage dropdown by hand. That gap
// left a real Production enquiry (ENQ-2026-000007) stuck at
// "quotation_sent" after a fully completed payment.
//
// Shared by both payment-completion paths — gatewaySync.ts's
// syncEntityPaymentStatus() (Paystack) and admin/payments/actions.ts's
// syncEntityAfterBankTransferDecision() (bank transfer) — so neither
// can silently drift out of sync with the other, the exact class of
// gap this fix exists to close.
//
// Deliberately keyed off the caller's already-computed aggregate
// paymentStatus (amount_paid >= amount_due), never an individual
// payment's payment_type — this fires correctly whether the balance
// was cleared by one "full" payment or a "deposit" + "balance"
// combination, and it means this function never needs to know
// anything about partial-payment semantics (Item 5, untouched).
//
// The advance itself is a single atomic conditional UPDATE — not a
// prior read of the current stage followed by a separate write —
// exactly the pattern this project's own Item 2 fix (setAmountDueAction)
// proved is required for correctness under concurrency: two payments
// on the same enquiry completing in quick succession (e.g. a deposit
// then its balance, processed by two near-simultaneous webhook
// deliveries) could both independently decide "this should advance"
// at the same instant. Because the "is this actually still eligible"
// check lives in the UPDATE's own WHERE clause, only one of them can
// ever actually change the row and log the activity — the other sees
// zero rows affected and does nothing, not a second identical write.
// This also makes the whole operation idempotent by construction: a
// retried webhook, a manual reconciliation, or any repeat call for an
// enquiry already at or past "booked" always affects zero rows.
export async function advanceStageOnFullPayment(
  admin: ReturnType<typeof createAdminClient>,
  entityType: string,
  entityId: string,
  paymentStatus: "Paid" | "Pending"
): Promise<void> {
  if (entityType !== "enquiry" || paymentStatus !== "Paid") return;

  // Every stage at or after "booked" in the canonical pipeline order —
  // none of these may ever be overwritten back to "booked".
  const bookedIndex = CRM_STAGES.indexOf("booked");
  const ineligibleStages = CRM_STAGES.slice(bookedIndex);

  const { data: updatedRows, error } = await admin
    .from("enquiries")
    .update({ crm_stage: "booked" })
    .eq("id", entityId)
    .not("crm_stage", "in", `(${ineligibleStages.join(",")})`)
    .select("id");

  if (error) {
    console.error("[payments] advanceStageOnFullPayment: update failed", { entityId, error: error.message });
    return;
  }

  if (!updatedRows || updatedRows.length === 0) {
    // Not eligible (already booked or further along) or the enquiry
    // doesn't exist — a genuine no-op, not an error. Nothing to log.
    return;
  }

  await logActivityAsSystem({
    actorUserId: null,
    action: "enquiry.stage_change",
    entityType: "enquiry",
    entityId,
    metadata: { stage: "booked", automated: true, reason: "full_payment" },
  });

  // Booking Confirmed client email — fires only on this same guarded
  // transition (the UPDATE above already returned zero rows for a
  // duplicate webhook/retry, so this line is unreached in that case).
  // Deliberately not the payment receipt (receipts.ts) — that's
  // dispatched separately, keyed off the completed payment itself, not
  // the stage transition. A failure resolving contact details or
  // sending must never fail this already-successful stage advance.
  try {
    const { data: entity } = await admin
      .from("enquiries")
      .select("email, full_name, service, reference_number")
      .eq("id", entityId)
      .maybeSingle();

    if (entity?.email && entity?.full_name) {
      const result = await sendBookingConfirmedEmail({
        enquiryId: entityId,
        referenceNumber: entity.reference_number ?? entityId,
        fullName: entity.full_name,
        email: entity.email,
        service: entity.service ?? "",
      });
      await logActivityAsSystem({
        actorUserId: null,
        action: "enquiry.booking_confirmed_email_sent",
        entityType: "enquiry",
        entityId,
        metadata: { ok: result?.ok ?? false, automated: true },
      });
    }
  } catch (err) {
    console.error("[payments] advanceStageOnFullPayment: booking confirmed email failed", { entityId, err });
  }
}
