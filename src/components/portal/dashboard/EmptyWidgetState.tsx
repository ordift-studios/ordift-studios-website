// Shared empty/placeholder state for widgets — used both for genuine
// "nothing yet" states (no active projects) and for the two Milestone-1
// widget slots (Deliverables Ready, Recent Notifications) that don't
// have real data to show until Milestone 3/5 ship. Never a fabricated
// count or fake preview — always an honest, plain statement.
export default function EmptyWidgetState({ message }: { message: string }) {
  return <p className="font-sans text-body-small text-ordift-ink-muted">{message}</p>;
}
