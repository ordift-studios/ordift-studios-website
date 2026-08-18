import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { sendPaymentReceiptEmail } from "@/lib/payments/receipts";
import type { PaymentWebhookEvent } from "@/lib/payments/types";

// Shared between the Paystack webhook handler and active
// reconciliation (reconcilePendingPayment.ts) — both ultimately learn
// the same thing (a gateway's outcome for one payment) through
// different channels, so both funnel through this one function to
// avoid the two ever silently diverging.

const AMOUNT_TOLERANCE = 0.05; // Security Review §9

export type GatewaySyncSource = "webhook" | "verify";

export type GatewaySyncResult =
  | { outcome: "completed" }
  | { outcome: "failed" }
  | { outcome: "amount-mismatch" }
  | { outcome: "ignored" };

// TD-043 idempotency hardening (migration 0029) — a real staging race
// (webhook + browser-verify landing ~1s apart on the same successful
// payment) proved the `.eq("status","pending")` conditional UPDATE
// alone wasn't a strong enough gate for the *side effects* of
// resolving a payment: both callers ran the full completion sequence,
// producing two activity_log rows and, but for Staging's own email
// suppression, would have sent two real receipt emails. This claim
// table is a structurally different guard — a unique-constrained
// INSERT — that decides who's allowed to run those side effects at
// all, before payments.status itself (still the sole authority for
// which outcome is real) is ever touched for this attempt.
type ClaimOutcome = "completed" | "failed" | "amount_mismatch";

type ClaimRow = {
  payment_id: string;
  outcome: ClaimOutcome;
  source: GatewaySyncSource;
  claimed_at: string;
  entity_synced_at: string | null;
  activity_logged_at: string | null;
  receipt_dispatched_at: string | null;
  completed_at: string | null;
};

// How long an unfinished claim (claimed but never marked completed_at
// — the caller crashed, timed out, or errored partway through) is
// treated as still genuinely in-flight before a later caller is
// allowed to take over and finish the remaining steps. Comfortably
// longer than this sequence ever normally takes (a few hundred ms),
// short enough that a genuine crash doesn't leave the payment stuck.
const STALE_CLAIM_MS = 2 * 60 * 1000;

async function acquireCompletionClaim(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  outcome: ClaimOutcome,
  source: GatewaySyncSource
): Promise<ClaimRow | null> {
  const { data: inserted, error: insertError } = await admin
    .from("payment_completion_claims")
    .insert({ payment_id: paymentId, outcome, source })
    .select("*")
    .single();
  if (!insertError && inserted) return inserted as ClaimRow;

  if (insertError && insertError.code !== "23505") {
    console.error("[payments] completion claim insert failed unexpectedly", insertError.message);
    return null;
  }

  // Conflict — someone already holds (or finished) this exact
  // (paymentId, outcome) claim. Read it to decide whether to stand
  // down or, if it's stale, take over.
  const { data: existing } = await admin
    .from("payment_completion_claims")
    .select("*")
    .eq("payment_id", paymentId)
    .eq("outcome", outcome)
    .maybeSingle();
  if (!existing || existing.completed_at) return null;

  const ageMs = Date.now() - new Date(existing.claimed_at).getTime();
  if (ageMs < STALE_CLAIM_MS) return null; // still genuinely in-flight elsewhere

  const { data: stolen } = await admin
    .from("payment_completion_claims")
    .update({ claimed_at: new Date().toISOString(), source })
    .eq("payment_id", paymentId)
    .eq("outcome", outcome)
    .is("completed_at", null)
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
    .select("*")
    .maybeSingle();
  return (stolen as ClaimRow | null) ?? null; // null if someone else stole/finished it first
}

async function markClaimStep(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  outcome: ClaimOutcome,
  field: "entity_synced_at" | "activity_logged_at" | "receipt_dispatched_at" | "completed_at"
): Promise<void> {
  await admin
    .from("payment_completion_claims")
    .update({ [field]: new Date().toISOString() })
    .eq("payment_id", paymentId)
    .eq("outcome", outcome);
}

export async function applyGatewayEventToPayment(
  payment: {
    id: string;
    entity_type: string;
    entity_id: string;
    converted_amount: number | string;
    payment_currency: string;
  },
  event: Pick<PaymentWebhookEvent, "status" | "amount" | "currency" | "gatewayFee" | "channel" | "cardBrand" | "cardLast4">,
  source: GatewaySyncSource
): Promise<GatewaySyncResult> {
  const admin = createAdminClient();

  if (event.status === "completed") {
    // Amount/currency validation (Security Review §9) — never accept
    // a gateway-confirmed amount that doesn't match what was locked at
    // checkout, beyond a small rounding tolerance.
    const amountMatches =
      event.amount != null && Math.abs(event.amount - Number(payment.converted_amount)) <= AMOUNT_TOLERANCE;
    const currencyMatches = event.currency === payment.payment_currency;

    if (!amountMatches || !currencyMatches) {
      console.error("[payments] gateway event: amount/currency mismatch, marking failed", {
        paymentId: payment.id,
        source,
        expected: { amount: payment.converted_amount, currency: payment.payment_currency },
        received: { amount: event.amount, currency: event.currency },
      });

      const claim = await acquireCompletionClaim(admin, payment.id, "amount_mismatch", source);
      if (!claim) return { outcome: "ignored" };

      const { data: updatedRows } = await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .eq("status", "pending")
        .select("id");

      if (!updatedRows || updatedRows.length === 0) {
        const { data: current } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
        if (current?.status !== "failed") {
          // The payment already resolved to something else (most
          // likely already 'completed') before this mismatch report
          // arrived — do not downgrade a resolved payment.
          await markClaimStep(admin, payment.id, "amount_mismatch", "completed_at");
          console.warn("[payments] amount-mismatch reported for a payment already resolved differently — ignoring", {
            paymentId: payment.id,
            currentStatus: current?.status,
            source,
          });
          return { outcome: "ignored" };
        }
        // else: status is already 'failed' — this is crash recovery of
        // our own earlier attempt at this exact claim; fall through to
        // finish whatever step didn't complete before the crash.
      }

      if (!claim.activity_logged_at) {
        await logActivityAsSystem({
          action: "payment.amount_mismatch",
          entityType: "payment",
          entityId: payment.id,
          metadata: { expected: payment.converted_amount, received: event.amount, source },
        });
        await markClaimStep(admin, payment.id, "amount_mismatch", "activity_logged_at");
      }
      await markClaimStep(admin, payment.id, "amount_mismatch", "completed_at");
      return { outcome: "amount-mismatch" };
    }

    const claim = await acquireCompletionClaim(admin, payment.id, "completed", source);
    if (!claim) return { outcome: "ignored" };

    const netAmountReceived =
      event.amount != null && event.gatewayFee != null ? event.amount - event.gatewayFee : null;

    const { data: updatedRows } = await admin
      .from("payments")
      .update({
        status: "completed",
        amount_collected: event.amount,
        settlement_currency: event.currency,
        gateway_fee: event.gatewayFee,
        net_amount_received: netAmountReceived,
        channel: event.channel,
        card_brand: event.cardBrand,
        card_last4: event.cardLast4,
      })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select("id");

    if (!updatedRows || updatedRows.length === 0) {
      const { data: current } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
      if (current?.status !== "completed") {
        // The payment was already resolved to a different outcome
        // (most likely a premature 'failed'/'abandoned' report earlier
        // — see TD-043's Test 4 investigation) before this genuine
        // completion arrived. Automatically flipping an already-
        // resolved payment's financial status isn't safe to do
        // silently — surface it for staff review rather than either
        // discarding it or auto-correcting the ledger.
        await markClaimStep(admin, payment.id, "completed", "completed_at");
        await logActivityAsSystem({
          action: "payment.completion_conflict",
          entityType: "payment",
          entityId: payment.id,
          metadata: {
            reportedOutcome: "completed",
            currentStatus: current?.status ?? "unknown",
            source,
            amount: event.amount,
            currency: event.currency,
          },
        });
        console.error("[payments] gateway reported completed for a payment already resolved differently — flagged for review", {
          paymentId: payment.id,
          currentStatus: current?.status,
          source,
        });
        return { outcome: "ignored" };
      }
      // else: status is already 'completed' — crash recovery of our
      // own earlier attempt at this exact claim; fall through to
      // finish whichever step(s) didn't complete before the crash.
    }

    if (!claim.entity_synced_at) {
      await syncEntityPaymentStatus(payment.entity_type, payment.entity_id);
      await markClaimStep(admin, payment.id, "completed", "entity_synced_at");
    }

    if (!claim.activity_logged_at) {
      // System-attributed: the customer's own action caused this
      // completion, but there's no human session in a webhook request
      // (or in server-side reconciliation) — see logActivityAsSystem()'s
      // doc comment for why null is correct here rather than inventing
      // a synthetic "system user."
      await logActivityAsSystem({
        action: "payment.completed",
        entityType: "payment",
        entityId: payment.id,
        metadata: { amount: event.amount, currency: event.currency, channel: event.channel, source },
      });
      await markClaimStep(admin, payment.id, "completed", "activity_logged_at");
    }

    if (!claim.receipt_dispatched_at) {
      // Marked *before* the send attempt, not after — an "at most
      // once" bias for a customer-facing email: a hard crash in the
      // narrow window during the send itself could rarely mean a
      // receipt never goes out, which staff can notice and resend
      // manually; a duplicate receipt landing in a customer's inbox is
      // the worse failure mode this whole investigation exists to
      // prevent.
      await markClaimStep(admin, payment.id, "completed", "receipt_dispatched_at");
      await sendPaymentReceiptEmail(payment.id);
    }

    await markClaimStep(admin, payment.id, "completed", "completed_at");
    return { outcome: "completed" };
  }

  if (event.status === "failed") {
    const claim = await acquireCompletionClaim(admin, payment.id, "failed", source);
    if (!claim) return { outcome: "ignored" };

    const { data: updatedRows } = await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select("id");

    if (!updatedRows || updatedRows.length === 0) {
      const { data: current } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
      if (current?.status !== "failed") {
        // Already resolved differently (most likely already
        // 'completed') — never downgrade a resolved payment.
        await markClaimStep(admin, payment.id, "failed", "completed_at");
        console.warn("[payments] failed reported for a payment already resolved differently — ignoring", {
          paymentId: payment.id,
          currentStatus: current?.status,
          source,
        });
        return { outcome: "ignored" };
      }
      // else: crash recovery of our own earlier attempt at this claim.
    }

    if (!claim.activity_logged_at) {
      await logActivityAsSystem({
        action: "payment.failed",
        entityType: "payment",
        entityId: payment.id,
        metadata: { source },
      });
      await markClaimStep(admin, payment.id, "failed", "activity_logged_at");
    }
    await markClaimStep(admin, payment.id, "failed", "completed_at");
    return { outcome: "failed" };
  }

  return { outcome: "ignored" };
}

// Keeps enquiries.amount_paid/payment_status and
// workshop_registrations.amount_paid/payment_status (already-existing,
// already-displayed-in-Admin-Platform fields) in sync with the payments
// ledger, so /admin/bookings and /admin/enquiries stay accurate without
// staff manually updating that dropdown after every payment.
export async function syncEntityPaymentStatus(entityType: string, entityId: string): Promise<void> {
  const admin = createAdminClient();
  const table = entityType === "enquiry" ? "enquiries" : "workshop_registrations";

  const { data: entity } = await admin.from(table).select("amount_due").eq("id", entityId).maybeSingle();
  if (!entity) return;

  const { data: completedPayments } = await admin
    .from("payments")
    .select("amount_collected, payment_type, reference_amount_usd")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "completed");

  // Summed in USD reference terms (reference_amount_usd), not the
  // collected local-currency amount — amount_due on these entities is
  // already a USD figure (the architecture's reference currency), so
  // this keeps the two comparable.
  const totalPaidUsd = (completedPayments ?? []).reduce((sum, p) => {
    const isRefund = p.payment_type === "refund";
    const amount = Number(p.reference_amount_usd ?? 0);
    return isRefund ? sum - amount : sum + amount;
  }, 0);

  const amountDue = Number(entity.amount_due ?? 0);
  const paymentStatus = totalPaidUsd <= 0 ? "Pending" : totalPaidUsd >= amountDue ? "Paid" : "Pending";

  await admin
    .from(table)
    .update({ amount_paid: Math.round(totalPaidUsd * 100) / 100, payment_status: paymentStatus })
    .eq("id", entityId);
}
