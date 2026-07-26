import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";
import type { ProjectCardData } from "@/lib/portal/dashboard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function LatestUpdatesWidget({ projects }: { projects: ProjectCardData[] }) {
  return (
    <DashboardWidget title="Latest Project Updates">
      {projects.length === 0 ? (
        <EmptyWidgetState message="No project updates yet." />
      ) : (
        <ul className="divide-y divide-black/5">
          {projects.map((project) => (
            <li key={project.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="font-sans text-body-small text-ordift-ink">{project.title}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
                {project.statusLabel} · {formatDate(project.lastUpdated)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
