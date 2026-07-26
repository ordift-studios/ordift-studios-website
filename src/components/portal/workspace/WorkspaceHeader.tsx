import Link from "next/link";
import type { WorkspaceOverview } from "@/lib/portal/workspace";

export default function WorkspaceHeader({ overview }: { overview: WorkspaceOverview }) {
  return (
    <div className="mb-6">
      <Link
        href="/portal/client"
        className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 mb-4 inline-block"
      >
        ← Back to Workspace
      </Link>
      <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-1">
        {overview.projectType}
      </p>
      <h1 className="font-serif font-medium text-section-heading text-ordift-ink mb-3">{overview.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ordift-offwhite font-sans text-body-small font-medium text-ordift-ink">
          {overview.statusLabel}
        </span>
        {overview.progress && (
          <span className="font-sans text-caption text-ordift-ink-muted">
            Step {overview.progress.step} of {overview.progress.total}
          </span>
        )}
      </div>
    </div>
  );
}
