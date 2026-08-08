import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspacePaymentSummary, getWorkspacePaymentHistory, isProjectKind } from "@/lib/portal/workspace";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  awaiting_verification: "Pending Verification",
  completed: "Completed",
  failed: "Failed",
  refunded: "Refunded",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-50 text-green-800",
  pending: "bg-ordift-offwhite text-ordift-ink-muted",
  awaiting_verification: "bg-amber-50 text-amber-800",
  failed: "bg-red-50 text-red-700",
  rejected: "bg-red-50 text-red-700",
  refunded: "bg-ordift-offwhite text-ordift-ink-muted",
};

export default async function PaymentsTabPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const [summary, history] = await Promise.all([
    getWorkspacePaymentSummary(kind, id, user.id),
    getWorkspacePaymentHistory(kind, id, user.id),
  ]);
  if (!summary) return null;

  const hasPendingBankTransfer = history.some((p) => p.paymentMethod === "bank_transfer" && p.status === "awaiting_verification");

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8">
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Balance</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {summary.amountDueUsd == null ? (
              <p className="font-serif font-medium text-3xl text-ordift-ink">Awaiting Quote</p>
            ) : (
              <p className="font-serif font-medium text-3xl text-ordift-ink">
                {formatUsd(summary.balanceUsd)}{" "}
                <span className="font-sans text-body-small text-ordift-ink-muted font-normal">
                  due of {formatUsd(summary.amountDueUsd)}
                </span>
              </p>
            )}
            {summary.amountPaidUsd > 0 && (
              <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
                {formatUsd(summary.amountPaidUsd)} paid so far
              </p>
            )}
          </div>
          {summary.amountDueUsd == null ? (
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-ordift-offwhite font-sans text-body-small font-medium text-ordift-ink-muted">
              Amount Not Set
            </span>
          ) : summary.balanceUsd > 0 ? (
            <Link
              href={`/portal/client/projects/${kind}/${id}/payments/checkout`}
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2"
            >
              Pay Now
            </Link>
          ) : (
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-green-50 font-sans text-body-small font-medium text-green-800">
              Paid in full
            </span>
          )}
        </div>
        {hasPendingBankTransfer && (
          <p className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-4 py-3 mt-5">
            A bank transfer is awaiting verification by our team — you don&apos;t need to submit another payment while this is pending.
          </p>
        )}
      </div>

      <div>
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Payment History</h2>
        {history.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No payments yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Reference</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Method</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Amount</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Status</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Date</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">{p.recordId ?? "—"}</td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted capitalize">
                      {p.paymentMethod === "gateway" ? p.provider : "Bank Transfer"}
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                      {p.paymentCurrency} {p.convertedAmount.toFixed(2)}{" "}
                      {p.paymentCurrency !== "USD" && (
                        <span className="text-ordift-ink-muted/70">({formatUsd(p.referenceAmountUsd)})</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full font-sans text-caption font-medium ${STATUS_STYLES[p.status] ?? "bg-ordift-offwhite text-ordift-ink-muted"}`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      {p.status === "completed" ? (
                        <Link
                          href={`/portal/client/projects/${kind}/${id}/payments/${p.id}/receipt`}
                          className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
                        >
                          Receipt
                        </Link>
                      ) : (
                        <Link
                          href={`/portal/client/projects/${kind}/${id}/payments/${p.id}/status`}
                          className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
                        >
                          View Status
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
