import Button from "@/components/Button";
import DashboardWidget from "./DashboardWidget";

// Every action's slot exists — two of five still activate as later
// milestones ship (Request Reschedule → Milestone 4, Edit Profile →
// Milestone 6). Shown disabled/"coming soon" rather than linking
// somewhere that doesn't exist yet. View Deliverables activated in
// Milestone 3: links to whichever project actually has deliverables,
// or stays disabled if none do yet — never a fabricated destination.
export default function QuickActionsWidget({ deliverablesHref }: { deliverablesHref: string | null }) {
  const actions: { label: string; href: string; disabled: boolean }[] = [
    { label: "View Projects", href: "#active-projects", disabled: false },
    { label: "View Deliverables", href: deliverablesHref ?? "#", disabled: !deliverablesHref },
    { label: "View Bookings", href: "/portal/workshops", disabled: false },
    { label: "Request Reschedule", href: "#", disabled: true },
    { label: "Edit Profile", href: "#", disabled: true },
  ];

  return (
    <DashboardWidget title="Quick Actions">
      <div className="flex flex-col gap-2.5">
        {actions.map((action) => (
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
