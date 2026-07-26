import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";

// Placeholder for Milestone 1 — the `deliverables` table doesn't exist
// until Milestone 3. This widget occupies its designed slot in the grid
// now; Milestone 3 replaces this body with a real count/preview, no
// layout change required.
export default function DeliverablesReadyWidget() {
  return (
    <DashboardWidget title="Deliverables Ready">
      <EmptyWidgetState message="Nothing here yet — your final files will appear as soon as they're published." />
    </DashboardWidget>
  );
}
