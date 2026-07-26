import type { ProjectCardData } from "@/lib/portal/dashboard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Branch/terminal stages (completed, repeat_client, referral, declined,
// closed) don't have a meaningful "progress through the pipeline" —
// getProgress() in src/lib/portal/dashboard.ts already returns null for
// these, so the bar is simply omitted rather than showing a misleading
// percentage.
function ProgressBar({ progress }: { progress: { step: number; total: number } }) {
  const percent = Math.round((progress.step / progress.total) * 100);
  return (
    <div className="mt-3">
      <div className="h-1.5 w-full rounded-full bg-ordift-offwhite overflow-hidden">
        <div
          className="h-full rounded-full bg-ordift-gold"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-sans text-caption text-ordift-ink-muted mt-1.5">
        Step {progress.step} of {progress.total}
      </p>
    </div>
  );
}

export default function ProjectCard({ project }: { project: ProjectCardData }) {
  return (
    <div className="border border-black/10 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide mb-1">
            {project.projectType}
          </p>
          <p className="font-serif text-body text-ordift-ink">{project.title}</p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ordift-offwhite font-sans text-body-small font-medium text-ordift-ink whitespace-nowrap">
          {project.statusLabel}
        </span>
      </div>

      {project.progress && <ProgressBar progress={project.progress} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 font-sans text-caption">
        <div>
          <dt className="text-ordift-ink-muted">Next milestone</dt>
          <dd className="text-ordift-ink mt-0.5">{project.nextMilestoneLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ordift-ink-muted">Next appointment</dt>
          <dd className="text-ordift-ink mt-0.5">Not yet scheduled</dd>
        </div>
        <div>
          <dt className="text-ordift-ink-muted">Deliverables</dt>
          <dd className="text-ordift-ink mt-0.5">
            {project.deliverablesAvailable > 0
              ? `${project.deliverablesAvailable} available`
              : "None yet"}
          </dd>
        </div>
        <div>
          <dt className="text-ordift-ink-muted">Last updated</dt>
          <dd className="text-ordift-ink mt-0.5">{formatDate(project.lastUpdated)}</dd>
        </div>
      </dl>

      <p className="font-sans text-caption text-ordift-ink-muted mt-4">
        Full project timeline coming soon.
      </p>
    </div>
  );
}
