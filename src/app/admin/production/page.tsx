import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listSuppliersForAdmin } from "@/lib/production/suppliers";
import { listAllSupplierQuotes } from "@/lib/production/supplierQuotes";
import { listRecentBudgetVersions, listRecentBudgetChanges } from "@/lib/production/budgets";
import ProductionSubNav from "./ProductionSubNav";

export const metadata: Metadata = {
  title: "Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Production Operations Admin (2026-09-07) — Overview. Read-only
// at-a-glance summary over the governed backend built in Production
// Services V1. Authorization: operations.coordinate (the same
// capability every write in this area uses) — never a new/duplicate
// permission system.
export default async function ProductionOperationsOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const [suppliers, quotes, recentBudgets, recentChanges] = await Promise.all([
    listSuppliersForAdmin(user.id),
    listAllSupplierQuotes(user.id),
    listRecentBudgetVersions(user.id, 10),
    listRecentBudgetChanges(user.id, 10),
  ]);

  const activeSuppliers = suppliers.filter((s) => s.active).length;
  const quotesByStatus = quotes.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1;
    return acc;
  }, {});
  const pendingChanges = recentChanges.filter((c) => c.clientApprovalStatus === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Production Operations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Internal supplier directory, supplier quotes, and append-only production budgets/change records. This is
          project-specific procurement data — separate from Admin Pricing, which holds Ordift&rsquo;s own versioned
          rate figures.
        </p>
      </div>

      <ProductionSubNav active="overview" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/admin/production/suppliers" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Suppliers</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{suppliers.length}</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">{activeSuppliers} active</p>
        </Link>
        <Link href="/admin/production/quotes" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Supplier Quotes</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{quotes.length}</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">{quotesByStatus.draft ?? 0} draft · {quotesByStatus.under_review ?? 0} under review</p>
        </Link>
        <Link href="/admin/production/changes" className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold-pressed">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Changes / Variations</p>
          <p className="font-serif text-section-heading text-ordift-ink mt-1">{recentChanges.length}</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">{pendingChanges} pending client approval</p>
        </Link>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Recent Budget Versions</h2>
          <Link href="/admin/production/budgets" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">View all →</Link>
        </div>
        {recentBudgets.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">
            No production budgets recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {recentBudgets.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/production/budgets/${b.id}`} className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small text-ordift-ink">{b.referenceType}:{b.referenceId}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{b.status} {b.supersedesId ? "· new version" : "· first version"}</p>
                  </div>
                  <span className="font-sans text-body-small text-ordift-ink shrink-0">{b.totalUsd != null ? `$${b.totalUsd.toFixed(2)}` : "To Be Quoted"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
