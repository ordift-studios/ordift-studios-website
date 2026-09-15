import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listControlledPolicyDocuments, listPolicyAcknowledgementsForProfile } from "@/lib/organization/policyAcknowledgements";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";
import { listEmployerCapableEmployingEntities } from "@/lib/organization/legalEntities";
import { MyWorkspaceLanding } from "./MyWorkspaceLanding";
import { FounderSelfAdministrationForm } from "./FounderSelfAdministrationForm";

export const metadata: Metadata = {
  title: "My Workspace — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service landing page (Phase B5 Step 15, 2026-09-14) —
// the entry point for "My Workspace". Reuses listUsersWithRoles()'s
// already-rich per-person row rather than a new query, matching how
// the Employee Profile page (people/[id]/page.tsx) resolves a person's
// own summary.
export default async function MyWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [usersResult, controlledPolicyDocuments, myAcknowledgements, myEmploymentTerms] = await Promise.all([
    listUsersWithRoles(),
    listControlledPolicyDocuments(),
    listPolicyAcknowledgementsForProfile(user.id),
    getCurrentEmploymentTerms(user.id),
  ]);
  const me = usersResult.ok ? usersResult.users.find((u) => u.id === user.id) : undefined;
  const acknowledgedVersionIds = new Set(myAcknowledgements.map((a) => a.policyVersionId));
  const pendingPolicies = controlledPolicyDocuments.filter((doc) => !acknowledgedVersionIds.has(doc.documentVersionId));

  // Founder/CEO self-administration (2026-09-15) — shown ONLY when the
  // viewer is Super Admin AND genuinely has no employment-terms record
  // of their own yet. This is not a Founder-specific hardcode: it is a
  // self-healing condition that happens to be true only for the
  // Founder today (the one Super Admin with Position/Department/Grade
  // already assigned but no employment_terms_history row — see
  // recordFounderSelfAdministeredEmploymentTerms()'s own comment for
  // why this exists at all), and disappears permanently for anyone
  // once they've recorded it once.
  const showFounderSelfAdministration = isSuperAdmin(user) && !myEmploymentTerms;
  const employingEntities = showFounderSelfAdministration ? await listEmployerCapableEmployingEntities() : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {me?.fullName ?? user.fullName ?? user.email}
        </h1>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Details</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Grade: {me?.gradeCode ? `${me.gradeCode} — ${me.gradeName}` : "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Title/Position: {me?.positionName ?? me?.operationalTitleName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Department: {me?.departmentName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Reports to: {me?.managerName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Employment status: {me?.employmentStatus ?? "Not set"}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Quick Links</h2>
          <ul className="space-y-1">
            <li><Link href="/admin/me/leave" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Leave →</Link></li>
            <li><Link href="/admin/me/calendar" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Calendar →</Link></li>
            <li><Link href="/admin/me/attendance" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Attendance →</Link></li>
            <li><Link href="/admin/me/compensation" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Compensation →</Link></li>
            <li><Link href="/admin/me/performance" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Performance →</Link></li>
            <li><Link href="/admin/me/grievances" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Grievances →</Link></li>
            <li><Link href="/admin/me/requests" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Requests →</Link></li>
          </ul>
        </div>
      </section>

      {showFounderSelfAdministration && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Founder &amp; CEO — Self-Administered Employment Record</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No internal HR authority exists above the Founder &amp; CEO, so this record is self-administered rather
            than independently reviewed — it is recorded and audited as such, distinct from every other employee&apos;s
            HR-reviewed employment record.
          </p>
          <FounderSelfAdministrationForm employingEntities={employingEntities} />
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Policies to Acknowledge</h2>
        <MyWorkspaceLanding pendingPolicies={pendingPolicies} />
      </section>
    </div>
  );
}
