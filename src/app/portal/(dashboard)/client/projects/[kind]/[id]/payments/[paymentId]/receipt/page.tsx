import Link from "next/link";
import { redirect } from "next/navigation";
import { contentRepository } from "@/lib/content";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspaceOverview, getWorkspacePaymentById, isProjectKind } from "@/lib/portal/workspace";
import PrintReceiptButton from "./PrintReceiptButton";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const CHANNEL_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  bank: "Bank",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  partial: "Partial Payment",
  balance: "Balance Payment",
  full: "Full Payment",
  refund: "Refund",
};

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ kind: string; id: string; paymentId: string }>;
}) {
  const { kind, id, paymentId } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const [payment, overview, siteSettings] = await Promise.all([
    getWorkspacePaymentById(kind, id, paymentId, user.id),
    getWorkspaceOverview(kind, id, user.id),
    contentRepository.getSiteSettings(),
  ]);

  if (!payment) redirect(`/portal/client/projects/${kind}/${id}/payments`);
  // A receipt only makes sense for a settled payment — anything else
  // belongs on the status page, which already covers every other state.
  if (payment.status !== "completed") {
    redirect(`/portal/client/projects/${kind}/${id}/payments/${payment.id}/status`);
  }

  const methodLabel =
    payment.paymentMethod === "bank_transfer"
      ? "Bank Transfer"
      : (payment.channel ? CHANNEL_LABELS[payment.channel] : null) ?? "Card or Mobile Money";
  const receiptDate = payment.reviewedAt ?? payment.updatedAt ?? payment.createdAt;

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/portal/client/projects/${kind}/${id}/payments`}
          className="font-sans text-body-small text-ordift-ink-muted hover:text-ordift-ink underline underline-offset-4"
        >
          ← Back to Payments
        </Link>
        <PrintReceiptButton />
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-10">
        <div className="flex items-start justify-between border-b border-black/10 pb-6 mb-6">
          <div>
            <p className="font-serif font-medium text-2xl text-ordift-ink">{siteSettings.siteName}</p>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{siteSettings.contactEmail}</p>
          </div>
          <div className="text-right">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Receipt</p>
            <p className="font-sans text-body text-ordift-ink mt-1">{payment.recordId ?? payment.id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Billed To</p>
            <p className="font-sans text-body text-ordift-ink mt-1">{user.fullName ?? user.email}</p>
          </div>
          <div className="text-right">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Date</p>
            <p className="font-sans text-body text-ordift-ink mt-1">{formatDate(receiptDate)}</p>
          </div>
          {overview && (
            <div className="col-span-2">
              <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Project</p>
              <p className="font-sans text-body text-ordift-ink mt-1">{overview.title}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-ordift-offwhite p-6 mb-6">
          <div className="flex items-baseline justify-between">
            <p className="font-sans text-body text-ordift-ink-muted">
              {PAYMENT_TYPE_LABELS[payment.paymentType] ?? "Payment"}
            </p>
            <p className="font-serif font-medium text-3xl text-ordift-ink">{formatUsd(payment.referenceAmountUsd)}</p>
          </div>
          {payment.paymentCurrency !== "USD" && (
            <p className="font-sans text-body-small text-ordift-ink-muted text-right mt-1">
              Charged as {payment.paymentCurrency} {payment.convertedAmount.toFixed(2)}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4 text-body-small">
          <div>
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Payment Method</dt>
            <dd className="font-sans text-ordift-ink mt-0.5">
              {methodLabel}
              {payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ""}
            </dd>
          </div>
          <div className="text-right">
            <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Status</dt>
            <dd className="font-sans text-green-800 mt-0.5">Paid</dd>
          </div>
          {payment.gatewayReference && (
            <div className="col-span-2">
              <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Transaction Reference</dt>
              <dd className="font-sans text-ordift-ink mt-0.5 font-mono">{payment.gatewayReference}</dd>
            </div>
          )}
        </dl>

        <p className="font-sans text-caption text-ordift-ink-muted mt-8 pt-6 border-t border-black/10">
          Thank you for your business with {siteSettings.siteName}. This receipt was generated automatically and is valid
          without a signature.
        </p>
      </div>
    </div>
  );
}
