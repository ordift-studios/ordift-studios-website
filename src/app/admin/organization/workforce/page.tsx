import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getWorkforceOverviewCounts, listActiveStaffRoster } from "@/lib/organization/hrDashboard";

export const metadata: Metadata = {
  title: "Workforce Overview — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 2 (2026-09-14) —
// the HR portal's entry point. Every figure below is a real Production
// count (see hrDashboard.ts) — a subsystem with zero rows shows 0,
// never a sample number. Cards link out to the subsystem's own
// workspace; subsystems without a built page yet are listed without a
// link, honestly, rather than linking to something that doesn't exist.

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <>
      <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">{label}</p>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{value}</p>
    </>
  );
  if (!href) {
    return <div className="rounded-xl border border-black/10 bg-white p-6">{content}</div>;
  }
  return (
    <Link href={href} className="block rounded-xl border border-black/10 bg-white p-6 hover:border-black/25 transition-colors">
      {content}
    </Link>
  );
}

function AttentionCard({ label, count, href }: { label: string; count: number; href?: string }) {
  const content = (
    <>
      <p className="font-serif font-medium text-card-title text-ordift-ink">{count}</p>
      <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{label}</p>
    </>
  );
  if (!href) {
    return <div className="rounded-xl border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-5">{content}</div>;
  }
  return (
    <Link href={href} className="block rounded-xl border border-ordift-gold-pressed/40 bg-ordift-gold-pressed/5 p-5 hover:border-ordift-gold-pressed transition-colors">
      {content}
    </Link>
  );
}

export default async function WorkforceOverviewPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [counts, roster] = await Promise.all([getWorkforceOverviewCounts(), listActiveStaffRoster()]);

  const attentionItems = [
    { label: "Pending leave requests", count: counts.pendingLeaveRequests, href: "/admin/organization/leave" },
    { label: "Fixed-term contracts expiring within 90 days", count: counts.fixedTermApproachingExpiry },
    { label: "Open grievances", count: counts.openGrievances },
    { label: "Open disciplinary investigations", count: counts.openDisciplinaryInvestigations },
    { label: "Pending development/training requests", count: counts.pendingHrApprovals },
    { label: "Unresolved requirement reviews (agreement readiness)", count: counts.unresolvedRequirementReviews },
    { label: "Active offboarding cases", count: counts.activeOffboardingCases, href: "/admin/organization" },
  ].filter((item) => item.count > 0);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Workforce Overview</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Every figure on this page is a real, live count from Production — zero is a normal, honestly reported value, not a placeholder.
        </p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Active Staff" value={counts.activeStaffCount} href="/admin/users" />
        <StatCard label="Onboarding in Progress" value={counts.onboardingInProgress} />
        <StatCard label="Active PIPs" value={counts.activePips} />
        <StatCard label="Acting Assignments (active)" value={counts.actingAssignmentsActive} href="/admin/authority" />
        <StatCard label="Outstanding Assets" value={counts.outstandingAssets} />
      </section>

      {attentionItems.length > 0 && (
        <section className="mb-10">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Needs Attention</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attentionItems.map((item) => (
              <AttentionCard key={item.label} label={item.label} count={item.count} href={item.href} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Staff Roster ({roster.length})</h2>
        {roster.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No staff-role accounts on record.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {roster.map((person) => (
              <li key={person.profileId} className="py-2">
                <Link href={`/admin/organization/people/${person.profileId}`} className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed">
                  {person.fullName ?? "(no name on record)"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
