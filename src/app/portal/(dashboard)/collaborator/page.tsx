import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { getMyActiveAssignments } from "@/lib/portal/collaboratorData";
import { listMyEngagements, listMyWorkshopInstructorEngagements } from "@/lib/portal/engagementPortalData";

export const metadata: Metadata = {
  title: "My Projects — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Contractor/Collaborator home (migration 0009) — a project-scoped
// counterpart to /portal/client, but listing project_assignments
// instead of owned enquiries/workshop_registrations. Least-privilege
// by construction: getMyActiveAssignments() only ever returns rows RLS
// (private.has_project_access()) allows for this exact account.
export default async function CollaboratorPortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (!hasRole(user, "contractor")) redirect("/portal");

  const [assignments, engagements, workshopEngagements] = await Promise.all([
    getMyActiveAssignments(user.id),
    listMyEngagements(user.id),
    listMyWorkshopInstructorEngagements(user.id),
  ]);
  const activeEngagements = engagements.filter((e) => !["completed", "cancelled"].includes(e.status));

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Collaborator
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          My Work
        </h1>
      </div>

      {/* Universal Payables engagements — Phase H.1/H.2 */}
      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Engagements</h2>
        {activeEngagements.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              You don&apos;t have any active engagements yet. Ordift Studios will assign one when there&apos;s work for you.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activeEngagements.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/portal/collaborator/engagement/${e.id}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {e.operationalTitleName ?? "Engagement"} {e.engagementTypeName ? `· ${e.engagementTypeName}` : ""}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                    Status: {e.status} {e.agreedAmount ? `· ${e.currency ?? ""} ${e.agreedAmount}` : ""}
                    {e.dueDate ? ` · Due ${new Date(e.dueDate).toLocaleDateString()}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Workshop instructor engagements — Section 5, minimum additive
          read-safe integration; only rendered when at least one exists. */}
      {workshopEngagements.length > 0 && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Workshop Engagements</h2>
          <ul className="space-y-3">
            {workshopEngagements.map((w) => (
              <li key={w.id} className="bg-white border border-black/10 rounded-2xl p-6">
                <p className="font-sans text-body-small text-ordift-ink font-medium">Workshop reference: {w.workshopId}</p>
                <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                  Role: {w.role} · Status: {w.engagementStatus}
                  {w.agreedCompensationAmount ? ` · ${w.agreedCompensationCurrency ?? ""} ${w.agreedCompensationAmount}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Existing enquiry/workshop-registration project assignments */}
      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Project Assignments</h2>
        {assignments.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              You don&apos;t have any active project assignments yet. An admin will assign you to a project when
              there&apos;s work for you.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/portal/collaborator/${a.kind}/${a.entityId}`}
                  className="block bg-white border border-black/10 rounded-2xl p-6 hover:border-ordift-gold transition-colors"
                >
                  <p className="font-sans text-body-small text-ordift-ink font-medium">{a.label}</p>
                  {a.roleNote && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{a.roleNote}</p>}
                  {a.accessExpiresAt && (
                    <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                      Access until {new Date(a.accessExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
