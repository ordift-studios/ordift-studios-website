import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { isStaffOrAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getAllWorkshopsAdmin } from "@/lib/content/sanity/workshopAdmin";
import { getWorkshopsDepartmentOverview } from "@/lib/workshops/departmentOverview";

// Task 4 audit (2026-09-17) — a real Production exposure: this list
// page showed gross revenue / outstanding balances / instructor
// obligations to ANY staff/admin (the same broad visibility the
// per-workshop detail page's Instructors/Registrations sections
// deliberately do NOT give — that page already gates its own
// financial overview behind FINANCE_CAPABILITIES.workshopRevenueView;
// this list page never did). Fixed by applying the exact same check
// here, never inferring financial visibility from the staff/admin
// role alone.
const FINANCIAL_WARNING_KEYS = new Set(["unpaid", "engagements-incomplete"]);

export const metadata: Metadata = {
  title: "Workshop Management — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Workshop Management V1, Phase B, Part 6 (2026-08-25). Visible to any
// staff/admin (read-only browsing) — mutation actions each independently
// require operations.workshop.administer or Super Admin (see actions.ts),
// so viewing this list is not itself a privileged action.
export default async function AdminWorkshopsPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const canSeeFinance = (await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.workshopRevenueView)).ok;

  const workshops = await getAllWorkshopsAdmin();
  const { summary, warnings: allWarnings, upcomingSessions } = await getWorkshopsDepartmentOverview(workshops);
  const warnings = canSeeFinance ? allWarnings : allWarnings.filter((w) => !FINANCIAL_WARNING_KEYS.has(w.key));
  const warningsByWorkshop = new Map<string, typeof warnings>();
  for (const w of warnings) {
    warningsByWorkshop.set(w.workshopId, [...(warningsByWorkshop.get(w.workshopId) ?? []), w]);
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Workshop Management</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Workshops, ticket types, registrations, instructors, and financial overview — one unified module. CHIEF/
            Super Admin has complete visibility; other capabilities activate as Executive/Director positions are
            occupied and granted.
          </p>
        </div>
        <Link href="/admin/workshops/new" className="font-sans text-body-small font-semibold px-4 py-2.5 rounded-full bg-ordift-gold text-ordift-navy-950 whitespace-nowrap">
          New Workshop
        </Link>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: "Total Workshops", value: summary.totalWorkshops },
          { label: "Upcoming", value: summary.upcomingWorkshopsCount },
          { label: "Registered (all)", value: summary.totalRegisteredCount },
          ...(canSeeFinance
            ? [
                { label: "Gross Revenue", value: `$${summary.totalGrossRevenueUsd.toFixed(2)}` },
                { label: "Outstanding", value: `$${summary.totalOutstandingUsd.toFixed(2)}` },
                { label: "Instructor Obligations", value: `$${summary.totalInstructorObligationsUsd.toFixed(2)}` },
              ]
            : []),
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-black/10 bg-white p-4">
            <p className="font-sans text-[1.5rem] leading-none font-semibold text-ordift-ink tabular-nums">{card.value}</p>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1.5">{card.label}</p>
          </div>
        ))}
      </section>

      {warnings.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 mb-8">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Needs Attention</h2>
          <ul className="divide-y divide-black/5">
            {warnings.map((w, i) => (
              <li key={`${w.workshopId}-${w.key}-${i}`} className="py-2.5">
                <Link href={`/admin/workshops/${w.workshopId}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                  {w.workshopTitle} — {w.label} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcomingSessions.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 mb-8">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Upcoming Sessions (30 days)</h2>
          <ul className="divide-y divide-black/5">
            {upcomingSessions.map((s) => (
              <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                <Link href={`/admin/workshops/${s.id}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                  {s.title}
                </Link>
                <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {s.startDate} · {s.registeredCount}/{s.capacity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
        {workshops.map((w) => {
          const warnings = warningsByWorkshop.get(w.id) ?? [];
          return (
            <Link key={w.id} href={`/admin/workshops/${w.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-ordift-offwhite/60">
              <div>
                <p className="font-sans text-body-small text-ordift-ink font-medium">{w.title}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {w.status} · Capacity {w.capacity} {w.startDate ? `· ${w.startDate}` : ""}
                </p>
                {warnings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {warnings.map((warn) => (
                      <span key={warn.key} className="font-sans text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        {warn.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
        {workshops.length === 0 && <p className="px-5 py-8 text-center font-sans text-body-small text-ordift-ink-muted">No workshops yet.</p>}
      </div>
    </div>
  );
}
