import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listEmployingEntities } from "@/lib/organization/legalEntities";

export const metadata: Metadata = { title: "Equipment & Financing — Finance — Ordift Studios Admin", robots: { index: false, follow: false } };

// Entry point for the Equipment & Financing module from the Finance navigation group: choose the legal entity, then open its panel.
// Super Admin only (re-checked here; the panel, its actions, the library and the database function each check again). Reads only; creates nothing.
export default async function EquipmentFinanceIndexPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");
  const entities = await listEmployingEntities();
  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Equipment &amp; Financing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-3xl">
          Choose a legal entity to see its equipment purchases, financing agreements, instalment schedules and payment evidence. This module keeps acquisition cost, financing liability, actual payments and accounting expense apart;
          a payment recorded here is <strong>reported</strong>, never bank-reconciled. It is one Finance module, not a full accounting dashboard: payments, payables, pricing and quotations remain in their own pages.
        </p>
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entities.map((e) => (
          <li key={e.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{e.name}</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">{e.legalName ?? e.name}{e.jurisdictionName ? ` · ${e.jurisdictionName}` : ""}</p>
            <Link href={`/admin/organization/legal-entities/${e.id}/equipment`} className="inline-block font-sans text-body-small font-semibold text-ordift-gold-pressed underline underline-offset-4">Open Equipment &amp; Financing →</Link>
          </li>
        ))}
        {entities.length === 0 && <li className="font-sans text-body-small text-ordift-ink-muted">No legal entities are recorded.</li>}
      </ul>
    </div>
  );
}
