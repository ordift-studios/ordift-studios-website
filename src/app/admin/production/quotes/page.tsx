import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listAllSupplierQuotes, type ProductionSupplierQuoteStatus } from "@/lib/production/supplierQuotes";
import { listSuppliersForAdmin } from "@/lib/production/suppliers";
import ProductionSubNav from "../ProductionSubNav";
import { createSupplierQuoteAction } from "../actions";

export const metadata: Metadata = {
  title: "Supplier Quotes — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export const QUOTE_STATUS_OPTIONS: { slug: ProductionSupplierQuoteStatus; label: string }[] = [
  { slug: "draft", label: "Draft" },
  { slug: "received", label: "Received" },
  { slug: "under_review", label: "Under Review" },
  { slug: "approved_internally", label: "Approved Internally" },
  { slug: "rejected", label: "Rejected" },
  { slug: "expired", label: "Expired" },
  { slug: "superseded", label: "Superseded" },
  { slug: "committed", label: "Committed" },
];

export function quoteStatusLabel(slug: string): string {
  return QUOTE_STATUS_OPTIONS.find((s) => s.slug === slug)?.label ?? slug;
}

export default async function ProductionQuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { status: statusParam } = await searchParams;
  const statusFilter = QUOTE_STATUS_OPTIONS.some((s) => s.slug === statusParam) ? (statusParam as ProductionSupplierQuoteStatus) : undefined;

  const [quotes, suppliers] = await Promise.all([listAllSupplierQuotes(user.id, { status: statusFilter }), listSuppliersForAdmin(user.id, { activeOnly: true })]);
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.supplierName]));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Production Operations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Supplier Quotes</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          A quote is a supplier&rsquo;s priced offer for one engagement, preserved in its original currency. A status
          change — including Approved Internally or Committed — never creates a payment, payable, or supplier
          booking on its own.
        </p>
      </div>

      <ProductionSubNav active="quotes" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Record a Supplier Quote</h2>
        {suppliers.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No active suppliers yet — <Link href="/admin/production/suppliers" className="underline underline-offset-4">add a supplier first</Link>.
          </p>
        ) : (
          <form action={createSupplierQuoteAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select name="supplierId" required defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="" disabled>Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.supplierName}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select name="referenceType" defaultValue="enquiry" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="enquiry">Enquiry</option>
                <option value="other">Other reference</option>
              </select>
              <input name="referenceId" required placeholder="Reference ID" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            </div>
            <input name="description" required placeholder="Description" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <input name="originalCurrencyCode" required defaultValue="USD" placeholder="Original currency (e.g. USD)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="supplierSubtotal" type="number" step="0.01" min="0.01" required placeholder="Supplier subtotal" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="taxAmount" type="number" step="0.01" min="0" placeholder="Tax amount (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="validUntil" type="date" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
              <input type="checkbox" name="depositRequired" value="true" className="w-4 h-4" /> Deposit required
            </label>
            <input name="depositAmount" type="number" step="0.01" min="0" placeholder="Deposit amount (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="depositPercentage" type="number" step="0.01" min="0" max="100" placeholder="Deposit % (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="cancellationTerms" placeholder="Cancellation terms (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <input name="sourceReference" placeholder="Supporting reference/evidence (file link, email ref, etc.)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <textarea name="internalNotes" placeholder="Internal notes (never public)" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Record Quote (Draft)</button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">All Quotes ({quotes.length})</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/production/quotes" className={`rounded-full border px-3 py-1 font-sans text-caption ${!statusParam ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>All</Link>
          {QUOTE_STATUS_OPTIONS.map((s) => (
            <Link key={s.slug} href={`/admin/production/quotes?status=${s.slug}`} className={`rounded-full border px-3 py-1 font-sans text-caption ${statusParam === s.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{s.label}</Link>
          ))}
        </div>
        {quotes.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No supplier quotes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/admin/production/quotes/${q.id}`} className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small text-ordift-ink">{supplierNameById.get(q.supplierId) ?? "Unknown supplier"} — {q.description}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{q.referenceType}:{q.referenceId} · {quoteStatusLabel(q.status)}</p>
                  </div>
                  <span className="font-sans text-body-small text-ordift-ink shrink-0">{q.originalCurrencyCode} {q.quoteTotal.toFixed(2)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
