"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { logActivity } from "@/lib/admin/activityLog";
import { insertExchangeRate } from "@/lib/payments/currency";
import { reconcilePendingGatewayPayment } from "@/lib/payments/reconcilePendingPayment";
import { sendPaymentReceiptEmail } from "@/lib/payments/receipts";

async function requireCapability(
  capability:
    | "approve_bank_transfer"
    | "reject_bank_transfer"
    | "issue_refund"
    | "manage_currencies"
    | "reconcile_payment"
) {
  const user = await getCurrentUser();
  if (!user || !hasCapability(user, PAYMENT_CAPABILITIES, capability)) {
    throw new Error("Not authorized.");
  }
  return user;
}

// Approve — transitions a bank-transfer payment from
// awaiting_verification to completed, then continues the associated
// booking/workshop workflow (UX Spec §9: "automatically continues").
// "Continuation" here is the same amount_paid/payment_status sync the
// gateway webhook path uses (src/app/api/payments/webhook/paystack/
// route.ts's syncEntityPaymentStatus) — one shared mechanism for both
// payment methods, not two divergent implementations.
export async function approveBankTransferAction(formData: FormData): Promise<void> {
  const user = await requireCapability("approve_bank_transfer");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;

  // Admin/secret-key client, not the session client — public.payments
  // grants UPDATE to service_role only (see migration 0024's RLS
  // section comment); authorization is already enforced above via
  // requireCapability(), this just supplies the DB privilege the write
  // itself needs.
  const supabase = createAdminClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, entity_type, entity_id, reference_amount_usd, payment_type")
    .eq("id", paymentId)
    .eq("status", "awaiting_verification")
    .maybeSingle();

  if (!payment) return;

  const { error } = await supabase
    .from("payments")
    .update({
      status: "completed",
      amount_collected: payment.reference_amount_usd,
      settlement_currency: null, // bank transfer settles directly to Ordift's bank, not through a gateway — nothing to record here
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (error) {
    console.error("[admin] bank transfer approval failed", error.message);
    return;
  }

  await syncEntityAfterBankTransferDecision(payment.entity_type, payment.entity_id);

  await logActivity({
    actorUserId: user.id,
    action: "payment.bank_transfer_approved",
    entityType: "payment",
    entityId: paymentId,
  });

  revalidatePath("/admin/payments");
}

export async function rejectBankTransferAction(formData: FormData): Promise<void> {
  const user = await requireCapability("reject_bank_transfer");
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  // Every rejection carries a recorded reason — PAYMENT_SECURITY_
  // REVIEW.md §16's "no refund/rejection without a reason" rule,
  // applied here to rejections too.
  if (!paymentId || !reason) return;

  // Same admin/secret-key client as approveBankTransferAction above,
  // same reason — public.payments grants UPDATE to service_role only.
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("payments")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    })
    .eq("id", paymentId)
    .eq("status", "awaiting_verification");

  if (error) {
    console.error("[admin] bank transfer rejection failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "payment.bank_transfer_rejected",
    entityType: "payment",
    entityId: paymentId,
    metadata: { reason },
  });

  revalidatePath("/admin/payments");
}

// TD-043 — "Reconcile Now": lets staff manually trigger the same
// authoritative Paystack verify-and-apply path the customer's own
// payment status page already runs automatically (reconcilePending
// GatewayPayment / applyGatewayEventToPayment), for a gateway payment
// stuck at "pending" with no webhook ever received and no return
// visit from the customer.
//
// Deliberately the ONLY thing this action can do: it takes nothing
// but a paymentId, and reconcilePendingGatewayPayment() itself decides
// the resulting status purely from what Paystack's own verify API
// reports — there is no parameter, code path, or capability here that
// lets a human choose or force a payment into any status. If you're
// looking for "just mark it Paid," that action does not exist by
// design (per PAYMENT_SECURITY_REVIEW.md's authoritative-source rule
// and your explicit instruction on this TD).
export async function reconcilePaymentAction(formData: FormData): Promise<void> {
  const user = await requireCapability("reconcile_payment");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;

  // Defensive scope check — reconcilePendingGatewayPayment() already
  // no-ops safely on a non-gateway or already-resolved row, but
  // confirming here first keeps the audit log entry meaningful (only
  // logged when there was actually something to reconcile) rather
  // than recording a no-op attempt.
  const supabase = createAdminClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, payment_method")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment || payment.payment_method !== "gateway" || payment.status !== "pending") {
    return;
  }

  const resolvedStatus = await reconcilePendingGatewayPayment(paymentId);

  await logActivity({
    actorUserId: user.id,
    action: "payment.reconciled",
    entityType: "payment",
    entityId: paymentId,
    metadata: { resolvedStatus },
  });

  revalidatePath("/admin/payments");
  // TD-043 Part B — Reconcile Now now lives on the payment detail
  // page; revalidate it too so the resulting status (completed/
  // failed/still-pending) shows immediately without a manual refresh.
  revalidatePath(`/admin/payments/${paymentId}`);
}

// TD-043 completion-idempotency remediation — retries a stuck/failed
// entry in the durable receipt outbox (payment_receipt_jobs). This is
// deliberately narrow and cannot touch anything financial: it never
// reads or writes payments.status, amount_collected, gateway_reference,
// or any other payment field, and it never creates a payment. It only
// operates on the receipt job row itself, and only when that job is
// not already 'sent' — a confirmed-sent receipt is never re-dispatched
// through this path (see PAYMENT_SECURITY_REVIEW.md's authoritative-
// source rule: no path here lets a human force a financial outcome,
// same reasoning as reconcilePaymentAction above).
export async function retryReceiptJobAction(formData: FormData): Promise<void> {
  const user = await requireCapability("reconcile_payment");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;

  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("payment_receipt_jobs")
    .select("id, status, attempt_count")
    .eq("payment_id", paymentId)
    .eq("outcome", "completed")
    .maybeSingle();

  if (!job || job.status === "sent" || job.status === "processing") {
    // Nothing to retry: no job, already confirmed sent (never
    // re-dispatched from here), or a genuinely concurrent attempt is
    // already in flight.
    return;
  }

  // Conditional claim on this specific retry attempt — mirrors the
  // same "conditional UPDATE, check the row count" pattern used
  // throughout TD-043, so a rapid double-click on this button can't
  // trigger two concurrent sends either.
  const { data: claimed } = await supabase
    .from("payment_receipt_jobs")
    .update({ status: "processing", attempt_count: job.attempt_count + 1, last_attempted_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id")
    .maybeSingle();

  if (!claimed) return; // lost a race to another retry attempt

  const result = await sendPaymentReceiptEmail(paymentId);

  await supabase
    .from("payment_receipt_jobs")
    .update({
      status: result.ok ? "sent" : "failed",
      provider_result: result.ok ? result.mode : null,
      last_error: result.ok ? null : result.error,
    })
    .eq("id", job.id);

  await logActivity({
    actorUserId: user.id,
    action: "payment.receipt_retry",
    entityType: "payment",
    entityId: paymentId,
    metadata: { outcome: result.ok ? "sent" : "failed", attemptCount: job.attempt_count + 1 },
  });

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
}

// Ghana-only today, same as every other payments module file — see
// checkout/actions.ts's ACTIVE_COUNTRY comment for the shared reasoning.
const ACTIVE_CURRENCY = "GHS";

// The confirm-before-activate step happens entirely client-side
// (AddExchangeRateForm's own local state) — this action is only ever
// called once the admin has already reviewed the preview and clicked
// the final confirm button, so it does the insert, not another check.
export async function addExchangeRateAction(formData: FormData): Promise<void> {
  const user = await requireCapability("manage_currencies");
  const rateToUsd = Number(formData.get("rateToUsd"));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!Number.isFinite(rateToUsd) || rateToUsd <= 0) {
    redirect("/admin/payments/exchange-rates?error=invalid-rate");
  }

  const result = await insertExchangeRate({
    currencyCode: ACTIVE_CURRENCY,
    rateToUsd,
    reason,
    actorUserId: user.id,
  });

  if (!result.ok) {
    redirect("/admin/payments/exchange-rates?error=insert-failed");
  }

  await logActivity({
    actorUserId: user.id,
    action: "payment.exchange_rate_added",
    entityType: "exchange_rate",
    entityId: ACTIVE_CURRENCY,
    metadata: { currencyCode: ACTIVE_CURRENCY, rateToUsd, reason },
  });

  revalidatePath("/admin/payments/exchange-rates");
  redirect("/admin/payments/exchange-rates");
}

async function syncEntityAfterBankTransferDecision(entityType: string, entityId: string): Promise<void> {
  // Admin/secret-key client, not the session client — same reason as
  // the payments write in approveBankTransferAction above: the caller
  // has already enforced authorization via requireCapability(), this
  // is already-authorized bookkeeping, not a fresh access decision.
  // Matches src/lib/payments/gatewaySync.ts's syncEntityPaymentStatus
  // — the webhook-side equivalent this function was written to mirror
  // — which creates its own admin client the exact same way.
  const supabase = createAdminClient();
  const table = entityType === "enquiry" ? "enquiries" : "workshop_registrations";

  const { data: entity, error: entityError } = await supabase
    .from(table)
    .select("amount_due")
    .eq("id", entityId)
    .maybeSingle();
  if (entityError) {
    console.error("[admin] bank transfer sync: failed to read entity", { table, entityId, error: entityError.message });
    return;
  }
  if (!entity) {
    console.error("[admin] bank transfer sync: entity not found", { table, entityId });
    return;
  }

  const { data: completedPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("reference_amount_usd, payment_type")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "completed");
  if (paymentsError) {
    console.error("[admin] bank transfer sync: failed to read completed payments", { entityType, entityId, error: paymentsError.message });
    return;
  }

  const totalPaidUsd = (completedPayments ?? []).reduce((sum, p) => {
    const isRefund = p.payment_type === "refund";
    const amount = Number(p.reference_amount_usd ?? 0);
    return isRefund ? sum - amount : sum + amount;
  }, 0);

  const amountDue = Number(entity.amount_due ?? 0);
  const paymentStatus = totalPaidUsd <= 0 ? "Pending" : totalPaidUsd >= amountDue ? "Paid" : "Pending";

  const { error: updateError } = await supabase
    .from(table)
    .update({ amount_paid: Math.round(totalPaidUsd * 100) / 100, payment_status: paymentStatus })
    .eq("id", entityId);
  if (updateError) {
    console.error("[admin] bank transfer sync: failed to update entity balance", { table, entityId, error: updateError.message });
  }
}
