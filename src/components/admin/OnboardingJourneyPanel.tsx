import Link from "next/link";
import type { ReadinessCheck, AgreementReadiness } from "@/lib/legal/agreementReadiness";
import type { InstructorStep } from "@/lib/organization/instructorWorkspace";
import type { StepState, WorkspaceSummary } from "@/lib/workspace/processWorkspace";
import { ActivateForm, AddSignatoryForm, ApproveForIssueForm, AttestApprovalForm, ConfirmEntityForm, IssueAgreementForm, PrepareAgreementForm, RegisterMasterForm, ScheduleAForm, SelectSignatoryForm } from "./OnboardingJourneyForms";
import type { AgreementStage } from "@/lib/legal/instructorAgreementDocument";
import type { ScheduleATerms } from "@/lib/legal/instructorAgreementTerms";
import type { SigningProgress } from "@/lib/legal/instructorAgreementIssuance";

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

export type AgreementPanelData = {
  id: string; reference: string; status: string; stage: AgreementStage; terms: Partial<ScheduleATerms>; missingTerms: string[];
  preview: { text: string; sha256: string } | null; previewError: string | null; issuedSha256: string | null; signing: SigningProgress;
};
const TONE: Record<AgreementStage["tone"], string> = { neutral: "bg-black/5 text-ordift-ink", pending: "bg-amber-100 text-amber-900", good: "bg-green-100 text-green-900", bad: "bg-red-100 text-red-900" };

function AgreementPanel({ data, onboardingId, today }: { data: AgreementPanelData; onboardingId: string; today: string }) {
  const editable = data.status === "draft";
  const canApprove = ["draft", "internal_review"].includes(data.status) && data.missingTerms.length === 0 && data.preview;
  return (
    <div className="rounded-lg border border-black/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Agreement {data.reference}</p>
        <span className={`rounded-full px-3 py-1 font-sans text-caption font-medium ${TONE[data.stage.tone]}`}>{data.stage.label}</span>
      </div>
      <p className="font-sans text-caption text-ordift-ink-muted">Only a document signed by both parties counts as executed. A draft, an issued document, a partial signature or a test signature never does, and executing the agreement does not by itself assign a workshop.</p>
      {data.issuedSha256 && <p className="font-sans text-caption text-ordift-ink-muted">Issued document SHA-256: <span className="font-mono break-all">{data.issuedSha256}</span></p>}

      {editable && <ScheduleAForm onboardingId={onboardingId} agreementId={data.id} terms={data.terms} today={today} />}
      {data.missingTerms.length > 0 && editable && <p className="font-sans text-caption text-amber-900">Still required before preview: {data.missingTerms.join("; ")}.</p>}

      {data.preview ? (
        <details className="rounded-md border border-black/10 bg-ordift-offwhite p-3" open={editable || data.status === "internal_review" || data.status === "approved_for_issue"}>
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink">Full document preview (SHA-256 {data.preview.sha256.slice(0, 16)}…) — not issued</summary>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap font-mono text-caption text-ordift-ink">{data.preview.text}</pre>
        </details>
      ) : data.previewError ? <p className="font-sans text-caption text-red-800">Preview unavailable: {data.previewError}</p> : null}

      {canApprove && data.preview && <ApproveForIssueForm onboardingId={onboardingId} agreementId={data.id} previewSha256={data.preview.sha256} />}
      {data.status === "approved_for_issue" && <IssueAgreementForm onboardingId={onboardingId} agreementId={data.id} />}

      {data.signing.length > 0 && (
        <p className="font-sans text-caption text-ordift-ink-muted">“Accepted by provider” means the email service took the message; it is not proof it arrived. “Viewed” appears only when the signatory opens their secure link. If a delivery failed, press Issue again: signatories already accepted are not emailed twice.</p>
      )}
      {data.signing.length > 0 && (
        <table className="w-full text-left font-sans text-caption">
          <thead className="text-ordift-ink-muted"><tr><th className="py-1 pr-3">Signatory</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Signed</th><th className="py-1 pr-3">Link expires</th><th className="py-1 pr-3">Email</th><th className="py-1">Evidence</th></tr></thead>
          <tbody className="text-ordift-ink">
            {data.signing.map((g) => (
              <tr key={g.role} className="border-t border-black/5">
                <td className="py-1 pr-3">{g.role === "ordift" ? "Ordift" : "Instructor"}</td><td className="py-1 pr-3">{g.status.replace(/_/g, " ")}</td>
                <td className="py-1 pr-3">{g.signedAt ? g.signedAt.slice(0, 16).replace("T", " ") : "—"}</td><td className="py-1 pr-3">{g.linkExpiresAt ? g.linkExpiresAt.slice(0, 10) : "—"}</td>
                <td className="py-1 pr-3">{g.email === "accepted" ? "Accepted by provider" : g.email === "failed" ? "Failed — retry issue" : "Not sent"}</td>
                <td className="py-1 font-mono">{g.evidenceSha256 ? `${g.evidenceSha256.slice(0, 12)}…` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function OnboardingJourneyPanel({ steps, summary, personName, returnPath, onboardingId, agreement, today, agreementPanel }: {
  steps: InstructorStep[]; summary: WorkspaceSummary; personName: string | null; returnPath: string; onboardingId: string; agreement: AgreementReadiness | null; today: string; agreementPanel?: AgreementPanelData | null;
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
            {s.key === "agreement" && agreementPanel && <AgreementPanel data={agreementPanel} onboardingId={onboardingId} today={today} />}
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
