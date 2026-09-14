import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listPerformanceReviewsForProfile, listPipsForProfile } from "@/lib/organization/performanceReviews";

export const metadata: Metadata = {
  title: "My Performance — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service — My Performance (Phase B6 Step 6, 2026-09-15).
// Read-only: recording a review or initiating/deciding a PIP remains
// exclusively an HR/admin action (people/[id]/page.tsx) — this page
// only lets a person see their own record, never edit it.
export default async function MyPerformancePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [reviews, pips] = await Promise.all([listPerformanceReviewsForProfile(user.id), listPipsForProfile(user.id)]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Performance</h1>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Reviews</h2>
        {reviews.length > 0 ? (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="font-sans text-caption text-ordift-ink-muted">
                · {new Date(r.conductedAt).toLocaleDateString()} — {r.outcomeSummary}
                {r.nextReviewDueAt ? ` (next due ${new Date(r.nextReviewDueAt).toLocaleDateString()})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No performance reviews recorded yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Performance Improvement Plans</h2>
        {pips.length > 0 ? (
          <ul className="space-y-2">
            {pips.map((p) => (
              <li key={p.id} className="font-sans text-caption text-ordift-ink-muted">
                · {p.startDate} → {p.extendedEndDate ?? p.plannedEndDate}
                {p.extendedEndDate ? " (extended)" : ""} — {p.status.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No Performance Improvement Plans on record.</p>
        )}
      </section>
    </div>
  );
}
