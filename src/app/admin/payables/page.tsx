import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import RunCleanupButton from "@/components/payables/RunCleanupButton";

export const metadata: Metadata = {
  title: "Payables — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  payout_initiated: "Processing",
  paid: "Paid",
  failed: "Failed",
  on_hold: "On Hold",
  disputed: "Disputed",
  cancelled: "Cancelled",
  reversed: "Reversed",
};

const SUMMARY_ORDER = ["pending_approval", "approved", "payout_initiated", "paid", "failed", "on_hold", "disputed"];

export default async function AdminPayablesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : null;

  const obligations = await listAllPaymentObligations();
  const outstanding = obligations.filter((o) => !["paid", "cancelled", "reversed"].includes(o.status));
  const counts = new Map<string, number>();
  for (const o of obligations) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);

  const filtered = statusFilter ? obligations.filter((o) => o.status === statusFilter) : obligations;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Payables</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Every payee Ordift owes money to — staff, vendors, contractors, freelancers, instructors, talent, and
            consultants alike, all through the same obligation/approval/payment infrastructure. No integrated payout
            provider is connected — approving a payable never moves money; a payment is only ever recorded through a
            controlled manual-payment action.
            {auth.actedAsOverride && " Viewing via Super Admin override — this capability is currently unoccupied."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Link href="/admin/payables/payees" className="rounded-lg border border-black/10 bg-white px-4 py-2 font-sans text-body-small text-ordift-ink hover:border-black/25">
            Payees &amp; Onboarding →
          </Link>
          <RunCleanupButton />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Link
          href="/admin/payables"
          className={`rounded-xl border p-4 ${!statusFilter ? "border-ordift-gold-pressed bg-ordift-gold-pressed/5" : "border-black/10 bg-white"}`}
        >
          <p className="font-sans text-caption text-ordift-ink-muted">Total Outstanding</p>
          <p className="font-serif text-card-title text-ordift-ink mt-1">{outstanding.length}</p>
        </Link>
        {SUMMARY_ORDER.map((status) => (
          <Link
            key={status}
            href={`/admin/payables?status=${status}`}
            className={`rounded-xl border p-4 ${statusFilter === status ? "border-ordift-gold-pressed bg-ordift-gold-pressed/5" : "border-black/10 bg-white"}`}
          >
            <p className="font-sans text-caption text-ordift-ink-muted">{STATUS_LABELS[status]}</p>
            <p className="font-serif text-card-title text-ordift-ink mt-1">{counts.get(status) ?? 0}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">{statusFilter ? STATUS_LABELS[statusFilter] ?? statusFilter : "All Payables"}</h2>
          {statusFilter && (
            <Link href="/admin/payables" className="font-sans text-caption text-ordift-ink-muted underline">
              Clear filter
            </Link>
          )}
        </div>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {filtered.map((o) => (
            <li key={o.id} className="px-4 py-3">
              <Link href={`/admin/payables/${o.id}`} className="block hover:opacity-70">
                <p className="font-sans text-body-small text-ordift-ink">{o.description}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {o.currency} {o.amount} · {o.sourceType} · {STATUS_LABELS[o.status] ?? o.status}
                </p>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None.</li>}
        </ul>
      </section>
    </div>
  );
}
