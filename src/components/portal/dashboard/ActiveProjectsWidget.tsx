import Button from "@/components/Button";
import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";
import ProjectCard from "./ProjectCard";
import type { ProjectCardData } from "@/lib/portal/dashboard";

export default function ActiveProjectsWidget({ projects }: { projects: ProjectCardData[] }) {
  return (
    <DashboardWidget title="Active Projects" className="lg:col-span-2" id="active-projects">
      {projects.length === 0 ? (
        <div className="flex-1 flex flex-col items-start gap-4">
          <EmptyWidgetState message="You don't have any active projects yet. Once you submit an enquiry, it'll appear here." />
          <Button href="/book" variant="primary">
            Start an Enquiry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </DashboardWidget>
  );
}
