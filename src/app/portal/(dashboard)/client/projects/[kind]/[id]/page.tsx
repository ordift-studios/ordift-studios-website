import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspaceOverview, isProjectKind } from "@/lib/portal/workspace";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OverviewTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const overview = await getWorkspaceOverview(kind, id, user.id);
  if (!overview) return null;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
      <div>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Current Status</p>
        <p className="font-sans text-body text-ordift-ink mt-1">{overview.statusLabel}</p>
      </div>

      {overview.nextMilestoneLabel && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Next Milestone</p>
          <p className="font-sans text-body text-ordift-ink mt-1">{overview.nextMilestoneLabel}</p>
        </div>
      )}

      <div>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Key Dates</p>
        <p className="font-sans text-body text-ordift-ink mt-1">Submitted {formatDate(overview.submittedAt)}</p>
      </div>

      {overview.paymentStatus && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Payment</p>
          <p className="font-sans text-body text-ordift-ink mt-1">{overview.paymentStatus}</p>
        </div>
      )}

      {overview.description && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">About This Workshop</p>
          <p className="font-sans text-body-small text-ordift-ink mt-1">{overview.description}</p>
        </div>
      )}

      {overview.learningOutcomes.length > 0 && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">You&rsquo;ll Learn</p>
          <ul className="mt-1 space-y-1 list-disc list-inside">
            {overview.learningOutcomes.map((o) => (
              <li key={o} className="font-sans text-body-small text-ordift-ink">{o}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
