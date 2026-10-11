import type { PaymentWebhookEvent } from "@/lib/payments/types";

// READ-ONLY assessment of what Paystack says about a payment attempt, and — in plain words — what
// "Reconcile Now" WOULD do with that answer. Nothing here (or in the action that uses it) writes to
// payments, enquiries or any financial record.

export type PaystackStatusAssessment = {
  paystackStatus: string; // Paystack's own status word (success | abandoned | failed | ongoing | pending | reversed | not found …)
  amount: number | null;
  currency: string | null;
  channel: string | null;
  mapped: PaymentWebhookEvent["status"];
  expected: { amount: number; currency: string };
  matchesLockedAmount: boolean | null;
  wouldDo: string;
};

const TOLERANCE = 0.05; // same tolerance as applyGatewayEventToPayment (Security Review §9)

export function assessPaystackStatus(
  event: Pick<PaymentWebhookEvent, "status" | "amount" | "currency" | "channel" | "raw">,
  payment: { converted_amount: number | string; payment_currency: string }
): PaystackStatusAssessment {
  const raw = event.raw as { data?: { status?: string }; message?: string; status?: boolean } | null;
  const paystackStatus = raw?.data?.status ?? (raw && raw.status === false ? `not found / rejected (${raw.message ?? "no detail"})` : "unknown");
  const expected = { amount: Number(payment.converted_amount), currency: payment.payment_currency };
  const matches = event.amount == null || event.currency == null ? null : Math.abs(event.amount - expected.amount) <= TOLERANCE && event.currency === expected.currency;

  let wouldDo: string;
  if (event.status === "completed") {
    wouldDo = matches
      ? "Reconcile Now WOULD mark this payment completed, record the amount received, add USD to the receivable (amount paid and payment status), send the client a receipt email and log the activity."
      : "Paystack reports success but the amount/currency does NOT match what was locked. Reconcile Now would mark the payment FAILED and log an amount mismatch — it would NOT credit the receivable. The money would need manual handling.";
  } else if (event.status === "failed") {
    wouldDo = "Paystack says this attempt is over (failed, abandoned or not found). Reconcile Now would mark the payment failed (the row and its history stay) and release the 'attempt already in progress' lock. Money collected: none reported.";
  } else if (event.status === "refunded") {
    wouldDo = "Paystack reports the transaction reversed. Reconcile Now cannot safely process this and would leave it as it is.";
  } else {
    wouldDo = "Paystack still shows the transaction as in progress. Reconcile Now would change nothing.";
  }
  return { paystackStatus, amount: event.amount, currency: event.currency, channel: event.channel, mapped: event.status, expected, matchesLockedAmount: matches, wouldDo };
}

export function formatAssessment(a: PaystackStatusAssessment): string {
  const received = a.amount != null ? `${a.currency ?? ""} ${a.amount.toFixed(2)}`.trim() : "no amount reported";
  return `Paystack status: ${a.paystackStatus}. Amount reported by Paystack: ${received}${a.channel ? ` via ${a.channel}` : ""} (this attempt locked ${a.expected.currency} ${a.expected.amount.toFixed(2)}). ${a.wouldDo} Nothing was changed by this check.`;
}
