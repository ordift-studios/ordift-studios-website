import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  canAccessPortfolioAdmin,
  canCreatePortfolioProjectsNatively,
  PORTFOLIO_CAPABILITIES,
} from "@/lib/admin/portfolioPermissions";
import { allowedTransitions, canToggleFeatured, getGrantedCapabilities, hasCapability } from "@/lib/workflow/engine";
import type { WorkflowStatus } from "@/lib/workflow/types";
import { getPortfolioProjectByIdAdmin } from "@/lib/content/sanity/portfolioAdmin";
import { getPortfolioWorkflowStatus, listPortfolioAssignments } from "@/lib/admin/portfolioWorkflow";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { resolveActorIdentities, formatActorLabel } from "@/lib/portal/actorIdentity";
import { getPublishReadiness } from "@/lib/admin/portfolioValidation";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import {
  transitionPortfolioProjectAction,
  toggleFeaturedAction,
  assignCollaboratorAction,
  removeCollaboratorAction,
} from "../actions";
import DeleteProjectButton from "../DeleteProjectButton";
import PreviewOnLiveSiteButton from "@/components/admin/PreviewOnLiveSiteButton";
import PortfolioCoverImagePicker from "@/components/admin/PortfolioCoverImagePicker";

export const metadata: Metadata = {
  title: "Project — Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

const TRANSITION_BUTTON_LABELS: Record<WorkflowStatus, string> = {
  draft: "Send Back to Draft",
  pending_review: "Submit for Review",
  approved: "Approve",
  published: "Publish",
  archived: "Archive",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminPortfolioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canAccessPortfolioAdmin(user)) redirect("/admin/overview");

  const { id } = await params;
  const [project, workflow, history, assignments] = await Promise.all([
    getPortfolioProjectByIdAdmin(id),
    getPortfolioWorkflowStatus(id),
    getActivityForEntity("portfolio_project", id),
    listPortfolioAssignments(id),
  ]);
  if (!project) notFound();

  const canManageAssignments = hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_assignments");
  let collaboratorOptions: { id: string; fullName: string | null; email: string | null }[] = [];
  if (canManageAssignments) {
    const result = await listUsersWithRoles();
    if (result.ok) {
      const assignedIds = new Set(assignments.map((a) => a.userId));
      collaboratorOptions = result.users
        .filter((u) => u.roles.includes("contractor") && !assignedIds.has(u.id))
        .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }));
    }
  }

  const reviewActorIds = [workflow?.submittedBy, workflow?.reviewedBy, ...assignments.map((a) => a.userId)].filter(
    (v): v is string => Boolean(v)
  );
  const actorIdentities = await resolveActorIdentities(reviewActorIds);
  const submittedByLabel = workflow?.submittedBy
    ? formatActorLabel(actorIdentities.get(workflow.submittedBy))
    : null;
  const reviewedByLabel = workflow?.reviewedBy ? formatActorLabel(actorIdentities.get(workflow.reviewedBy)) : null;

  const granted = getGrantedCapabilities(user, PORTFOLIO_CAPABILITIES);
  const status = project.status as WorkflowStatus;
  const transitions = allowedTransitions(status).filter((t) => granted.includes(t.capability));
  const canFeature = canToggleFeatured(status, granted);
  const canEditNatively = canCreatePortfolioProjectsNatively(user);
  const canDelete = hasCapability(user, PORTFOLIO_CAPABILITIES, "delete");
  const canPublish = hasCapability(user, PORTFOLIO_CAPABILITIES, "publish");
  const readiness = getPublishReadiness(project, { skipAltTextCheck: canPublish });
  const canManagePresentation = canManagePortfolioPresentation(user);

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <Link href="/admin/portfolio" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Portfolio
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="font-serif font-medium text-section-heading text-ordift-ink">{project.title}</h1>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
              {[project.client, project.location, project.year].filter(Boolean).join(" · ") || "No client/location set"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditNatively && (
              <Link
                href={`/admin/portfolio/${project.id}/edit`}
                className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white whitespace-nowrap"
              >
                Edit Project
              </Link>
            )}
            <a
              href={`/studio/structure/portfolioProject;${project.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink whitespace-nowrap"
            >
              Open Advanced Editor in Sanity Studio →
            </a>
            <PreviewOnLiveSiteButton publicPath={`/work/${project.slug}`} />
          </div>
        </div>
      </div>

      {(readiness.blocking.length > 0 || readiness.warnings.length > 0) && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small font-semibold text-ordift-ink mb-2">Publish Readiness</p>
          {readiness.blocking.map((b) => (
            <p key={b} className="font-sans text-caption text-red-700">✕ {b}</p>
          ))}
          {readiness.warnings.map((w) => (
            <p key={w} className="font-sans text-caption text-amber-700">⚠ {w}</p>
          ))}
        </section>
      )}

      {canManagePresentation && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <div>
            <h2 className="font-serif font-medium text-body text-ordift-ink">Portfolio Cover / Index Image</h2>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1 max-w-lg">
              Shown for this project on discipline index pages (e.g. /work/photography) instead of Hero Media.
              Doesn&apos;t change this project&apos;s own detail page. Leave unset to keep using Hero Media
              automatically.
            </p>
          </div>
          <PortfolioCoverImagePicker
            projectId={project.id}
            projectTitle={project.title}
            fallbackUrl={project.heroMedia.type === "image" ? project.heroMedia.url : null}
            fallbackAlt={project.heroMedia.alt}
            initialAssetId={project.coverImage?.assetId ?? null}
            initialUrl={project.coverImage?.url ?? null}
            initialAlt={project.coverImage?.alt ?? null}
            initialFocalX={project.coverImage?.focalX ?? null}
            initialFocalY={project.coverImage?.focalY ?? null}
          />
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Current Status</p>
            <p className="font-serif font-medium text-body text-ordift-ink">{STATUS_LABELS[status]}</p>
          </div>
          {project.featured && (
            <span className="font-sans text-caption font-medium text-ordift-gold-pressed">★ Featured</span>
          )}
        </div>

        {transitions.length === 0 && !canFeature ? (
          <p className="font-sans text-caption text-ordift-ink-muted">
            No further actions available to you at this stage.
          </p>
        ) : (
          <div className="space-y-4 pt-2 border-t border-black/5">
            {transitions.length > 0 && (
              <form action={transitionPortfolioProjectAction} className="space-y-3">
                <input type="hidden" name="id" value={project.id} />
                <div>
                  <label htmlFor="reviewNotes" className="font-sans text-caption text-ordift-ink-muted block mb-1">
                    Review notes (optional)
                  </label>
                  <textarea
                    id="reviewNotes"
                    name="reviewNotes"
                    rows={2}
                    className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
                    placeholder="Visible to whoever submitted this project — e.g. why it was sent back."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {transitions.map((t) => (
                    <button
                      key={t.to}
                      type="submit"
                      name="to"
                      value={t.to}
                      className={
                        t.to === "draft"
                          ? "font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink"
                          : "font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white"
                      }
                    >
                      {TRANSITION_BUTTON_LABELS[t.to]}
                    </button>
                  ))}
                </div>
              </form>
            )}

            {canFeature && (
              <form action={toggleFeaturedAction}>
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="next" value={String(!project.featured)} />
                <button type="submit" className="font-sans text-body-small font-medium underline underline-offset-4 text-ordift-gold-pressed">
                  {project.featured ? "Remove from Featured" : "Mark as Featured"}
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Review Record</h2>
        <dl className="grid grid-cols-2 gap-4 font-sans text-body-small">
          <div>
            <dt className="text-ordift-ink-muted text-caption uppercase tracking-wide">Submitted By</dt>
            <dd className="text-ordift-ink">{submittedByLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ordift-ink-muted text-caption uppercase tracking-wide">Submitted At</dt>
            <dd className="text-ordift-ink">{formatDateTime(workflow?.submittedAt ?? null)}</dd>
          </div>
          <div>
            <dt className="text-ordift-ink-muted text-caption uppercase tracking-wide">Reviewed By</dt>
            <dd className="text-ordift-ink">{reviewedByLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ordift-ink-muted text-caption uppercase tracking-wide">Reviewed At</dt>
            <dd className="text-ordift-ink">{formatDateTime(workflow?.reviewedAt ?? null)}</dd>
          </div>
          {workflow?.reviewNotes && (
            <div className="col-span-2">
              <dt className="text-ordift-ink-muted text-caption uppercase tracking-wide">Latest Review Notes</dt>
              <dd className="text-ordift-ink">{workflow.reviewNotes}</dd>
            </div>
          )}
        </dl>
      </section>

      {(canManageAssignments || assignments.length > 0) && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <div>
            <h2 className="font-serif font-medium text-body text-ordift-ink">Assigned Collaborators</h2>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">
              Photographer-tier accounts (Contractor role) can only see and edit projects they&apos;re assigned to
              here — never the full Admin Platform.
            </p>
          </div>

          {assignments.length > 0 && (
            <ul className="divide-y divide-black/5">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="font-sans text-body-small text-ordift-ink">
                    {formatActorLabel(actorIdentities.get(a.userId)) || a.fullName || a.userId}
                  </span>
                  {canManageAssignments && (
                    <form action={removeCollaboratorAction}>
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <input type="hidden" name="entityId" value={project.id} />
                      <button type="submit" className="font-sans text-caption text-ordift-ink-muted hover:text-red-700 underline underline-offset-4">
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManageAssignments && (
            <form action={assignCollaboratorAction} className="flex items-center gap-2 pt-2 border-t border-black/5">
              <input type="hidden" name="entityId" value={project.id} />
              <select
                name="userId"
                required
                className="flex-1 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
              >
                <option value="">Select a collaborator…</option>
                {collaboratorOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName ?? u.email ?? u.id}
                  </option>
                ))}
              </select>
              <button type="submit" className="font-sans text-body-small font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white whitespace-nowrap">
                Assign
              </button>
            </form>
          )}
          {canManageAssignments && collaboratorOptions.length === 0 && assignments.length === 0 && (
            <p className="font-sans text-caption text-ordift-ink-muted">
              No Contractor-role accounts exist yet — invite one from Users &amp; Roles first.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">History</h2>
        {history.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No lifecycle changes recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {history.map((entry) => (
              <div key={entry.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <p className="font-sans text-body-small text-ordift-ink">
                  {entry.action.replace("portfolio.", "").replace(/_/g, " ")}
                  {entry.actorUserId ? ` — ${entry.actorLabel}` : ""}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {canDelete && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Danger Zone</h2>
          <DeleteProjectButton id={project.id} title={project.title} />
        </section>
      )}
    </div>
  );
}
