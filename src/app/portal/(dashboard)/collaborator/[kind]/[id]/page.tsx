import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import {
  isProjectKind,
  getAssignedProjectOverview,
  getAssignedDeliverables,
  getProjectUpdates,
} from "@/lib/portal/collaboratorData";
import { postProjectUpdateAction } from "../../actions";

export const metadata: Metadata = {
  title: "Project — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

export default async function CollaboratorProjectPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (!hasRole(user, "contractor")) redirect("/portal");
  if (!isProjectKind(kind)) notFound();

  const overview = await getAssignedProjectOverview(kind, id);
  // Not owned, not staff/admin, and no active assignment for this exact
  // project — RLS already returned nothing; treat it the same as a
  // non-existent page rather than confirming the project's existence.
  if (!overview) notFound();

  const [deliverables, updates] = await Promise.all([
    getAssignedDeliverables(kind, id),
    getProjectUpdates(kind, id),
  ]);

  async function submitUpdate(formData: FormData) {
    "use server";
    await postProjectUpdateAction(formData);
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Collaborator
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {overview.title}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {overview.statusLabel} · submitted {new Date(overview.submittedAt).toLocaleDateString()}
        </p>
      </div>

      <section className="bg-white border border-black/10 rounded-2xl p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Deliverables</h2>
        {deliverables.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No deliverables published yet.</p>
        ) : (
          <ul className="space-y-3">
            {deliverables.map((d) => (
              <li key={d.id} className="border border-black/5 rounded-xl p-4">
                <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{d.categoryLabel}</p>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                  {d.title}
                </a>
                {d.description && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{d.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-5">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Updates</h2>

        <form action={submitUpdate} className="space-y-2 border-b border-black/5 pb-5">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <textarea
            name="note"
            required
            placeholder="Post an update for the team…"
            rows={3}
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <input
            type="url"
            name="linkUrl"
            placeholder="Reference link (optional) — e.g. a Drive or portfolio link"
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <button
            type="submit"
            className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white"
          >
            Post Update
          </button>
        </form>

        {updates.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No updates yet.</p>
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id}>
                <p className="font-sans text-body-small text-ordift-ink">{u.note}</p>
                {u.linkUrl && (
                  <a href={u.linkUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    {u.linkUrl}
                  </a>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                  {u.authorName ?? "Team member"} — {new Date(u.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
