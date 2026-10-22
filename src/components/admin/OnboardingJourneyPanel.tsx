import Link from "next/link";
import type { AgreementReadiness } from "@/lib/legal/agreementReadiness";
import type { NextAction, RoadmapStage } from "@/lib/organization/onboardingJourney";

// Read-only guided view of one external contributor's onboarding: where they are, who acts next, what the system already knows, and the
// one next action in plain English. It reuses the existing HR / Legal / Finance records and changes nothing - no stage is advanced, no
// agreement is issued, nothing is sent from here.

const STATE_LABEL = { done: "Done", current: "You are here", upcoming: "Later" } as const;
const STATE_TONE = { done: "text-green-800", current: "text-ordift-gold-pressed", upcoming: "text-ordift-ink-muted" } as const;

export default function OnboardingJourneyPanel({ roadmap, next, agreement, personName }: { roadmap: RoadmapStage[]; next: NextAction; agreement: AgreementReadiness | null; personName: string | null }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-6" aria-labelledby="journey-heading">
      <div>
        <h2 id="journey-heading" className="font-serif font-medium text-body text-ordift-ink">Guided onboarding{personName ? ` — ${personName}` : ""}</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">A plain-English view built from the existing HR, Legal and Finance records. Display only — nothing here advances a stage, issues an agreement or sends anything.</p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2" role="status">
        <p className="font-sans text-caption uppercase tracking-wide text-amber-900">Next action · {next.actor}</p>
        <p className="font-sans text-body-small font-medium text-ordift-ink">{next.title}</p>
        <p className="font-sans text-body-small text-ordift-ink">{next.explanation}</p>
        {next.blockedBy.length > 0 && (
          <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink space-y-1">
            {next.blockedBy.map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
        {next.href && next.hrefLabel && <Link href={next.href} className="inline-block font-sans text-body-small underline underline-offset-4">{next.hrefLabel} →</Link>}
      </div>

      <ol className="divide-y divide-black/5 rounded-lg border border-black/10">
        {roadmap.map((s) => (
          <li key={s.stage} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]">
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink">{s.title}</p>
              <p className={`font-sans text-caption ${STATE_TONE[s.state]}`}>{STATE_LABEL[s.state]} · {s.actor}</p>
            </div>
            <div className="font-sans text-body-small text-ordift-ink-muted">
              <p>{s.what}</p>
              <p className="text-caption">System already supplies: {s.systemSupplies}</p>
            </div>
          </li>
        ))}
      </ol>

      {agreement && (
        <div>
          <h3 className="font-sans text-body-small font-medium text-ordift-ink">{agreement.code} · {agreement.title} — ready to issue? <span className={agreement.canIssue ? "text-green-800" : "text-amber-800"}>{agreement.canIssue ? "Yes" : "Not yet"}</span></h3>
          <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10">
            {agreement.checks.map((c) => (
              <li key={c.key} className="px-4 py-2 font-sans text-body-small">
                <p className="text-ordift-ink"><span className={c.state === "verified" ? "text-green-800" : "text-amber-800"}>{c.state === "verified" ? "✓ Verified" : "✗ Missing"}</span> · {c.label}</p>
                <p className="text-ordift-ink-muted">{c.detail}</p>
                {c.action && <p className="text-ordift-ink">To resolve: {c.action}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
