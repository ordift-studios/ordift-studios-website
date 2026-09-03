import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getPaymentObligation } from "@/lib/payments/payoutObligations";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listPayableItems, PAYABLE_ITEM_KINDS } from "@/lib/payables/payableItems";
import { listPaymentEvidence } from "@/lib/payables/paymentEvidence";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { addPayableItemAction, approvePayableAction, recordManualPaymentAction, addPaymentEvidenceAction } from "../actions";

export const metadata: Metadata = {
  title: "Payable — Payables — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPayableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) redirect("/admin/payables");

  const { id } = await params;
  const obligation = await getPaymentObligation(id);
  if (!obligation) notFound();

  const [payee, items, evidence, history] = await Promise.all([
    getPayeeProfile(obligation.payeeProfileId),
    listPayableItems(id),
    listPaymentEvidence(id),
    getActivityForEntity("payment_obligation", id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance · Payables</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{obligation.description}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {payee && (
            <Link href={`/admin/payables/payees/${payee.id}`} className="underline">
              {payee.fullName ?? "(no name)"}
            </Link>
          )}{" "}
          · {obligation.currency} {obligation.amount} · {obligation.sourceType} · status: <strong>{obligation.status}</strong>
        </p>
      </div>

      {/* Line items */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Payable Items</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">
          The total ({obligation.currency} {obligation.amount}) is automatically kept equal to the sum of these
          items the moment any exist.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-4">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{it.description}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {it.kind} · {it.currency} {it.amount}
              </p>
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">Single-amount payable — no line items.</li>}
        </ul>
        {obligation.status === "pending_approval" && (
          <details className="rounded-lg border border-black/10 p-4">
            <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Add a line item</summary>
            <form action={addPayableItemAction} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <input type="hidden" name="paymentObligationId" value={obligation.id} />
              <label className="flex flex-col gap-1">
                <span className="font-sans text-caption text-ordift-ink-muted">Kind</span>
                <select name="kind" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  {PAYABLE_ITEM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-sans text-caption text-ordift-ink-muted">Description</span>
                <input name="description" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-sans text-caption text-ordift-ink-muted">Amount ({obligation.currency})</span>
                <input name="amount" type="number" step="0.01" min="0.01" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <div className="flex items-end">
                <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                  Add Item
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      {/* Approval */}
      {obligation.status === "pending_approval" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Approval</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-3">Approving confirms the record only — it never moves money.</p>
          <form action={approvePayableAction}>
            <input type="hidden" name="obligationId" value={obligation.id} />
            <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
              Approve
            </button>
          </form>
        </section>
      )}

      {/* Record payment */}
      {obligation.status === "approved" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Record Payment</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-3">
            No integrated payout provider is connected — record the payment made outside Ordift (bank transfer,
            mobile money, or another approved method). Amount and currency must match this payable exactly.
          </p>
          <form action={recordManualPaymentAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="obligationId" value={obligation.id} />
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Method</span>
              <select name="method" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="bank_transfer">Bank transfer</option>
                <option value="mobile_money">Mobile money</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Payment date</span>
              <input name="paidAt" type="date" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Amount ({obligation.currency})</span>
              <input name="amount" type="number" step="0.01" defaultValue={obligation.amount} required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input type="hidden" name="currency" value={obligation.currency} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Reference</span>
              <input name="reference" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                Record Payment
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Evidence */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Payment Evidence</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-4">
          {evidence.map((ev) => (
            <li key={ev.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{ev.evidenceType}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {ev.reference ?? "no reference"} {ev.hasFile ? "· file attached" : ""} · {new Date(ev.uploadedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
          {evidence.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
        <details className="rounded-lg border border-black/10 p-4">
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Attach evidence</summary>
          <form action={addPaymentEvidenceAction} encType="multipart/form-data" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <input type="hidden" name="paymentObligationId" value={obligation.id} />
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Type</span>
              <select name="evidenceType" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="receipt">Receipt</option>
                <option value="bank_confirmation">Bank confirmation</option>
                <option value="momo_confirmation">Mobile money confirmation</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-caption text-ordift-ink-muted">Reference (optional)</span>
              <input name="reference" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-sans text-caption text-ordift-ink-muted">File (optional)</span>
              <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="font-sans text-body-small" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
              <textarea name="notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
                Save Evidence
              </button>
            </div>
          </form>
        </details>
      </section>

      {/* Audit trail */}
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Audit Trail</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {history.map((h) => (
            <li key={h.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">{h.action}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {h.actorLabel} · {new Date(h.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {history.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
