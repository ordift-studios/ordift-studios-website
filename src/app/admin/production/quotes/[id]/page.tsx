import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getSupplierQuoteById } from "@/lib/production/supplierQuotes";
import { getSupplierById } from "@/lib/production/suppliers";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { setSupplierQuoteStatusAction } from "../../actions";
import { QUOTE_STATUS_OPTIONS, quoteStatusLabel } from "../page";

export const metadata: Metadata = {
  title: "Supplier Quote — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// A status change into a high-consequence state (Approved Internally,
// Committed) reuses ConfirmSubmitButton — the same deliberate-
// confirmation guard-rail the Payables Engagement Lifecycle UI uses
// for its own irreversible-feeling transitions — rather than a plain
// one-click button. The real authorization/safety boundary remains
// server-side (setSupplierQuoteStatus() never touches payables/payout
// code, whatever the status), this is purely a human guard-rail.
const HIGH_CONSEQUENCE_STATUSES = new Set(["approved_internally", "committed"]);

export default async function ProductionSupplierQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const quote = await getSupplierQuoteById(user.id, id);
  if (!quote) notFound();
  const supplier = await getSupplierById(user.id, quote.supplierId);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/production/quotes" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Supplier Quotes</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{quote.description}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          {supplier ? <Link href={`/admin/production/suppliers/${supplier.id}`} className="underline underline-offset-4">{supplier.supplierName}</Link> : "Unknown supplier"} · {quote.referenceType}:{quote.referenceId} · <strong>{quoteStatusLabel(quote.status)}</strong>
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Quote Detail</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans text-body-small">
          <div><dt className="text-caption text-ordift-ink-muted">Original currency</dt><dd className="text-ordift-ink">{quote.originalCurrencyCode}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Supplier subtotal</dt><dd className="text-ordift-ink">{quote.originalCurrencyCode} {quote.supplierSubtotal.toFixed(2)}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Tax</dt><dd className="text-ordift-ink">{quote.taxAmount != null ? `${quote.originalCurrencyCode} ${quote.taxAmount.toFixed(2)}` : "—"}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Quote total</dt><dd className="text-ordift-ink font-medium">{quote.originalCurrencyCode} {quote.quoteTotal.toFixed(2)}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Valid until</dt><dd className="text-ordift-ink">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Deposit</dt><dd className="text-ordift-ink">{quote.depositRequired ? `Required${quote.depositAmount != null ? ` — ${quote.originalCurrencyCode} ${quote.depositAmount.toFixed(2)}` : ""}${quote.depositPercentage != null ? ` (${quote.depositPercentage}%)` : ""}` : "Not required"}</dd></div>
          {quote.cancellationTerms && <div className="sm:col-span-2"><dt className="text-caption text-ordift-ink-muted">Cancellation terms</dt><dd className="text-ordift-ink">{quote.cancellationTerms}</dd></div>}
          {quote.sourceReference && <div className="sm:col-span-2"><dt className="text-caption text-ordift-ink-muted">Supporting reference / evidence</dt><dd className="text-ordift-ink">{quote.sourceReference}</dd></div>}
          {quote.internalNotes && <div className="sm:col-span-2"><dt className="text-caption text-ordift-ink-muted">Internal notes (never public)</dt><dd className="text-ordift-ink">{quote.internalNotes}</dd></div>}
        </dl>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Change Status</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          A status change is a record of a staff decision only — it never creates a payment, payable, or supplier
          booking. Actually engaging or paying this supplier remains a separate, explicit step outside this record.
        </p>
        <div className="flex flex-wrap gap-2">
          {QUOTE_STATUS_OPTIONS.filter((s) => s.slug !== quote.status).map((s) =>
            HIGH_CONSEQUENCE_STATUSES.has(s.slug) ? (
              <form key={s.slug} action={setSupplierQuoteStatusAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="status" value={s.slug} />
                <ConfirmSubmitButton
                  confirmMessage={`Mark this quote as "${s.label}"? This represents a real staff decision${s.slug === "committed" ? " — it should mean Ordift genuinely intends to engage this supplier" : ""}. It still will NOT create any payment or payable.`}
                  pendingLabel="Updating…"
                  className="rounded-lg border border-ordift-ink px-3 py-1.5 font-sans text-caption text-ordift-ink"
                >
                  Mark {s.label}
                </ConfirmSubmitButton>
              </form>
            ) : (
              <form key={s.slug} action={setSupplierQuoteStatusAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="status" value={s.slug} />
                <button type="submit" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
                  Mark {s.label}
                </button>
              </form>
            )
          )}
        </div>
      </section>
    </div>
  );
}
