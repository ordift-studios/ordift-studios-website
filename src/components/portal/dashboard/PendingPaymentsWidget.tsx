import DashboardWidget from "./DashboardWidget";
import EmptyWidgetState from "./EmptyWidgetState";

// Future-ready placeholder only, per the approved Milestone 1 scope —
// real payment tracking is v1.4.x (Finance & Invoicing), a later
// version. No invented payment data; this widget never shows a number
// until that version actually wires one in.
export default function PendingPaymentsWidget() {
  return (
    <DashboardWidget title="Pending Payments">
      <EmptyWidgetState message="Payment tracking isn't available yet — this is coming in a future release." />
    </DashboardWidget>
  );
}
