import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getBudgetById, listBudgetHistoryForReference, listChangesForBudget } from "@/lib/production/budgets";
import { isApprovedOrLaterStatus, type ProductionBudgetStatus } from "@/lib/production/budgetMath";
import CreateBudgetVersionForm from "../CreateBudgetVersionForm";
import { PRODUCTION_BUDGET_STATUS_LABELS } from "../page";

export const metadata: Metadata = {
  title: "Production Budget — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Internal Admin view — may show supplier cost, Ordift fee,
// coordination fees, contingency, client-facing total, and variance
// all together (per the approved spec's "Internal vs Client" section).
// This page is never public and never linked from any public surface.
export default async function ProductionBudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const { id } = await params;
  const budget = await getBudgetById(user.id, id);
  if (!budget) notFound();

  const [history, changes] = await Promise.all([
    listBudgetHistoryForReference(user.id, budget.referenceType, budget.referenceId),
    listChangesForBudget(user.id, budget.id),
  ]);
  const isLatest = history[0]?.id === budget.id;
  const isClientFacingWarning = isLatest && isApprovedOrLaterStatus(budget.status as ProductionBudgetStatus);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/production/budgets" className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4">← Production Budgets</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{budget.referenceType}:{budget.referenceId}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          {PRODUCTION_BUDGET_STATUS_LABELS[budget.status] ?? budget.status} {isLatest ? "· latest version" : "· superseded"} · created {new Date(budget.createdAt).toLocaleString()}
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">This Version</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans text-body-small">
          <div><dt className="text-caption text-ordift-ink-muted">Client-facing total</dt><dd className="text-ordift-ink font-medium">{budget.totalUsd != null ? `$${budget.totalUsd.toFixed(2)}` : "To Be Quoted"}</dd></div>
          <div><dt className="text-caption text-ordift-ink-muted">Contingency</dt><dd className="text-ordift-ink">{budget.contingencyEnabled ? `Enabled${budget.contingencyPercentage != null ? ` — ${budget.contingencyPercentage}%` : ""}${budget.contingencyAmountUsd != null ? ` ($${budget.contingencyAmountUsd.toFixed(2)})` : ""}` : "Not enabled"}</dd></div>
          {budget.notes && <div className="sm:col-span-2"><dt className="text-caption text-ordift-ink-muted">Notes</dt><dd className="text-ordift-ink">{budget.notes}</dd></div>}
        </dl>
        {budget.lineItems.length > 0 && (
          <div>
            <p className="font-sans text-caption text-ordift-ink-muted mb-1">Line items</p>
            <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
              {budget.lineItems.map((item, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 font-sans text-body-small">
                  <span className="text-ordift-ink">{item.label} <span className="text-caption text-ordift-ink-muted">({item.category})</span></span>
                  <span className="text-ordift-ink">{item.amountUsd != null ? `$${item.amountUsd.toFixed(2)}` : "To Be Quoted"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Version History ({history.length})</h2>
        <ul className="divide-y divide-black/5">
          {history.map((v) => (
            <li key={v.id}>
              {v.id === budget.id ? (
                <div className="flex items-center justify-between gap-4 py-2.5 px-2 -mx-2 rounded bg-ordift-gold-pressed/10">
                  <p className="font-sans text-body-small text-ordift-ink font-medium">{PRODUCTION_BUDGET_STATUS_LABELS[v.status] ?? v.status} — viewing now</p>
                  <span className="font-sans text-body-small text-ordift-ink shrink-0">{v.totalUsd != null ? `$${v.totalUsd.toFixed(2)}` : "To Be Quoted"}</span>
                </div>
              ) : (
                <Link href={`/admin/production/budgets/${v.id}`} className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <p className="font-sans text-body-small text-ordift-ink-muted">{PRODUCTION_BUDGET_STATUS_LABELS[v.status] ?? v.status} · {new Date(v.createdAt).toLocaleString()}</p>
                  <span className="font-sans text-body-small text-ordift-ink-muted shrink-0">{v.totalUsd != null ? `$${v.totalUsd.toFixed(2)}` : "To Be Quoted"}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="font-sans text-caption text-ordift-ink-muted">Every version above is permanent — a new version never overwrites an existing one, so this full history remains auditable indefinitely.</p>
      </section>

      {changes.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Changes / Variations Against This Version ({changes.length})</h2>
          <ul className="divide-y divide-black/5">
            {changes.map((c) => (
              <li key={c.id} className="py-2.5">
                <p className="font-sans text-body-small text-ordift-ink">{c.reason}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  ${c.previousAmountUsd.toFixed(2)} → ${c.newAmountUsd.toFixed(2)} ({c.differenceUsd >= 0 ? "+" : ""}${c.differenceUsd.toFixed(2)}) · client approval: <strong>{c.clientApprovalStatus}</strong> · {new Date(c.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLatest && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Create New Version</h2>
          <CreateBudgetVersionForm referenceType={budget.referenceType} referenceId={budget.referenceId} isClientFacingWarning={isClientFacingWarning} />
        </section>
      )}
    </div>
  );
}
