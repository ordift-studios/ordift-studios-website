import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { listRecentBudgetChanges } from "@/lib/production/budgets";
import ProductionSubNav from "../ProductionSubNav";
import { setChangeClientApprovalStatusAction } from "../actions";

export const metadata: Metadata = {
  title: "Changes / Variations — Production Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Client-approval state (2026-09-07) — every change/variation is
// written with client_approval_status = "pending" by
// createBudgetVersion() (budgets.ts), regardless of who prepared it or
// how confident they are — an Admin creating a change record NEVER
// fabricates client approval. This page's Approve/Reject buttons are
// the only way that status ever moves, and they are a deliberate,
// separate, explicit action recording what the client ACTUALLY said —
// never inferred from the change simply existing.
export default async function ProductionChangesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.coordinate);
  if (!auth.ok) redirect("/admin/overview");

  const changes = await listRecentBudgetChanges(user.id, 50);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Production Operations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Changes / Variations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Recorded automatically whenever a budget already Client Approved (or later) changes total — never silent.
          Client approval status here is never fabricated: every change starts Pending until explicitly marked
          Approved or Rejected, recording what the client actually said.
        </p>
      </div>

      <ProductionSubNav active="changes" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">All Changes ({changes.length})</h2>
        {changes.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No change/variation records yet — these are created automatically when an already-approved budget&rsquo;s total changes.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {changes.map((c) => (
              <li key={c.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-sans text-body-small text-ordift-ink">{c.reason}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      ${c.previousAmountUsd.toFixed(2)} → ${c.newAmountUsd.toFixed(2)} ({c.differenceUsd >= 0 ? "+" : ""}${c.differenceUsd.toFixed(2)}) · {new Date(c.createdAt).toLocaleString()}
                    </p>
                    <Link href={`/admin/production/budgets/${c.budgetId}`} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">View related budget →</Link>
                  </div>
                  <span className={`font-sans text-caption px-2 py-1 rounded-full shrink-0 ${c.clientApprovalStatus === "approved" ? "bg-green-100 text-green-800" : c.clientApprovalStatus === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {c.clientApprovalStatus}
                  </span>
                </div>
                {c.clientApprovalStatus === "pending" && (
                  <div className="flex gap-2">
                    <form action={setChangeClientApprovalStatusAction}>
                      <input type="hidden" name="changeId" value={c.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit" className="rounded-lg border border-green-600 text-green-700 px-3 py-1 font-sans text-caption">Mark Client Approved</button>
                    </form>
                    <form action={setChangeClientApprovalStatusAction}>
                      <input type="hidden" name="changeId" value={c.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit" className="rounded-lg border border-red-600 text-red-700 px-3 py-1 font-sans text-caption">Mark Rejected</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
