// Placeholder — reschedule/cancellation request submission is
// Milestone 4. This route already exists so the tab works today;
// Milestone 4 replaces this body with the real request form and
// pending/approved/rejected status.
export default function RequestsTabPage() {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Reschedule and cancellation requests aren&apos;t available here yet — coming soon. In the meantime,{" "}
        <a href="/contact" className="text-ordift-gold-pressed underline underline-offset-4">
          contact us
        </a>{" "}
        directly.
      </p>
    </div>
  );
}
