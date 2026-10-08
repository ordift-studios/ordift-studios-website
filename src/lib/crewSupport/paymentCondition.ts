// Configurable payment conditions for Creative Crew Support. A condition is
// chosen per quotation (before issue; frozen once issued) and states
// whether money must have been RECEIVED before the request can be
// confirmed. Default is NONE — nothing in Ordift's policy fixes a deposit,
// so none is imposed. When a condition is set it is enforced at
// confirmation against enquiries.amount_paid, which the existing payments
// module derives in USD from completed payments (Paystack and verified
// manual transfers) minus refunds. Deposits, partials and balances
// themselves are the existing payments module's job; this only reads the
// result.

export const PAYMENT_CONDITIONS = ["none", "deposit", "full"] as const;
export type PaymentCondition = (typeof PAYMENT_CONDITIONS)[number];

export const PAYMENT_CONDITION_LABELS: Record<PaymentCondition, string> = {
  none: "No payment required before confirmation",
  deposit: "Deposit required before confirmation",
  full: "Full payment required before confirmation",
};

export function isPaymentCondition(value: string): value is PaymentCondition {
  return (PAYMENT_CONDITIONS as readonly string[]).includes(value);
}

export function validatePaymentCondition(params: { condition: string; depositPercent: number | null }): { ok: true; condition: PaymentCondition; depositPercent: number | null } | { ok: false; reason: string } {
  if (!isPaymentCondition(params.condition)) return { ok: false, reason: "Choose a valid payment condition." };
  if (params.condition === "deposit") {
    const pct = params.depositPercent;
    if (pct == null || !Number.isFinite(pct) || pct <= 0 || pct > 100) return { ok: false, reason: "Enter the deposit as a percentage between 1 and 100." };
    return { ok: true, condition: "deposit", depositPercent: Math.round(pct * 100) / 100 };
  }
  return { ok: true, condition: params.condition, depositPercent: null };
}

// The USD amount that must have been received before confirmation.
export function requiredPaymentUsd(condition: PaymentCondition, depositPercent: number | null, amountDueUsd: number): number {
  if (condition === "none") return 0;
  if (condition === "full") return Math.round(amountDueUsd * 100) / 100;
  return Math.round(amountDueUsd * (depositPercent ?? 0)) / 100;
}

// null = satisfied (or none required); otherwise the reason confirmation is blocked.
export function paymentBlocker(params: { condition: PaymentCondition; depositPercent: number | null; amountDueUsd: number; amountPaidUsd: number }): string | null {
  if (params.condition === "none") return null;
  const required = requiredPaymentUsd(params.condition, params.depositPercent, params.amountDueUsd);
  if (!(params.amountDueUsd > 0)) return "A payment is required before confirmation, but no amount due has been established from an accepted quotation yet.";
  if (params.amountPaidUsd + 0.005 >= required) return null;
  const label = params.condition === "full" ? "Full payment" : `A ${params.depositPercent}% deposit`;
  return `${label} (USD ${required.toFixed(2)}) must be received before confirmation — USD ${params.amountPaidUsd.toFixed(2)} received so far. Record or verify the payment in Payments first.`;
}

// How the condition is shown to the client (quotation, printable, portal).
export function describePaymentCondition(condition: PaymentCondition, depositPercent: number | null, usdTotal: number | null): string | null {
  if (condition === "none") return null;
  const required = usdTotal != null ? requiredPaymentUsd(condition, depositPercent, usdTotal) : null;
  const amount = required != null ? ` (USD ${required.toFixed(2)})` : "";
  return condition === "full" ? `Full payment${amount} is required before your request is confirmed.` : `A ${depositPercent}% deposit${amount} is required before your request is confirmed.`;
}
