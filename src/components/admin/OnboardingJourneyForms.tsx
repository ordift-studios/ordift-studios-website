"use client";

import { useActionState } from "react";
import type { JourneyActionState } from "@/app/admin/organization/onboarding/[onboardingId]/journeyActions";
import {
  activateTemplateAction, addSignatoryAction, attestApprovalAction, confirmEntityAction, prepareAgreementAction, registerMasterAction, selectSignatoryAction,
} from "@/app/admin/organization/onboarding/[onboardingId]/journeyActions";

// Embedded forms of the guided onboarding workspace. They carry no authority of their own: each submits to a server action that re-checks
// permissions and calls the existing authoritative function.

const input = "w-full rounded-md border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const label = "block font-sans text-caption text-ordift-ink-muted";
const button = "rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-50";

function Result({ state }: { state: JourneyActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="font-sans text-caption text-green-800">{state.message}</p>
  ) : (
    <div role="alert" className="font-sans text-caption text-red-800">
      <p>{state.error}</p>
      {state.errors && state.errors.length > 1 && <ul className="list-disc pl-5">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-ordift-offwhite p-4 space-y-3">
      <p className="font-sans text-body-small font-medium text-ordift-ink">{title}</p>
      {children}
    </div>
  );
}

export function AttestApprovalForm({ onboardingId, versionId, documentCode, today }: { onboardingId: string; versionId: string; documentCode: string; today: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(attestApprovalAction, null);
  return (
    <Box title="Verify historical legal approval">
      <p className="font-sans text-caption text-ordift-ink-muted">Record the real date counsel approved {documentCode}, with the evidence. Your identity and today&apos;s date ({today}) are recorded automatically as the verification, separately from the approval date. Nothing here activates or issues anything.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="documentCode" value={documentCode} />
        <div><label className={label} htmlFor="approvalDate">Date counsel approved this document</label><input id="approvalDate" name="approvalDate" type="date" required max={today} className={input} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="counselName">Counsel&apos;s name</label><input id="counselName" name="counselName" required className={input} /></div>
          <div><label className={label} htmlFor="counselFirm">Firm</label><input id="counselFirm" name="counselFirm" required className={input} /></div>
        </div>
        <div><label className={label} htmlFor="evidenceKind">Kind of evidence</label>
          <select id="evidenceKind" name="evidenceKind" required className={input} defaultValue=""><option value="" disabled>Choose…</option><option value="signed_letter">Signed letter</option><option value="counsel_email">Counsel&apos;s email</option><option value="signed_register">Signed register or certificate</option><option value="other_written_record">Other written record</option></select></div>
        <div><label className={label} htmlFor="evidenceReference">What the evidence is and where it is kept</label><textarea id="evidenceReference" name="evidenceReference" required rows={2} className={input} /></div>
        <div><label className={label} htmlFor="evidenceSha256">Evidence file fingerprint (SHA-256, optional)</label><input id="evidenceSha256" name="evidenceSha256" className={input} /></div>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="namesThisDocument" value="yes" className="mt-1" /> The evidence expressly names {documentCode}. (A date belonging to a different document set cannot be used.)</label>
        <button className={button} disabled={pending}>{pending ? "Recording…" : "Record verified approval"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function RegisterMasterForm({ onboardingId, versionId }: { onboardingId: string; versionId: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(registerMasterAction, null);
  return (
    <Box title="Register the controlled master">
      <p className="font-sans text-caption text-ordift-ink-muted">The stored Word and PDF are re-read and re-hashed, compared with the checksums recorded at ingestion, and the Word text is checked for unresolved counsel-review markers. Only if everything matches is the reference written. Nothing is copied or re-uploaded.</p>
      <form action={action}><input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="versionId" value={versionId} /><button className={button} disabled={pending}>{pending ? "Verifying…" : "Verify and register"}</button><Result state={state} /></form>
    </Box>
  );
}

export function ActivateForm({ onboardingId, versionId, proposedEffectiveDate, today }: { onboardingId: string; versionId: string; proposedEffectiveDate: string | null; today: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(activateTemplateAction, null);
  return (
    <Box title="Set the effective date and activate the template">
      <p className="font-sans text-caption text-ordift-ink-muted">Policy: the effective date is normally the verified approval date{proposedEffectiveDate ? ` (${proposedEffectiveDate})` : ""}. The activation time is always the real time you press the button and is never back-dated. This does not issue or sign any agreement.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="versionId" value={versionId} />
        <div><label className={label} htmlFor="effectiveDate">Template effective date</label><input id="effectiveDate" name="effectiveDate" type="date" required defaultValue={proposedEffectiveDate ?? undefined} className={input} /></div>
        <div><label className={label} htmlFor="backdatedReason">If this date is before {today}: why it is correct (required)</label><input id="backdatedReason" name="backdatedReason" className={input} /></div>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="confirmActivate" value="yes" className="mt-1" /> I confirm the template should become available for use now.</label>
        <button className={button} disabled={pending}>{pending ? "Activating…" : "Activate template"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function ConfirmEntityForm({ onboardingId, candidates, recordedEntityId }: { onboardingId: string; candidates: { id: string; name: string; jurisdiction: string | null }[]; recordedEntityId: string | null }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(confirmEntityAction, null);
  return (
    <Box title="Confirm the contracting entity">
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} />
        <div><label className={label} htmlFor="entityId">Verified entity</label>
          <select id="entityId" name="entityId" required className={input} defaultValue={recordedEntityId ?? ""}>
            <option value="" disabled>Choose…</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.jurisdiction ? ` — ${c.jurisdiction}` : ""}{c.id === recordedEntityId ? " (recorded on the requisition)" : ""}</option>)}
          </select></div>
        <button className={button} disabled={pending}>{pending ? "Confirming…" : "Confirm entity"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function AddSignatoryForm({ onboardingId, entity, documents, founder }: { onboardingId: string; entity: { id: string; name: string }; documents: { id: string; label: string }[]; founder: { profileId: string; name: string; memberNumber: string | null } | null }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(addSignatoryAction, null);
  return (
    <Box title={`Record an authorised signatory for ${entity.name}`}>
      <p className="font-sans text-caption text-ordift-ink-muted">Copy the name, position and authority exactly as the supporting document states them. Nothing is pre-filled as fact: ownership alone does not establish signing authority.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="entityId" value={entity.id} />
        <div><label className={label} htmlFor="sigDoc">Supporting document (must have a stored file)</label>
          <select id="sigDoc" name="sourceDocumentId" required className={input} defaultValue=""><option value="" disabled>Choose…</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        <div><label className={label} htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required className={input} defaultValue={founder?.name ?? ""} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="position">Position (as stated)</label><input id="position" name="position" required className={input} /></div>
          <div><label className={label} htmlFor="authority">Authority (as stated)</label><input id="authority" name="authority" required className={input} /></div>
        </div>
        <div><label className={label} htmlFor="effectiveFrom">Effective from (optional)</label><input id="effectiveFrom" name="effectiveFrom" type="date" className={input} /></div>
        {founder && (<label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="linkFounder" value="yes" className="mt-1" /> This is the Founder ({founder.name}{founder.memberNumber ? `, member ${founder.memberNumber}` : ""}) - link to their verified identity.<input type="hidden" name="founderProfileId" value={founder.profileId} /></label>)}
        <button className={button} disabled={pending}>{pending ? "Recording…" : "Record signatory"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function SelectSignatoryForm({ onboardingId, entityId, signatories }: { onboardingId: string; entityId: string; signatories: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(selectSignatoryAction, null);
  return (
    <Box title="Choose who signs">
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="entityId" value={entityId} />
        <select name="signatoryId" required className={input} defaultValue="" aria-label="Signatory"><option value="" disabled>Choose…</option>{signatories.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <button className={button} disabled={pending}>{pending ? "Saving…" : "Select signatory"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function PrepareAgreementForm({ onboardingId, code }: { onboardingId: string; code: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(prepareAgreementAction, null);
  return (
    <Box title={`Prepare the ${code} agreement`}>
      <p className="font-sans text-caption text-ordift-ink-muted">Creates a DRAFT from the verified profile, entity, signatory and template. It is not issued, sent or signed, and the session and fee schedules are completed per workshop.</p>
      <form action={action}><input type="hidden" name="onboardingId" value={onboardingId} /><button className={button} disabled={pending}>{pending ? "Preparing…" : "Prepare draft agreement"}</button><Result state={state} /></form>
    </Box>
  );
}
