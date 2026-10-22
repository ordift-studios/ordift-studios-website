import Link from "next/link";
import type { ReadinessCheck, AgreementReadiness } from "@/lib/legal/agreementReadiness";
import type { InstructorStep } from "@/lib/organization/instructorWorkspace";
import type { StepState, WorkspaceSummary } from "@/lib/workspace/processWorkspace";
import { ActivateForm, AddSignatoryForm, AttestApprovalForm, ConfirmEntityForm, PrepareAgreementForm, RegisterMasterForm, SelectSignatoryForm } from "./OnboardingJourneyForms";

// One guided workspace for one onboarding, top to bottom. Display plus embedded forms: every control submits to a server action that
// re-checks authority and calls the existing authoritative function. HR, Legal and Finance remain the systems of record; steps that rely on
// an existing form further down this page link straight to it.

const STATE_LABEL: Record<StepState, string> = { completed: "Completed", pending: "Pending", blocked: "Blocked", not_applicable: "Not applicable" };
const STATE_TONE: Record<StepState, string> = { completed: "bg-green-100 text-green-900", pending: "bg-amber-100 text-amber-900", blocked: "bg-red-100 text-red-900", not_applicable: "bg-black/5 text-ordift-ink-muted" };
const CHECK_LABEL: Record<ReadinessCheck["state"], string> = { verified: "✓ Verified", needs_confirmation: "◐ Needs confirmation", missing: "✗ Missing" };
const CHECK_TONE: Record<ReadinessCheck["state"], string> = { verified: "text-green-800", needs_confirmation: "text-amber-800", missing: "text-red-800" };

function Guide({ c }: { c: ReadinessCheck }) {
  const g = c.guide;
  if (!g) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 font-sans text-caption text-ordift-ink-muted sm:grid-cols-[7rem_1fr]">
      <dt className="font-medium text-ordift-ink">What is missing</dt><dd>{g.what}</dd>
      <dt className="font-medium text-ordift-ink">Why it matters</dt><dd>{g.why}</dd>
      <dt className="font-medium text-ordift-ink">Where the answer is</dt><dd>{g.source}</dd>
      <dt className="font-medium text-ordift-ink">Who resolves it</dt><dd>{g.who}</dd>
      <dt className="font-medium text-ordift-ink">How</dt>
      <dd>{g.how}{g.href && g.hrefLabel && <> <Link href={g.href} className="underline underline-offset-4 text-ordift-ink">{g.hrefLabel} →</Link></>}</dd>
    </dl>
  );
}

function Form({ kind, onboardingId, agreement, today, steps }: { kind: string; onboardingId: string; agreement: AgreementReadiness; today: string; steps: InstructorStep[] }) {
  const ctx = agreement.context;
  const by = (k: string) => agreement.checks.find((c) => c.key === k);
  const entity = ctx.entity;
  switch (kind) {
    case "attest_approval":
      return ctx.versionId ? <AttestApprovalForm onboardingId={onboardingId} versionId={ctx.versionId} documentCode={agreement.code} today={today} /> : null;
    case "register_master":
      return ctx.versionId ? <RegisterMasterForm onboardingId={onboardingId} versionId={ctx.versionId} /> : null;
    case "activate": {
      const ready = ["approval_date", "content_reference", "review_clauses"].every((k) => by(k)?.state === "verified");
      if (!ctx.versionId) return null;
      return ready ? <ActivateForm onboardingId={onboardingId} versionId={ctx.versionId} proposedEffectiveDate={ctx.approvalDate} today={today} /> : <p className="mt-3 font-sans text-caption text-ordift-ink-muted">Activation becomes available once the approval date is verified and the master is registered and checked.</p>;
    }
    case "confirm_entity":
      return <ConfirmEntityForm onboardingId={onboardingId} candidates={ctx.candidates.map((c) => ({ id: c.id, name: c.name, jurisdiction: c.jurisdiction }))} recordedEntityId={ctx.recordedEntityId} />;
    case "add_signatory":
      return entity ? <AddSignatoryForm onboardingId={onboardingId} entity={{ id: entity.id, name: entity.name }} documents={entity.documents.filter((d) => d.hasStoredFile).map((d) => ({ id: d.id, label: d.filename ?? d.type }))} founder={ctx.founder} /> : null;
    case "select_signatory":
      return entity ? <SelectSignatoryForm onboardingId={onboardingId} entityId={entity.id} signatories={entity.signatories.map((s) => ({ id: s.id, label: `${s.fullName} — ${s.position}` }))} /> : null;
    case "prepare_agreement":
      return <PrepareAgreementForm onboardingId={onboardingId} code={agreement.code} />;
    default:
      void steps;
      return null;
  }
}

export default function OnboardingJourneyPanel({ steps, summary, personName, returnPath, onboardingId, agreement, today }: {
  steps: InstructorStep[]; summary: WorkspaceSummary; personName: string | null; returnPath: string; onboardingId: string; agreement: AgreementReadiness | null; today: string;
}) {
  const current = summary.currentIndex === null ? null : steps[summary.currentIndex];
  return (
    <section className="space-y-5" aria-labelledby="journey-heading">
      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 id="journey-heading" className="font-serif font-medium text-body text-ordift-ink">Guided onboarding{personName ? ` — ${personName}` : ""}</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Work down this page from Step 1. Each step shows who acts, what the system already knows and what is missing, and gives you the form or link to complete it. HR, Legal and Finance stay the systems of record; progress is derived from their records, never stored here, so you can leave and return to <span className="font-mono">{returnPath}</span> at any time.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-sans text-body-small text-ordift-ink"><strong>{summary.completed} of {summary.applicable}</strong> steps complete ({summary.percent}%)</p>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-black/10" aria-hidden="true"><div className="h-full bg-green-700" style={{ width: `${summary.percent}%` }} /></div>
        </div>
        {current && (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 font-sans text-body-small text-ordift-ink">
            <strong>Next: Step {current.number} — {current.title}.</strong> {current.blocker ?? (current.missing[0] ? `Missing: ${current.missing[0]}.` : "")} <a href={`#step-${current.number}`} className="underline underline-offset-4">Go to this step ↓</a>
          </p>
        )}
      </div>

      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.key} id={`step-${s.number}`} className="scroll-mt-6 rounded-xl border border-black/10 bg-white p-6 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-serif font-medium text-body text-ordift-ink">Step {s.number} of {steps.length} · {s.title}</h3>
              <span className={`rounded-full px-3 py-1 font-sans text-caption font-medium ${STATE_TONE[s.state]}`}>{STATE_LABEL[s.state]}</span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">Responsible: {s.owner}</p>
            <p className="font-sans text-body-small text-ordift-ink">{s.purpose}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><p className="font-sans text-caption font-medium text-ordift-ink">The system already knows</p>{s.known.length ? <ul className="list-disc pl-5 font-sans text-caption text-ordift-ink-muted">{s.known.map((k) => <li key={k}>{k}</li>)}</ul> : <p className="font-sans text-caption text-ordift-ink-muted">Nothing yet.</p>}</div>
              <div><p className="font-sans text-caption font-medium text-ordift-ink">Still missing</p>{s.missing.length ? <ul className="list-disc pl-5 font-sans text-caption text-ordift-ink-muted">{s.missing.map((k) => <li key={k}>{k}</li>)}</ul> : <p className="font-sans text-caption text-ordift-ink-muted">Nothing.</p>}</div>
            </div>
            {s.blocker && <p className="rounded-md bg-red-50 px-3 py-2 font-sans text-caption text-red-900"><strong>Blocked:</strong> {s.blocker}</p>}
            {s.action?.kind === "anchor" && <a href={s.action.href} className="inline-block font-sans text-body-small underline underline-offset-4">{s.action.label} ↓</a>}
            {s.action?.kind === "link" && <Link href={s.action.href} className="inline-block font-sans text-body-small underline underline-offset-4">{s.action.label} →</Link>}

            {s.checks.length > 0 && (
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
                {s.checks.map((c) => (
                  <li key={c.key} className="px-4 py-3 font-sans text-body-small">
                    <p className="text-ordift-ink"><span className={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</span> · {c.label}</p>
                    <p className="text-ordift-ink-muted">{c.detail}</p>
                    {c.state !== "verified" && <Guide c={c} />}
                  </li>
                ))}
              </ul>
            )}
            {agreement && s.key === "signatory" && agreement.context.governance.length > 0 && (
              <div className="rounded-lg border border-black/10 p-4">
                <p className="font-sans text-body-small font-medium text-ordift-ink">Founder governance record{agreement.context.founder ? ` — ${agreement.context.founder.name}${agreement.context.founder.memberNumber ? `, member ${agreement.context.founder.memberNumber}` : ""} (verified identity; one profile for every entity)` : ""}</p>
                <ul className="mt-1 space-y-1 font-sans text-caption text-ordift-ink-muted">
                  {agreement.context.governance.map((g) => (
                    <li key={g.entityName}>
                      <Link href={g.href} className="underline underline-offset-4 text-ordift-ink">{g.entityName}{g.jurisdiction ? ` (${g.jurisdiction})` : ""}</Link>: {g.founderIsSignatory ? "Founder recorded as signatory with a documentary basis" : g.signatories ? `${g.signatories} signatory(ies) recorded; the Founder is not among them with a documentary basis` : "no signatory recorded"}; {g.storedBasisDocuments} stored supporting document(s){g.noteOnlyRecords ? `, ${g.noteOnlyRecords} note-only record(s) that cannot evidence authority` : ""}.
                    </li>
                  ))}
                </ul>
                <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Delegations are never granted here. Ownership alone does not establish signing authority; statutory restrictions are read from each entity&apos;s registration documents.</p>
              </div>
            )}
            {agreement && s.forms.map((kind) => {
              const needed = kind === "prepare_agreement" || s.checks.some((c) => c.state !== "verified" && c.actionKey === kind);
              return needed ? <Form key={kind} kind={kind} onboardingId={onboardingId} agreement={agreement} today={today} steps={steps} /> : null;
            })}

            <nav className="flex justify-between border-t border-black/5 pt-2 font-sans text-caption text-ordift-ink-muted" aria-label={`Step ${s.number} navigation`}>
              {i > 0 ? <a href={`#step-${s.number - 1}`} className="underline underline-offset-4">← Step {s.number - 1}: {steps[i - 1].title}</a> : <span />}
              {i < steps.length - 1 ? <a href={`#step-${s.number + 1}`} className="underline underline-offset-4">Step {s.number + 1}: {steps[i + 1].title} →</a> : <span />}
            </nav>
          </li>
        ))}
      </ol>
    </section>
  );
}
