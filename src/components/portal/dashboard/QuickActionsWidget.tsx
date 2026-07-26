import Button from "@/components/Button";
import DashboardWidget from "./DashboardWidget";

// Every action's slot exists now, matching the approved Milestone 1
// spec — three of the five activate as their milestone ships (View
// Deliverables → Milestone 3, Request Reschedule → Milestone 4, Edit
// Profile → Milestone 6). Shown disabled/"coming soon" rather than
// linking somewhere that doesn't exist yet.
const ACTIONS: { label: string; href: string; disabled: boolean }[] = [
  { label: "View Projects", href: "#active-projects", disabled: false },
  { label: "View Deliverables", href: "#", disabled: true },
  { label: "View Bookings", href: "/portal/workshops", disabled: false },
  { label: "Request Reschedule", href: "#", disabled: true },
  { label: "Edit Profile", href: "#", disabled: true },
];

export default function QuickActionsWidget() {
  return (
    <DashboardWidget title="Quick Actions">
      <div className="flex flex-col gap-2.5">
        {ACTIONS.map((action) => (
          <div key={action.label} className="flex items-center justify-between gap-3">
            <Button href={action.href} variant="secondary" disabled={action.disabled} className="w-full">
              {action.label}
            </Button>
            {action.disabled && (
              <span className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                Coming soon
              </span>
            )}
          </div>
        ))}
      </div>
    </DashboardWidget>
  );
}
