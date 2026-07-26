import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";

// Placeholder for Milestone 1 — the `client_notifications` table doesn't
// exist until Milestone 5. Same reasoning as DeliverablesReadyWidget:
// the slot exists now, the real feed and unread-count wire in later.
export default function RecentNotificationsWidget() {
  return (
    <DashboardWidget title="Recent Notifications">
      <EmptyWidgetState message="Notifications are coming soon — you'll see project and booking updates here." />
    </DashboardWidget>
  );
}
