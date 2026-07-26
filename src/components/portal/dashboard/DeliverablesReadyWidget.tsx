import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";

// Real count from the `deliverables` table (migration 0007) — no
// layout change from the Milestone 1 placeholder, exactly as planned.
export default function DeliverablesReadyWidget({ count }: { count: number }) {
  return (
    <DashboardWidget title="Deliverables Ready">
      {count === 0 ? (
        <EmptyWidgetState message="Nothing here yet — your final files will appear as soon as they're published." />
      ) : (
        <p className="font-sans text-body text-ordift-ink">
          {count} deliverable{count === 1 ? "" : "s"} ready to view across your projects.
        </p>
      )}
    </DashboardWidget>
  );
}
