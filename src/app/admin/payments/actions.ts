"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { logActivity } from "@/lib/admin/activityLog";
import { insertExchangeRate } from "@/lib/payments/currency";

async function requireCapability(
  capability: "approve_bank_transfer" | "reject_bank_transfer" | "issue_refund" | "manage_currencies"
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
