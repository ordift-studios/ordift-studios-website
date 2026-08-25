import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import { listGradeCompensationBands } from "@/lib/organization/gradeCompensation";

export const metadata: Metadata = {
  title: "Finance — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// VAULT's jurisdiction hub. Reuses existing payment_obligations,
// grade_compensation_bands, and links to /admin/payments (Paystack
// collections, refund reconciliation) rather than duplicating any of
// them. No outbound payout capability exists — nothing here implies
// otherwise.
export default async function ExecutiveFinancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.workshopRevenueView);
  if (!auth.ok) redirect("/admin/executive");

  const [obligations, compensationBands] = await Promise.all([listAllPaymentObligations(), listGradeCompensationBands()]);
  const pending = obligations.filter((o) => o.status === "pending_approval");
  const approved = obligations.filter((o) => o.status === "approved");

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">VAULT · Finance</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Financial visibility, payment-obligation review/approval, payment-instruction verification, compensation
          banding. No real outbound payout provider is connected — approving an obligation never moves money.{" "}
          {auth.actedAsOverride && "Viewing via Super Admin override — this Position is currently unoccupied."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/payments" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Payments</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Paystack collections, exchange rates, refund reconciliation.</p>
        </Link>
        <Link href="/admin/workshops" className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25">
          <p className="font-serif text-card-title text-ordift-ink">Workshop Financial Overview</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Per-workshop revenue/outstanding — open a workshop&rsquo;s dashboard.</p>
        </Link>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Payment Obligations</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">
          A &ldquo;payment obligation&rdquo; is simply an internal record that Ordift owes someone an amount (e.g. an
          instructor&rsquo;s agreed compensation) — approving one confirms the record only, it never moves money.
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">{pending.length} pending approval · {approved.length} approved (not yet paid — no payout provider connected)</p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {obligations.map((o) => (
            <li key={o.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{o.description}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">{o.currency} {o.amount} · {o.sourceType} · {o.status}</p>
            </li>
          ))}
          {obligations.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Grade Compensation Bands</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">Structural guidance only — no amounts populated yet.</p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {compensationBands.map((b) => (
            <li key={b.id} className="px-4 py-2.5 font-sans text-body-small text-ordift-ink">
              {b.gradeCode} — {b.currency} {b.minimumAmount ?? "—"} / {b.midpointAmount ?? "—"} / {b.maximumAmount ?? "—"}
            </li>
          ))}
          {compensationBands.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None defined yet.</li>}
        </ul>
      </section>
    </div>
  );
}
