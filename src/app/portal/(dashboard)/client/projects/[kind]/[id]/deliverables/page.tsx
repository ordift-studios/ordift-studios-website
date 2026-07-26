// Placeholder — the `deliverables` table doesn't exist until Milestone
// 3. This route already exists so the tab works today; Milestone 3
// replaces this body with the real read-only deliverables list.
export default function DeliverablesTabPage() {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Nothing here yet — your final files and staff-published deliverables will appear as soon as they&apos;re
        published.
      </p>
    </div>
  );
}
