import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listRecentBudgetVersions, getLatestBudgetForReference } from "@/lib/production/budgets";
import ProductionSubNav from "../ProductionSubNav";

export const metadata: Metadata = {
  title: "Production Budgets — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  estimate: "Estimate",
  supplier_quoted: "Supplier-Quoted",
  internal_approved: "Internally Approved",
  client_presented: "Presented to Client",
  client_approved: "Client Approved",
  committed: "Committed",
  actual_final: "Actual / Final",
};

export default async function ProductionBudgetsPage({ searchParams }: { searchParams: Promise<{ referenceType?: string; referenceId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { referenceType, referenceId } = await searchParams;
  const [recentBudgets, searchedBudget] = await Promise.all([
    listRecentBudgetVersions(user.id, 30),
    referenceType && referenceId ? getLatestBudgetForReference(user.id, referenceType, referenceId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Production Operations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Production Budgets</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Append-only per engagement — a budget change is always a new version, never an edit of an approved figure.
          Search by reference to see a specific engagement&rsquo;s full version history.
        </p>
      </div>

      <ProductionSubNav active="budgets" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Find an Engagement&rsquo;s Budget</h2>
        <form className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select name="referenceType" defaultValue={referenceType ?? "enquiry"} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="enquiry">Enquiry</option>
            <option value="other">Other reference</option>
          </select>
          <input name="referenceId" defaultValue={referenceId ?? ""} required placeholder="Reference ID" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Find</button>
        </form>
        {referenceType && referenceId && (
          searchedBudget ? (
            <Link href={`/admin/production/budgets/${searchedBudget.id}`} className="block rounded-lg border border-black/10 px-4 py-3 hover:bg-black/[0.02]">
              <p className="font-sans text-body-small text-ordift-ink">Latest version: {STATUS_LABELS[searchedBudget.status] ?? searchedBudget.status} · {searchedBudget.totalUsd != null ? `$${searchedBudget.totalUsd.toFixed(2)}` : "To Be Quoted"}</p>
              <span className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">View version →</span>
            </Link>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No budget exists yet for {referenceType}:{referenceId} — create the first version from a quote/estimate discussion.</p>
          )
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Recent Budget Versions</h2>
        {recentBudgets.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No production budgets recorded yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {recentBudgets.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/production/budgets/${b.id}`} className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small text-ordift-ink">{b.referenceType}:{b.referenceId}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{STATUS_LABELS[b.status] ?? b.status} {b.supersedesId ? "· new version" : "· first version"} · {new Date(b.createdAt).toLocaleString()}</p>
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

export { STATUS_LABELS as PRODUCTION_BUDGET_STATUS_LABELS };
