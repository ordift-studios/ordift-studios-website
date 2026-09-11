import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageSeparationCases, getSeparationCaseById } from "@/lib/organization/separationCases";
import { listResolvedSeparationRequirements } from "@/lib/organization/separationRequirements";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { SeparationWorkspace } from "./SeparationWorkspace";

export const metadata: Metadata = {
  title: "Separation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Clearance Workspace (E.5 Stage 2J, Part 9, 2026-09-12) — mirrors the
// Onboarding Workspace's structure exactly (src/app/admin/organization/onboarding/[onboardingId]/page.tsx)
// on a separate persistence domain (separation_cases/separation_requirements).
// View access uses the same boundary as every separation action —
// canManageSeparationCases — no new visibility rule invented.
export default async function SeparationWorkspacePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/admin/overview");
  if (!(await canManageSeparationCases(currentUser.id))) redirect("/admin/overview");

  const separationCase = await getSeparationCaseById(caseId);
  if (!separationCase) notFound();

  const usersResult = await listUsersWithRoles();
  const person = usersResult.ok ? usersResult.users.find((u) => u.id === separationCase.profileId) : undefined;
  const roles = person?.roles ?? [];

  const [requirements, activity] = await Promise.all([
    listResolvedSeparationRequirements({
      separationCaseId: separationCase.id,
      profileId: separationCase.profileId,
      roles,
      finalSettlementStatus: separationCase.finalSettlementStatus,
    }),
    getActivityForEntity("user", separationCase.profileId, 30),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization · Separation
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {person?.fullName ?? person?.email ?? "Separation Case"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href="/admin/users" className="underline underline-offset-4">← Users &amp; Roles</Link>
          {person && (
            <>
              {" · "}
              <Link href={`/admin/organization/people/${person.id}`} className="underline underline-offset-4">Full Profile →</Link>
            </>
          )}
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Person</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Name: {person?.fullName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Member/staff number: {person?.memberNumber ?? "Not yet issued"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Relationship: {roles.join(", ") || "—"}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Organization</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Position: {person?.positionName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Department: {person?.departmentName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Grade: {person?.gradeCode ? `${person.gradeCode} — ${person.gradeName}` : "—"}</p>
        </div>
      </section>

      <SeparationWorkspace separationCase={separationCase} requirements={requirements} activity={activity} />
    </div>
  );
}
