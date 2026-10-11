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
import { getProvider } from "@/lib/payments/providerRegistry";
import { assessPaystackStatus, formatAssessment } from "@/lib/payments/paystackStatusCheck";
import { sendPaymentReceiptEmail } from "@/lib/payments/receipts";
import { advanceStageOnFullPayment } from "@/lib/payments/crmStageSync";
import { actionOk, actionFail, type ActionState } from "@/lib/shared/actionState";

async function requireCapability(
  capability:
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

// Bank-transfer approve/reject moved to verificationActions.ts (Direct Bank Transfer, 2026-10): the
// old one-click "Approve" credited the REQUESTED amount without anyone recording what actually
// arrived. Decisions now go through verify_bank_transfer_payment() with the verifier's own
// record of the receipt. syncEntityAfterBankTransferDecision below is kept (it is exercised by the
// existing integration tests) but is no longer reachable from a form.

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
export async function reconcilePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCapability("reconcile_payment");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return actionFail("Nothing was saved — check the details and try again.");

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
    return actionFail("Nothing was saved — check the details and try again.");
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
  return actionOk("Reconciled.");
}

// READ-ONLY: asks Paystack (through the existing integration, with Production's own key) what the
// authoritative status of a pending gateway payment is, and explains what Reconcile Now WOULD do.
// It never writes to payments or any financial record — it only appends an audit entry saying a
// check was made. Use it to decide whether Reconcile Now is appropriate.
export async function checkPaystackStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCapability("reconcile_payment");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return actionFail("Nothing was checked — the payment wasn't identified.");

  const supabase = createAdminClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, payment_method, provider, gateway_reference, converted_amount, payment_currency")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || payment.payment_method !== "gateway" || !payment.gateway_reference) return actionFail("This isn't a gateway payment with a Paystack reference, so there is nothing to check.");

  let event;
  try {
    event = await getProvider(payment.provider as string).verifyTransaction(payment.gateway_reference as string);
  } catch (err) {
    console.error("[admin] paystack status check failed", err instanceof Error ? err.message : err);
    return actionFail("Couldn't reach Paystack to check this payment. Nothing was changed — try again shortly, or check the Paystack dashboard.");
  }
  const assessment = assessPaystackStatus(event, payment as { converted_amount: number | string; payment_currency: string });
  await logActivity({
    actorUserId: user.id,
    action: "payment.paystack_status_checked",
    entityType: "payment",
    entityId: paymentId,
    metadata: { paystackStatus: assessment.paystackStatus, amount: assessment.amount, currency: assessment.currency, matchesLockedAmount: assessment.matchesLockedAmount, currentPaymentStatus: payment.status, note: "Read-only check — no payment or receivable was changed." },
  });
  return actionOk(formatAssessment(assessment));
}

// TD-043 completion-idempotency remediation — retries a stuck/failed
// entry in the durable receipt outbox (payment_receipt_jobs). This is
// deliberately narrow and cannot touch anything financial: it never
// reads or writes payments.status, amount_collected, gateway_reference,
// or any other payment field, and it never creates a payment or a new
// receipt-job row. It only operates on the receipt job row itself, and
// only when that job is not already 'sent' — a confirmed-sent receipt
// is never re-dispatched through this path (see PAYMENT_SECURITY_
// REVIEW.md's authoritative-source rule: no path here lets a human
// force a financial outcome, same reasoning as reconcilePaymentAction
// above).
//
// TD-043 defense-in-depth (migration 0032) — the actual claim decision
// (pending/failed always claimable; a stuck 'processing' job claimable
// only once genuinely stale) is delegated entirely to
// reclaim_stale_receipt_job(), a single atomic Postgres statement using
// only the database's own now() — never this process's Date.now(). A
// job that's really still in flight (processing, not yet stale) or
// already 'sent' matches none of that function's branches and this
// action correctly no-ops, exactly as before this change.
export async function retryReceiptJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireCapability("reconcile_payment");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return actionFail("Nothing was saved — check the details and try again.");

  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("payment_receipt_jobs")
    .select("id, status")
    .eq("payment_id", paymentId)
    .eq("outcome", "completed")
    .maybeSingle();

  if (!job || job.status === "sent") return actionFail("Nothing was saved — check the details and try again."); // nothing to retry, or already confirmed sent

  const { data: claimedRows, error: claimError } = await supabase.rpc("reclaim_stale_receipt_job", {
    p_job_id: job.id,
  });
  if (claimError) {
    console.error("[admin] reclaim_stale_receipt_job failed", claimError.message);
    return actionFail("Could not save your change. Please try again.");
  }
  const claimed = Array.isArray(claimedRows) && claimedRows.length > 0 ? claimedRows[0] : null;
  if (!claimed) return actionFail("Nothing was saved — check the details and try again."); // lost a race, or genuinely not yet eligible (fresh processing / already sent)

  const result = await sendPaymentReceiptEmail(paymentId);

  await supabase
    .from("payment_receipt_jobs")
    .update({
      status: result.ok ? "sent" : "failed",
      provider_result: result.ok ? result.mode : null,
      last_error: result.ok ? null : result.error,
    })
    .eq("id", claimed.id);

  await logActivity({
    actorUserId: user.id,
    action: "payment.receipt_retry",
    entityType: "payment",
    entityId: paymentId,
    metadata: { outcome: result.ok ? "sent" : "failed", attemptCount: claimed.attempt_count },
  });

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
  return actionOk("Retried.");
}

// Local currencies with an admin-managed rate: GHS (Ghana) and QAR (Qatar bank transfer).
const MANAGED_CURRENCIES = ["GHS", "QAR"];

// The confirm-before-activate step happens entirely client-side
// (AddExchangeRateForm's own local state) — this action is only ever
// called once the admin has already reviewed the preview and clicked
// the final confirm button, so it does the insert, not another check.
export async function addExchangeRateAction(formData: FormData): Promise<void> {
  const user = await requireCapability("manage_currencies");
  const rateToUsd = Number(formData.get("rateToUsd"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const requestedCurrency = String(formData.get("currencyCode") ?? "GHS");
  const ACTIVE_CURRENCY = MANAGED_CURRENCIES.includes(requestedCurrency) ? requestedCurrency : "GHS";
  const back = `/admin/payments/exchange-rates?currency=${ACTIVE_CURRENCY}`;

  if (!Number.isFinite(rateToUsd) || rateToUsd <= 0) {
    redirect(`${back}&error=invalid-rate`);
  }

  const result = await insertExchangeRate({
    currencyCode: ACTIVE_CURRENCY,
    rateToUsd,
    reason,
    actorUserId: user.id,
  });

  if (!result.ok) {
    redirect(`${back}&error=insert-failed`);
  }

  await logActivity({
    actorUserId: user.id,
    action: "payment.exchange_rate_added",
    entityType: "exchange_rate",
    entityId: ACTIVE_CURRENCY,
    metadata: { currencyCode: ACTIVE_CURRENCY, rateToUsd, reason },
  });

  revalidatePath("/admin/payments/exchange-rates");
  redirect(back);
}

// Exported so it can be exercised directly by integration tests, the
// same way gatewaySync.ts's applyGatewayEventToPayment() is — this
// project's established pattern for testing an admin-action's core
// logic without a real session/cookie context (see
// crmStageAutoAdvance.integration.test.ts).
export async function syncEntityAfterBankTransferDecision(entityType: string, entityId: string): Promise<void> {
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
    return;
  }

  await advanceStageOnFullPayment(supabase, entityType, entityId, paymentStatus);
}
