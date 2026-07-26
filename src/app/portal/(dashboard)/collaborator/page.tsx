import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { getMyActiveAssignments } from "@/lib/portal/collaboratorData";

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

  const assignments = await getMyActiveAssignments(user.id);

  return (
    <div>
      <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
        Collaborator
      </p>
      <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-8">
        My Projects
      </h1>

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
    </div>
  );
}
