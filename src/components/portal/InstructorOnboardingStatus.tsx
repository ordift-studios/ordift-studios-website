import Link from "next/link";
import type { InstructorOnboardingView, ItemState } from "@/lib/organization/instructorOnboardingView";

// The instructor's own onboarding, item by item: state, owner, next action, whether it is needed now, and what it blocks. Read-only.
// When something is waiting for the instructor, ONE prominent action is shown first so nobody has to search for it.
const CHIP: Record<ItemState, string> = {
  completed: "bg-green-100 text-green-900", awaiting_instructor: "bg-amber-100 text-amber-950", awaiting_ordift: "bg-blue-100 text-blue-900",
  not_yet_requested: "bg-black/5 text-ordift-ink", under_review: "bg-blue-100 text-blue-900", future_workshop: "bg-black/5 text-ordift-ink",
};

export function InstructorOnboardingStatus({ view, firstName }: { view: InstructorOnboardingView; firstName?: string | null }) {
  const primary = view.items.find((i) => i.actionNeededNow && i.state === "awaiting_instructor" && i.link) ?? null;
  return (
    <section className="bg-white border border-black/10 rounded-2xl p-5 sm:p-6 space-y-5" data-testid="instructor-onboarding" aria-labelledby="instructor-onboarding-heading">
      <div className="space-y-2">
        <h2 id="instructor-onboarding-heading" className="font-serif font-medium text-card-title text-ordift-ink">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</h2>
        {primary ? (
          <p className="font-sans text-body-small text-ordift-ink">Please complete the outstanding requirement below as we prepare for your upcoming workshop programme.</p>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink">Nothing is waiting for you right now. Your onboarding position is shown below.</p>
        )}
        {view.stageLabel && <p className="font-sans text-caption text-ordift-ink-muted">Onboarding stage: {view.stageLabel}</p>}
        {view.representativeName && <p className="font-sans text-body-small text-ordift-ink-muted" data-testid="onboarding-representative">Your onboarding representative: <span className="text-ordift-ink">{view.representativeName}, ORDIFT STUDIOS</span></p>}
      </div>

      {primary?.link && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3" data-testid="instructor-primary-action">
          <p className="font-sans text-body-small font-medium text-ordift-ink">{primary.label}</p>
          <p className="font-sans text-body-small text-ordift-ink">{primary.detail}</p>
          <Link href={primary.link.href} className="flex min-h-11 w-full sm:w-auto sm:inline-flex items-center justify-center rounded-lg bg-ordift-gold px-5 py-2 font-sans text-body-small font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{primary.link.label}</Link>
        </div>
      )}

      <ul className="divide-y divide-black/10">
        {view.items.map((i) => (
          <li key={i.key} className="py-3 space-y-1" data-testid={`onboarding-item-${i.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{i.label}</span>
              <span className={`px-2.5 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${CHIP[i.state]}`} data-testid={`onboarding-state-${i.key}`}>{i.stateLabel}</span>
            </div>
            <p className="font-sans text-body-small text-ordift-ink-muted">{i.detail}</p>
            {i.nextAction && i !== primary && <p className="font-sans text-body-small text-ordift-ink">{i.nextAction}</p>}
            {i.link && i !== primary && <Link href={i.link.href} className="inline-block py-1 font-sans text-body-small underline underline-offset-4">{i.link.label} →</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
