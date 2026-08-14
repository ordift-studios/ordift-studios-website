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
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      await logActivityAsSystem({
        action: "payment.amount_mismatch",
        entityType: "payment",
        entityId: payment.id,
        metadata: { expected: payment.converted_amount, received: event.amount, source },
      });
      return { outcome: "amount-mismatch" };
    }

    const netAmountReceived =
      event.amount != null && event.gatewayFee != null ? event.amount - event.gatewayFee : null;

    await admin
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
      .eq("id", payment.id);

    await syncEntityPaymentStatus(payment.entity_type, payment.entity_id);

    // System-attributed: the customer's own action caused this
    // completion, but there's no human session in a webhook request
    // (or in server-side reconciliation) — see logActivityAsSystem()'s
    // doc comment for why null is correct here rather than inventing a
    // synthetic "system user."
    await logActivityAsSystem({
      action: "payment.completed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { amount: event.amount, currency: event.currency, channel: event.channel, source },
    });

    await sendPaymentReceiptEmail(payment.id);
    return { outcome: "completed" };
  }

  if (event.status === "failed") {
    await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
    await logActivityAsSystem({
      action: "payment.failed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { source },
    });
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
