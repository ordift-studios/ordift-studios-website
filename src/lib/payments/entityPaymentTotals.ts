// THE ONE AUTHORITATIVE CALCULATION of how much of a receivable has been collected. Only COMPLETED payments count; a completed refund subtracts; pending, awaiting-verification, information-requested,
// failed, rejected and refunded-status rows never count. The result is a USD figure (reference_amount_usd), comparable with the record's amount due. Pure; no I/O. Every writer of amount_paid and
// payment_status goes through syncEntityPaymentStatus() in gatewaySync.ts, which uses this; no other place may recompute it.
export type CountedPayment = { status: string; payment_type: string | null; reference_amount_usd: number | string | null };
export type PaymentSummary = { totalPaidUsd: number; paymentStatus: "Paid" | "Pending" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeEntityPayments(rows: CountedPayment[], amountDue: number | string | null | undefined): PaymentSummary {
  const total = rows.reduce((sum, p) => {
    if (p.status !== "completed") return sum;                                      // an attempt is never revenue
    const amount = Number(p.reference_amount_usd ?? 0);
    return p.payment_type === "refund" ? sum - amount : sum + amount;
  }, 0);
  const due = Number(amountDue ?? 0);
  return { totalPaidUsd: round2(total), paymentStatus: total <= 0 ? "Pending" : total >= due ? "Paid" : "Pending" };
}
