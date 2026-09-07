import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listSuppliersForAdmin, type ProductionSupplierType } from "@/lib/production/suppliers";
import { listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import ProductionSubNav from "../ProductionSubNav";
import { createSupplierAction } from "../actions";

export const metadata: Metadata = {
  title: "Suppliers — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export const SUPPLIER_TYPE_OPTIONS: { slug: ProductionSupplierType; label: string }[] = [
  { slug: "studio", label: "Studio" },
  { slug: "location", label: "Location" },
  { slug: "equipment_rental", label: "Equipment Rental" },
  { slug: "crew_freelancer", label: "Crew / Freelancer" },
  { slug: "transport", label: "Transport" },
  { slug: "catering", label: "Catering" },
  { slug: "props", label: "Props" },
  { slug: "set_construction", label: "Set Construction" },
  { slug: "styling", label: "Styling" },
  { slug: "hair_makeup", label: "Hair & Makeup" },
  { slug: "talent_agency", label: "Talent Agency" },
  { slug: "permit_fixer", label: "Permit / Fixer" },
  { slug: "accommodation", label: "Accommodation" },
  { slug: "courier_logistics", label: "Courier / Logistics" },
  { slug: "other", label: "Other" },
];

function supplierTypeLabel(slug: string): string {
  return SUPPLIER_TYPE_OPTIONS.find((t) => t.slug === slug)?.label ?? slug;
}

export default async function ProductionSuppliersPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { type: typeParam, status: statusParam, q: qParam } = await searchParams;
  const typeFilter = SUPPLIER_TYPE_OPTIONS.some((t) => t.slug === typeParam) ? (typeParam as ProductionSupplierType) : undefined;
  const activeOnly = statusParam === "active";

  const [suppliers, markets] = await Promise.all([listSuppliersForAdmin(user.id, { supplierType: typeFilter, activeOnly }), listActivePricingMarkets()]);
  const query = (qParam ?? "").trim().toLowerCase();
  const filtered = query ? suppliers.filter((s) => s.supplierName.toLowerCase().includes(query) || (s.contactName ?? "").toLowerCase().includes(query)) : suppliers;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Production Operations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Suppliers</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Internal-only procurement directory — never exposed publicly. A supplier may optionally link to an
          existing Ordift payee profile; the two remain separate records.
        </p>
      </div>

      <ProductionSubNav active="suppliers" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Add a Supplier</h2>
        <form action={createSupplierAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input name="supplierName" required placeholder="Supplier name" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <select name="supplierType" required defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="" disabled>Supplier type</option>
            {SUPPLIER_TYPE_OPTIONS.map((t) => (
              <option key={t.slug} value={t.slug}>{t.label}</option>
            ))}
          </select>
          <select name="marketSlug" defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="">Market (optional)</option>
            {markets.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <input name="contactName" placeholder="Contact name (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactEmail" type="email" placeholder="Contact email (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="contactPhone" placeholder="Contact phone (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="currencyCode" placeholder="Reference currency, e.g. USD (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <div className="grid grid-cols-2 gap-2">
            <input name="indicativeRate" type="number" step="0.01" min="0" placeholder="Indicative rate" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="rateUnit" placeholder="Rate unit, e.g. per day" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </div>
          <input name="capabilities" placeholder="Capabilities, comma-separated (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <input name="paymentTerms" placeholder="Payment terms (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="availabilityNotes" placeholder="Availability notes (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <textarea name="internalNotes" placeholder="Internal notes (optional, never public)" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Add Supplier</button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Existing Suppliers ({filtered.length})</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={qParam ?? ""} placeholder="Search name/contact" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
            <button type="submit" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption text-ordift-ink">Search</button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin/production/suppliers" className={`rounded-full border px-3 py-1 font-sans text-caption ${!typeParam ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>All types</Link>
          {SUPPLIER_TYPE_OPTIONS.map((t) => (
            <Link key={t.slug} href={`/admin/production/suppliers?type=${t.slug}`} className={`rounded-full border px-3 py-1 font-sans text-caption ${typeParam === t.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{t.label}</Link>
          ))}
          <Link href={`/admin/production/suppliers${typeParam ? `?type=${typeParam}&` : "?"}status=active`} className={`rounded-full border px-3 py-1 font-sans text-caption ${activeOnly ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>Active only</Link>
        </div>

        {filtered.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">
            No production suppliers added yet — use the form above to add the first one.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/production/suppliers/${s.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className={`font-sans text-body-small font-medium ${s.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>{s.supplierName}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      {supplierTypeLabel(s.supplierType)}{s.marketSlug ? ` · ${s.marketSlug}` : ""} · {s.active ? "active" : "inactive"}
                    </p>
                  </div>
                  <span className="font-sans text-caption text-ordift-ink underline underline-offset-4 shrink-0">View / Manage →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
