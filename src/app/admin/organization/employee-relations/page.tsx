import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listGrievancesAcrossStaff, listSpeakUpReportsAcrossStaff } from "@/lib/organization/grievances";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { EmployeeRelationsWorkspace } from "./EmployeeRelationsWorkspace";

export const metadata: Metadata = {
  title: "Employee Relations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 4 (2026-09-14) —
// Grievances and Speak-Up, kept as genuinely separate workflows (never
// combined into one "case" model or one shared form) but grouped on
// one admin page the way Discipline/Investigation are grouped on the
// Employee Profile page. Speak-Up is additionally restricted to Super
// Admin — the page withholds the fetch entirely for a lesser admin
// rather than fetching and only hiding it in the render.
export default async function EmployeeRelationsPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");
  const canSeeSpeakUp = isSuperAdmin(user);

  const [grievanceRows, speakUpRows, usersResult] = await Promise.all([
    listGrievancesAcrossStaff(),
    canSeeSpeakUp ? listSpeakUpReportsAcrossStaff() : Promise.resolve(null),
    listUsersWithRoles(),
  ]);

  const nameById = new Map<string, string>();
  if (usersResult.ok) {
    for (const u of usersResult.users) nameById.set(u.id, u.fullName ?? u.email ?? u.id);
  }

  const grievances = grievanceRows.map((g) => ({
    id: g.id,
    raisedByName: nameById.get(g.raisedBy) ?? "(no name on record)",
    againstName: g.againstProfileId ? (nameById.get(g.againstProfileId) ?? "(no name on record)") : null,
    grievanceType: g.grievanceType,
    description: g.description,
    bypassedManager: g.bypassedManager,
    status: g.status,
    submittedAt: g.submittedAt,
    acknowledgementDueAt: g.acknowledgementDueAt,
  }));

  const speakUpReports = speakUpRows
    ? speakUpRows.map((r) => ({
        id: r.id,
        reportedByName: r.reportedBy ? (nameById.get(r.reportedBy) ?? "(no name on record)") : null,
        description: r.description,
        status: r.status,
        submittedAt: r.submittedAt,
      }))
    : null;

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People · Employee Relations</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Employee Relations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          OS-HR-GH-004&rsquo;s grievance and Speak-Up channels — two deliberately separate workflows, each with its own resolution path.
        </p>
      </div>

      <EmployeeRelationsWorkspace grievances={grievances} speakUpReports={speakUpReports} canSeeSpeakUp={canSeeSpeakUp} />
    </div>
  );
}
