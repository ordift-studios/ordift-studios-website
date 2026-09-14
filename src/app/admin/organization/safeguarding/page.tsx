import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listSafeguardingConcernReports } from "@/lib/organization/safeguarding";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { SafeguardingWorkspace } from "./SafeguardingWorkspace";

export const metadata: Metadata = {
  title: "Safeguarding — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 9 (2026-09-14) —
// safeguarding concern reports, OS-HR-GH-005 6.4. "Restricted
// reporting" means restricted READ access (admin-only), never a
// restriction on who may report — this page is the restricted-read
// side; reportSafeguardingConcern() itself carries no authorization
// gate and is not exposed here (employee-initiated reporting is
// deferred to the later Employee Self-Service phase, matching how
// Leave/Attendance/Grievances also shipped admin-side first).
// concerning_profile_id is nullable — a concern may involve a
// non-employee (a client, a minor on set), not only ever staff.
export default async function SafeguardingWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [reportRows, usersResult] = await Promise.all([listSafeguardingConcernReports(user.id), listUsersWithRoles()]);

  const nameById = new Map<string, string>();
  if (usersResult.ok) {
    for (const u of usersResult.users) nameById.set(u.id, u.fullName ?? u.email ?? u.id);
  }

  const concerns = reportRows.map((r) => ({
    id: r.id,
    reportedByName: nameById.get(r.reportedBy) ?? "(no name on record)",
    concerningName: r.concerningProfileId ? (nameById.get(r.concerningProfileId) ?? "(non-employee or no name on record)") : null,
    description: r.description,
    immediateSafetyActionTaken: r.immediateSafetyActionTaken,
    mandatoryReportingObligationNotes: r.mandatoryReportingObligationNotes,
    status: r.status,
    resolutionNotes: r.resolutionNotes,
    reportedAt: r.reportedAt,
  }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Safeguarding</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Safeguarding</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          OS-HR-GH-005 6.4&rsquo;s restricted safeguarding-concern channel — for children and vulnerable persons. Prioritizes
          immediate safety and preserves any mandatory external reporting obligations.
        </p>
      </div>

      <SafeguardingWorkspace concerns={concerns} />
    </div>
  );
}
