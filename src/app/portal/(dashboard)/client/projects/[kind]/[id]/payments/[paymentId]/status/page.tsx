import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspacePaymentById, isProjectKind } from "@/lib/portal/workspace";
import { reconcilePendingGatewayPayment } from "@/lib/payments/reconcilePendingPayment";
import PendingAutoRefresh from "./PendingAutoRefresh";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CHANNEL_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  bank: "Bank",
};

function methodLabel(paymentMethod: string, channel: string | null): string {
  if (paymentMethod === "bank_transfer") return "Bank Transfer";
  return channel ? (CHANNEL_LABELS[channel] ?? "Card or Mobile Money") : "Card or Mobile Money";
}

export default async function PaymentStatusPage({
  params,
}: {
  params: Promise<{ kind: string; id: string; paymentId: string }>;
}) {
  const { kind, id, paymentId } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  let payment = await getWorkspacePaymentById(kind, id, paymentId, user.id);
  if (!payment) redirect(`/portal/client/projects/${kind}/${id}/payments`);

  // Webhooks are best-effort, not guaranteed — a checkout the customer
  // abandons, or a decline that never completes a full charge attempt
  // on the gateway's side, can arrive with no webhook at all. Actively
  // verify with the gateway here so this page doesn't say "Confirming
  // Your Payment" forever; PendingAutoRefresh re-runs this on every
  // reload while still pending.
  if (payment.status === "pending") {
    const resolvedStatus = await reconcilePendingGatewayPayment(paymentId);
    if (resolvedStatus !== "pending") {
      payment = (await getWorkspacePaymentById(kind, id, paymentId, user.id)) ?? payment;
    }
  }

  const paymentsHref = `/portal/client/projects/${kind}/${id}/payments`;
  const checkoutHref = `/portal/client/projects/${kind}/${id}/payments/checkout`;
  const receiptHref = `/portal/client/projects/${kind}/${id}/payments/${payment.id}/receipt`;

  const backButton = (
    <Link
      href={paymentsHref}
      className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
    >
      Back to Payments
    </Link>
  );

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Reference/amount/method/date summary — shown for every status, not
          just completed, so a client opening a pending/failed/refunded
          payment from history still sees exactly what it's for. Purely
          display: sourced from the same already-ownership-checked `payment`
          row every branch below uses, nothing fetched separately. */}
      <p className="font-sans text-caption text-ordift-ink-muted text-center">
        {payment.recordId ?? "Payment"} · {payment.paymentCurrency} {payment.convertedAmount.toFixed(2)}
        {payment.paymentCurrency !== "USD" && ` (${formatUsd(payment.referenceAmountUsd)})`} ·{" "}
        {methodLabel(payment.paymentMethod, payment.channel)} · {formatDateTime(payment.createdAt)}
      </p>

      {payment.status === "completed" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 sm:p-8 text-center space-y-4">
          <p className="font-serif font-medium text-xl text-ordift-ink">Payment Successful</p>
          <p className="font-serif font-medium text-3xl text-ordift-ink">{formatUsd(payment.referenceAmountUsd)}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Paid via {methodLabel(payment.paymentMethod, payment.channel)}
            {payment.recordId ? ` — Reference ${payment.recordId}` : ""}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href={receiptHref}
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover"
            >
              View Receipt
            </Link>
            {backButton}
          </div>
        </div>
      )}

      {payment.status === "pending" && (
        <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8 text-center space-y-4">
          <PendingAutoRefresh />
          <p className="font-serif font-medium text-xl text-ordift-ink">Confirming Your Payment</p>
          <p className="font-sans text-body text-ordift-ink-muted">
            We&apos;re still waiting for confirmation from your payment provider — this page will update automatically. This
            usually takes a few seconds.
          </p>
          {backButton}
        </div>
      )}

      {(payment.status === "failed" || payment.status === "rejected") && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 sm:p-8 text-center space-y-4">
          <p className="font-serif font-medium text-xl text-ordift-ink">
            {payment.status === "rejected" ? "Payment Not Verified" : "Payment Failed"}
          </p>
          <p className="font-sans text-body text-ordift-ink-muted">
            {payment.status === "rejected"
              ? payment.reviewNotes
                ? `Our team couldn't verify this payment: ${payment.reviewNotes}`
                : "Our team couldn't verify this payment. Please check the details and try again, or contact us."
              : "Your payment didn't go through. No charge should have been made — please try again."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href={checkoutHref}
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover"
            >
              Try Again
            </Link>
            {backButton}
          </div>
        </div>
      )}

      {payment.status === "awaiting_verification" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 sm:p-8 text-center space-y-4">
          <p className="font-serif font-medium text-xl text-ordift-ink">Pending Verification</p>
          <p className="font-sans text-body text-ordift-ink-muted">
            We&apos;ve received your proof of payment. Our team will confirm it shortly — you&apos;ll see your balance update
            once approved.
          </p>
          {backButton}
        </div>
      )}

      {payment.status === "refunded" && (
        <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8 text-center space-y-4">
          <p className="font-serif font-medium text-xl text-ordift-ink">Payment Refunded</p>
          <p className="font-sans text-body text-ordift-ink-muted">
            This payment of {formatUsd(payment.referenceAmountUsd)} has been refunded.
          </p>
          {backButton}
        </div>
      )}
    </div>
  );
}
