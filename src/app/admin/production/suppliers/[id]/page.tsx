import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getSupplierById } from "@/lib/production/suppliers";
import { listAllSupplierQuotes } from "@/lib/production/supplierQuotes";
import { listPayeeProfiles } from "@/lib/payables/payeeProfiles";
import { listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import { updateSupplierAction, setSupplierActiveAction } from "../../actions";
import { SUPPLIER_TYPE_OPTIONS } from "../page";

export const metadata: Metadata = {
  title: "Supplier — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function ProductionSupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const supplier = await getSupplierById(user.id, id);
  if (!supplier) notFound();

  // listPayeeProfiles requires finance.payee.administer, a genuinely
  // separate capability from operations.coordinate — this Production
  // Operations admin may or may not also hold it. It degrades
  // gracefully (returns []) rather than throwing when unauthorized, so
  // linking still works via a manual ID field either way; see below.
  const [quotes, payees, markets] = await Promise.all([
    listAllSupplierQuotes(user.id, { supplierId: supplier.id }),
    listPayeeProfiles(user.id),
    listActivePricingMarkets(),
  ]);
  const linkedPayee = supplier.payeeProfileId ? payees.find((p) => p.id === supplier.payeeProfileId) : undefined;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/production/suppliers" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Suppliers</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{supplier.supplierName}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          {SUPPLIER_TYPE_OPTIONS.find((t) => t.slug === supplier.supplierType)?.label ?? supplier.supplierType} · {supplier.active ? "Active" : "Inactive"}
          {supplier.marketSlug ? ` · ${supplier.marketSlug}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Status</h2>
          <form action={setSupplierActiveAction}>
            <input type="hidden" name="supplierId" value={supplier.id} />
            <input type="hidden" name="active" value={String(supplier.active)} />
            <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
              {supplier.active ? "Deactivate" : "Activate"}
            </button>
          </form>
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Deactivating hides this supplier from new sourcing without deleting the record — every historical quote and budget line referencing it remains fully intact and auditable. Suppliers are never physically deleted in this Admin area.
        </p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Details</h2>
        <form action={updateSupplierAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <select name="marketSlug" defaultValue={supplier.marketSlug ?? ""} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="">Market (none set)</option>
            {markets.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <input name="locationNotes" defaultValue={supplier.locationNotes ?? ""} placeholder="Location notes" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactName" defaultValue={supplier.contactName ?? ""} placeholder="Contact name" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactEmail" type="email" defaultValue={supplier.contactEmail ?? ""} placeholder="Contact email" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactPhone" defaultValue={supplier.contactPhone ?? ""} placeholder="Contact phone" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="currencyCode" defaultValue={supplier.currencyCode ?? ""} placeholder="Reference currency" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="indicativeRate" type="number" step="0.01" min="0" defaultValue={supplier.indicativeRate ?? ""} placeholder="Indicative rate" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="rateUnit" defaultValue={supplier.rateUnit ?? ""} placeholder="Rate unit" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="paymentTerms" defaultValue={supplier.paymentTerms ?? ""} placeholder="Payment terms" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="supportingReference" defaultValue={supplier.supportingReference ?? ""} placeholder="Supporting reference / evidence" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="availabilityNotes" defaultValue={supplier.availabilityNotes ?? ""} placeholder="Availability notes" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <textarea name="internalNotes" defaultValue={supplier.internalNotes ?? ""} placeholder="Internal notes (never public)" rows={3} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />

          <div className="sm:col-span-2">
            <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Linked payee profile</label>
            {payees.length > 0 ? (
              <select name="payeeProfileId" defaultValue={supplier.payeeProfileId ?? ""} className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                <option value="">Not linked</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName ?? p.companyName ?? p.id} · {p.category}</option>
                ))}
              </select>
            ) : (
              <input name="payeeProfileId" defaultValue={supplier.payeeProfileId ?? ""} placeholder="Existing payee profile ID (create one under Payables → Payees first)" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            )}
            {linkedPayee && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Currently linked to {linkedPayee.fullName ?? linkedPayee.companyName ?? linkedPayee.id}.</p>}
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Linking never creates a payment destination, verifies payment details, or creates a payable — it only records the association for later, separately-governed payout steps.</p>
          </div>

          <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink sm:col-span-2">
            <input type="checkbox" name="markVerifiedNow" value="true" className="w-4 h-4" />
            Mark as verified today {supplier.lastVerifiedAt && <span className="font-sans text-caption text-ordift-ink-muted">(last verified {new Date(supplier.lastVerifiedAt).toLocaleDateString()})</span>}
          </label>

          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Save changes</button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Quotes from this supplier ({quotes.length})</h2>
          <Link href="/admin/production/quotes" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Record a quote →</Link>
        </div>
        {quotes.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No quotes recorded from this supplier yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/admin/production/quotes/${q.id}`} className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small text-ordift-ink">{q.description}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{q.referenceType}:{q.referenceId} · {q.status}</p>
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
