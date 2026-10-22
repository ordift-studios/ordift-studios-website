import Link from "next/link";
import type { AgreementReadiness, ReadinessCheck } from "@/lib/legal/agreementReadiness";
import type { ItemState, NextAction, RoadmapStage } from "@/lib/organization/onboardingJourney";

// Guided view of one external contributor's onboarding: where they are, who acts, what the system already knows, and the one next action.
// It is display only. Every control that changes a record is an EXISTING form further down this same page (requirements, stage, requisition)
// or an existing record page it links to - nothing here advances a stage, issues an agreement or sends anything.

const ITEM_LABEL: Record<ItemState, string> = { completed: "Completed", pending: "Pending", blocked: "Blocked", not_applicable: "Not applicable" };
const ITEM_TONE: Record<ItemState, string> = { completed: "text-green-800", pending: "text-ordift-ink", blocked: "text-red-800", not_applicable: "text-ordift-ink-muted" };
const STAGE_LABEL = { done: "Done", current: "You are here", upcoming: "Later" } as const;
const CHECK_LABEL: Record<ReadinessCheck["state"], string> = { verified: "✓ Verified", needs_confirmation: "◐ Needs confirmation", missing: "✗ Missing" };
const CHECK_TONE: Record<ReadinessCheck["state"], string> = { verified: "text-green-800", needs_confirmation: "text-amber-800", missing: "text-red-800" };

function Guide({ c }: { c: ReadinessCheck }) {
  const g = c.guide;
  if (!g) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 font-sans text-caption text-ordift-ink-muted sm:grid-cols-[6rem_1fr]">
      <dt className="font-medium text-ordift-ink">What is missing</dt><dd>{g.what}</dd>
      <dt className="font-medium text-ordift-ink">Why it matters</dt><dd>{g.why}</dd>
      <dt className="font-medium text-ordift-ink">Where the answer is</dt><dd>{g.source}</dd>
      <dt className="font-medium text-ordift-ink">Who resolves it</dt><dd>{g.who}</dd>
      <dt className="font-medium text-ordift-ink">How</dt>
      <dd>{g.how}{g.href && g.hrefLabel && <> <Link href={g.href} className="underline underline-offset-4 text-ordift-ink">{g.hrefLabel} →</Link></>}</dd>
    </dl>
  );
}

export default function OnboardingJourneyPanel({ roadmap, next, agreement, personName, returnPath }: { roadmap: RoadmapStage[]; next: NextAction; agreement: AgreementReadiness | null; personName: string | null; returnPath: string }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-6" aria-labelledby="journey-heading">
      <div>
        <h2 id="journey-heading" className="font-serif font-medium text-body text-ordift-ink">Guided onboarding{personName ? ` — ${personName}` : ""}</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">
          Built from the existing HR, Legal and Finance records, which stay the source of truth. Progress is never stored here, so you can leave and return to <span className="font-mono">{returnPath}</span> and see exactly where things stand. The forms that change records are below on this page.
        </p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3" role="status">
        <p className="font-sans text-caption uppercase tracking-wide text-amber-900">Next action · {next.actor}</p>
        <p className="font-sans text-body-small font-medium text-ordift-ink">{next.title}</p>
        <p className="font-sans text-body-small text-ordift-ink">{next.explanation}</p>
        {next.href && next.hrefLabel && <a href={next.href} className="inline-block font-sans text-body-small underline underline-offset-4">{next.hrefLabel} ↓</a>}
      </div>

      <ol className="divide-y divide-black/5 rounded-lg border border-black/10">
        {roadmap.map((s) => (
          <li key={s.stage} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink">{s.title}</p>
              <p className={`font-sans text-caption ${s.state === "done" ? "text-green-800" : s.state === "current" ? "text-ordift-gold-pressed" : "text-ordift-ink-muted"}`}>{STAGE_LABEL[s.state]} · {s.actor}</p>
            </div>
            <div className="font-sans text-body-small text-ordift-ink-muted">
              <p>{s.what}</p>
              <p className="text-caption">The system already supplies: {s.systemSupplies}</p>
              {s.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {s.items.map((it) => (
                    <li key={it.key} className="text-caption">
                      <span className={`font-medium ${ITEM_TONE[it.state]}`}>{ITEM_LABEL[it.state]}</span> · {it.label}{it.note ? ` — ${it.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      {agreement && (
        <div id="journey-legal-readiness" className="scroll-mt-6">
          <h3 className="font-sans text-body-small font-medium text-ordift-ink">
            {agreement.code} · {agreement.title} — ready to issue?{" "}
            <span className={agreement.canIssue ? "text-green-800" : "text-amber-800"}>{agreement.canIssue ? "Yes" : `Not yet (${agreement.unresolved.length} to resolve)`}</span>
          </h3>
          <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10">
            {agreement.checks.map((c) => (
              <li key={c.key} className="px-4 py-3 font-sans text-body-small">
                <p className="text-ordift-ink"><span className={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</span> · {c.label}</p>
                <p className="text-ordift-ink-muted">{c.detail}</p>
                <Guide c={c} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
