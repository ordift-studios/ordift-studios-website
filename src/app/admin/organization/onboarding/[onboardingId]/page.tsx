import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageOnboarding, getStaffOnboardingById } from "@/lib/organization/onboarding";
import { listResolvedRequirements } from "@/lib/organization/onboardingRequirements";
import { stagesForPipeline, isTerminalStage, nextStage } from "@/lib/organization/onboardingStages";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listAuthorityGrants, isGrantActive } from "@/lib/organization/authority";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { listPaymentInstructionsForProfile } from "@/lib/payments/payeeInstructions";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { getRequisitionById, listApprovedRequisitionsForOnboarding } from "@/lib/recruitment/requisitions";
import { OnboardingWorkspace } from "./OnboardingWorkspace";

export const metadata: Metadata = {
  title: "Onboarding — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Internal Staff Onboarding Workspace (E.5 Stage 2I, Part A, 2026-09-11)
// — a dedicated detail view built on the existing onboarding
// architecture, not a parallel system: reuses listStaffOnboarding's
// row shape, listUsersWithRoles' existing person projection, and the
// same Admin card/section visual pattern as
// src/app/admin/organization/people/[id]/page.tsx. View access uses
// the exact same boundary as every onboarding action
// (canManageOnboarding — Super Admin or operations.administer) — no
// new Executive/Department visibility rule invented, per explicit
// instruction.
export default async function OnboardingWorkspacePage({ params }: { params: Promise<{ onboardingId: string }> }) {
  const { onboardingId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/admin/overview");
  if (!(await canManageOnboarding(currentUser.id))) redirect("/admin/overview");

  const onboarding = await getStaffOnboardingById(onboardingId);
  if (!onboarding) notFound();

  const [usersResult, requirements, activity, grants, identities, paymentInstructions, requisition, unlinkedRequisitions] = await Promise.all([
    listUsersWithRoles(),
    listResolvedRequirements({ onboardingId: onboarding.id, profileId: onboarding.profileId, pipeline: onboarding.pipeline }),
    getActivityForEntity("user", onboarding.profileId, 30),
    listAuthorityGrants(),
    listCorporateIdentities(),
    listPaymentInstructionsForProfile(onboarding.profileId),
    onboarding.requisitionId ? getRequisitionById(onboarding.requisitionId) : Promise.resolve(null),
    // Reconciliation candidates (E.5 Stage 2M, Part 4/6) — only
    // meaningful when this onboarding predates the origin architecture
    // and has no requisition_id yet (e.g. Mishael Adjei's).
    onboarding.requisitionId ? Promise.resolve([]) : listApprovedRequisitionsForOnboarding(),
  ]);

  const person = usersResult.ok ? usersResult.users.find((u) => u.id === onboarding.profileId) : undefined;
  const personGrants = grants.filter((g) => g.profileId === onboarding.profileId && isGrantActive(g));
  const identity = identities.find((i) => i.profileId === onboarding.profileId) ?? null;
  const hiringManagerName = requisition?.hiringManagerId
    ? (usersResult.ok ? usersResult.users.find((u) => u.id === requisition.hiringManagerId)?.fullName ?? null : null)
    : null;
  const reconciliationCandidates = unlinkedRequisitions.filter(
    (r) => r.hireOrigin !== "founder_direct_hire" || r.directHireProfileId === onboarding.profileId
  );

  const pipelineStages = stagesForPipeline(onboarding.pipeline);
  const terminal = isTerminalStage(onboarding.pipeline, onboarding.stage);
  const next = nextStage(onboarding.pipeline, onboarding.stage);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization · Onboarding
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {person?.fullName ?? person?.email ?? "Onboarding Record"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href="/admin/users" className="underline underline-offset-4">← Users &amp; Roles</Link>
          {person && (
            <>
              {" · "}
              <Link href={`/admin/organization/people/${person.id}`} className="underline underline-offset-4">
                Full Profile →
              </Link>
            </>
          )}
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Person</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Name: {person?.fullName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Member/staff number: {person?.memberNumber ?? "Not yet issued"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Engagement type: {person?.engagementTypeName ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Organization</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Position: {person?.positionName ?? "Not yet assigned"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Department: {person?.departmentName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Grade: {person?.gradeCode ? `${person.gradeCode} — ${person.gradeName}` : "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Operational Title: {person?.operationalTitleName ?? "—"}</p>
        </div>
      </section>

      <OnboardingWorkspace
        onboarding={onboarding}
        pipelineStages={pipelineStages}
        nextStageName={next}
        isTerminal={terminal}
        requirements={requirements}
        activity={activity}
        requisition={requisition}
        hiringManagerName={hiringManagerName}
        reconciliationCandidates={reconciliationCandidates}
      />

      {/* System-boundary handoff areas — view-only. Onboarding may
          display status here or (in a later phase) create an explicit
          human-action request; it must never itself provision, grant,
          or execute any of these (Part K). */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Corporate Identity / Work Email</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            {identity ? `${identity.email} — ${identity.status}` : "Not reserved yet"}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Independently controlled — view only here. Manage via Corporate Identity provisioning.
          </p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Authority</h2>
          {personGrants.length > 0 ? (
            <ul className="space-y-1">
              {personGrants.map((g) => (
                <li key={g.id} className="font-sans text-caption text-ordift-ink-muted">· {g.authority}</li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No active Authority Grants.</p>
          )}
          <p className="font-sans text-caption text-ordift-ink-muted">
            Independently controlled — view only here. Onboarding never creates or modifies an Authority Grant.
          </p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Payment / Payroll</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            {paymentInstructions.length > 0 ? "Payment destination on file" : "No payment destination on file"}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Independently controlled — view only here. Manage via Payables → Payees.
          </p>
        </div>
      </section>
    </div>
  );
}
