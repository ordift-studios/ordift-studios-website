import { createAdminClient } from "@/lib/supabase/admin";
import { sendPaymentReceiptEmail } from "@/lib/payments/receipts";
import { advanceStageOnFullPayment } from "@/lib/payments/crmStageSync";
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

// TD-043 completion-idempotency architectural remediation (migration
// 0030, 2026-08-19) — a real Staging payment (PAY-2026-000040)
// reproduced the same duplicate payment.completed activity_log
// symptom as the original TD-043 finding (PAY-2026-000033), despite
// the migration-0029 claim table showing exactly one row for the
// claim itself. The exact mechanism was never conclusively proven
// (see TD-043) — but two real architectural weaknesses were
// identified regardless, and both are closed here:
//
// 1. The stale-claim decision compared application-side Date.now()
//    against a database-generated claimed_at across multiple round
//    trips. acquireCompletionClaim() now delegates the *entire*
//    decision to acquire_payment_completion_claim() (migration
//    0030), a single atomic Postgres round trip that uses only
//    Postgres's own now() — no application clock is ever consulted,
//    by any caller, on any machine.
//
// 2. Every completion side effect used a "check marker -> act ->
//    write marker" pattern gated on an in-memory claim snapshot
//    rather than an atomic database operation — meaning even a
//    genuinely non-null claim couldn't guarantee a step ran at most
//    once if two callers each read that snapshot independently. Each
//    side effect below is now idempotent at its own point of action,
//    not because of anything read earlier:
//      - entity sync was already naturally idempotent (recomputes
//        fresh from source every time) — now always called,
//        unconditionally.
//      - activity logging goes through claim_and_log_payment_activity()
//        (migration 0030), which claims the step and inserts the
//        activity_log row in one transaction — if either half fails,
//        neither persists, and a second caller's claim attempt
//        atomically fails closed.
//      - receipt dispatch goes through a durable outbox
//        (payment_receipt_jobs, migration 0030) uniquely constrained
//        per (payment_id, outcome) — its own existence, not a
//        boolean on the claims row, is what prevents a duplicate
//        send, and its status is a real, recoverable record rather
//        than an assumption.
//
// The net effect: even if two callers somehow both obtained a
// non-null top-level claim (the class of risk Hypothesis 1 in TD-043
// describes, never confirmed), none of the three real side effects
// below could be duplicated — each is independently, atomically
// guarded regardless of how many times or by whom this function is
// invoked for the same payment+outcome.
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

async function acquireCompletionClaim(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  outcome: ClaimOutcome,
  source: GatewaySyncSource
): Promise<ClaimRow | null> {
  const { data, error } = await admin.rpc("acquire_payment_completion_claim", {
    p_payment_id: paymentId,
    p_outcome: outcome,
    p_source: source,
  });
  if (error) {
    console.error("[payments] acquire_payment_completion_claim failed", error.message);
    return null;
  }
  return (Array.isArray(data) && data.length > 0 ? data[0] : null) as ClaimRow | null;
}

async function markClaimStep(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  outcome: ClaimOutcome,
  field: "entity_synced_at" | "receipt_dispatched_at" | "completed_at"
): Promise<void> {
  await admin
    .from("payment_completion_claims")
    .update({ [field]: new Date().toISOString() })
    .eq("payment_id", paymentId)
    .eq("outcome", outcome);
}

// Atomic (single-transaction) claim-and-log — see claim_and_log_
// payment_activity() (migration 0030). Safe to call unconditionally;
// it's a no-op if this exact step was already completed by anyone.
async function logPaymentActivity(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  outcome: ClaimOutcome,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.rpc("claim_and_log_payment_activity", {
    p_payment_id: paymentId,
    p_outcome: outcome,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata,
  });
  if (error) {
    console.error("[payments] claim_and_log_payment_activity failed", error.message);
  }
}

// Durable receipt outbox — creates (or finds an already-existing) job
// atomically via the table's own unique constraint, and only the
// creator attempts the send. A pre-existing job means another caller
// already owns dispatching (or has already dispatched) this exact
// receipt; the admin recovery action (reconcilePaymentAction's
// sibling, retryReceiptJobAction) is the intended path for a job
// stuck at 'pending'/'failed', not a second automatic attempt here —
// see TD-043's crash-recovery note on why an automatic retry loop
// isn't built at this stage.
async function dispatchReceiptJob(admin: ReturnType<typeof createAdminClient>, paymentId: string): Promise<void> {
  const { data: created, error: createError } = await admin
    .from("payment_receipt_jobs")
    .upsert({ payment_id: paymentId, outcome: "completed" }, { onConflict: "payment_id,outcome", ignoreDuplicates: true })
    .select("id, attempt_count");

  if (createError) {
    console.error("[payments] failed to create receipt job", createError.message);
    return;
  }

  const job = created?.[0];
  if (!job) return; // a job already exists for this payment — not ours to dispatch

  await admin
    .from("payment_receipt_jobs")
    .update({ status: "processing", attempt_count: job.attempt_count + 1, last_attempted_at: new Date().toISOString() })
    .eq("id", job.id);

  const result = await sendPaymentReceiptEmail(paymentId);

  await admin
    .from("payment_receipt_jobs")
    .update({
      status: result.ok ? "sent" : "failed",
      provider_result: result.ok ? result.mode : null,
      last_error: result.ok ? null : result.error,
    })
    .eq("id", job.id);
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
          await markClaimStep(admin, payment.id, "amount_mismatch", "completed_at");
          console.warn("[payments] amount-mismatch reported for a payment already resolved differently — ignoring", {
            paymentId: payment.id,
            currentStatus: current?.status,
            source,
          });
          return { outcome: "ignored" };
        }
        // else: status already 'failed' — crash recovery of our own
        // earlier attempt at this claim; fall through and finish.
      }

      await logPaymentActivity(admin, payment.id, "amount_mismatch", "payment.amount_mismatch", "payment", payment.id, {
        expected: payment.converted_amount,
        received: event.amount,
        source,
      });
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
        // Already resolved to a different outcome (most likely a
        // premature 'failed'/'abandoned' report earlier — see TD-043's
        // Test 4 investigation). Never silently flip an already-
        // resolved payment's financial status — surface for review.
        await markClaimStep(admin, payment.id, "completed", "completed_at");
        await logPaymentActivity(admin, payment.id, "completed", "payment.completion_conflict", "payment", payment.id, {
          reportedOutcome: "completed",
          currentStatus: current?.status ?? "unknown",
          source,
          amount: event.amount,
          currency: event.currency,
        });
        console.error("[payments] gateway reported completed for a payment already resolved differently — flagged for review", {
          paymentId: payment.id,
          currentStatus: current?.status,
          source,
        });
        return { outcome: "ignored" };
      }
      // else: status already 'completed' — crash recovery of our own
      // earlier attempt at this claim; fall through and finish
      // whichever step(s) didn't complete before the crash. Every
      // step below is independently safe to re-run.
    }

    await syncEntityPaymentStatus(payment.entity_type, payment.entity_id);
    await markClaimStep(admin, payment.id, "completed", "entity_synced_at");

    // System-attributed: the customer's own action caused this
    // completion, but there's no human session in a webhook request
    // (or in server-side reconciliation).
    await logPaymentActivity(admin, payment.id, "completed", "payment.completed", "payment", payment.id, {
      amount: event.amount,
      currency: event.currency,
      channel: event.channel,
      source,
    });

    await dispatchReceiptJob(admin, payment.id);
    await markClaimStep(admin, payment.id, "completed", "receipt_dispatched_at");

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

    await logPaymentActivity(admin, payment.id, "failed", "payment.failed", "payment", payment.id, { source });
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

  await advanceStageOnFullPayment(admin, entityType, entityId, paymentStatus);
}
