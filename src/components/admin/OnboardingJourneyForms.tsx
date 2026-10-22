"use client";

import { useActionState } from "react";
import { SCHEDULE_A_FIELDS, INDEPENDENT_STATUS_ROUTES, PROFESSIONAL_ROLES, REGULATORY_APPROVAL_STATUSES, type ScheduleATerms } from "@/lib/legal/instructorAgreementTerms";
import type { JourneyActionState } from "@/app/admin/organization/onboarding/[onboardingId]/journeyActions";
import {
  activateTemplateAction, addSignatoryAction, uploadEvidenceAction, approveForIssueAction, attestApprovalAction, confirmEntityAction, issueAgreementAction, prepareAgreementAction, registerMasterAction, saveScheduleAAction, selectSignatoryAction,
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
      <p className="font-sans text-caption text-ordift-ink-muted">Record the real date counsel approved {documentCode}. This is an administrator attestation: the system records your claim and the evidence fingerprint but cannot inspect counsel&apos;s document itself, so only attest what the document shows. Your identity and today&apos;s date ({today}) are recorded automatically as the verification, separately from the approval date. Nothing here activates or issues anything.</p>
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
        <div><label className={label} htmlFor="evidenceSha256">Evidence file fingerprint (SHA-256, required — run “shasum -a 256 &lt;file&gt;” on the letter, email or register)</label><input id="evidenceSha256" name="evidenceSha256" required pattern="[0-9a-fA-F]{64}" className={input} /></div>
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

const UPLOAD_TYPES = [{ value: "commercial_registration", label: "Business / commercial registration certificate" }, { value: "articles_of_association", label: "Articles / constitutional document" }, { value: "other", label: "Other official document (for example a letter or resolution authorising the signatory)" }];

export function UploadEvidenceForm({ onboardingId, entity, legacyRecords }: { onboardingId: string; entity: { id: string; name: string }; legacyRecords: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(uploadEvidenceAction, null);
  return (
    <Box title={`Upload evidence to ${entity.name}'s document vault`}>
      <p className="font-sans text-caption text-ordift-ink-muted">Stored in the entity&apos;s existing vault with a SHA-256 fingerprint; nothing already there is overwritten or deleted. Upload the document that shows who may sign for this entity. If a registration certificate does not itself state signing authority, also upload the document that does (for example an authorising letter or resolution). Files are limited by the vault (PDF, JPEG or PNG, up to 10 MB).</p>
      <form action={action} className="space-y-3" encType="multipart/form-data">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="entityId" value={entity.id} />
        <div><label className={label} htmlFor="ev-type">What is this document?</label><select id="ev-type" name="documentType" required className={input} defaultValue=""><option value="" disabled>Choose…</option>{UPLOAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div><label className={label} htmlFor="ev-file">File</label><input id="ev-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className={input} /></div>
        <div><label className={label} htmlFor="ev-notes">What it is and what it shows (required)</label><textarea id="ev-notes" name="notes" required rows={2} className={input} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="ev-issued">Issued on (optional)</label><input id="ev-issued" name="issuedOn" type="date" className={input} /></div>
          <div><label className={label} htmlFor="ev-auth">Issuing authority (optional)</label><input id="ev-auth" name="issuingAuthority" className={input} /></div>
        </div>
        {legacyRecords.length > 0 && (
          <div><label className={label} htmlFor="ev-replaces">This file replaces an older record that has no verifiable file (the older record is kept)</label>
            <select id="ev-replaces" name="replaces" className={input} defaultValue=""><option value="">No — this is a new document</option>{legacyRecords.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
        )}
        <button className={button} disabled={pending}>{pending ? "Uploading…" : "Upload to the vault"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function AddSignatoryForm({ onboardingId, entity, documents, founder }: { onboardingId: string; entity: { id: string; name: string }; documents: { id: string; label: string }[]; founder: { profileId: string; name: string; memberNumber: string | null } | null }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(addSignatoryAction, null);
  return (
    <Box title={`Record an authorised signatory for ${entity.name}`}>
      <p className="font-sans text-caption text-ordift-ink-muted">Recorded for THIS entity only: authority recorded for one entity or jurisdiction is never applied to another. The Founder&apos;s name and account are suggested below because you named the Founder as intended signatory, but ownership or the Founder role does not by itself establish signing authority. The position and authority must be copied from the document you select.</p>
      {documents.length === 0 && <p className="font-sans text-caption text-amber-900">No document with a stored, fingerprinted file exists for this entity yet. Upload it above first.</p>}
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="entityId" value={entity.id} />
        <div><label className={label} htmlFor="sigDoc">Supporting document (must have a stored file)</label>
          <select id="sigDoc" name="sourceDocumentId" required className={input} defaultValue=""><option value="" disabled>Choose…</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        <div><label className={label} htmlFor="fullName">Full name (as the document states it)</label><input id="fullName" name="fullName" required className={input} defaultValue={founder?.name ?? ""} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="position">Position (as stated)</label><input id="position" name="position" required className={input} /></div>
          <div><label className={label} htmlFor="authority">Authority basis (as stated)</label><input id="authority" name="authority" required className={input} /></div>
        </div>
        <div><label className={label} htmlFor="accountMemberNumber">Existing Ordift account to receive the secure signing link (member number)</label><input id="accountMemberNumber" name="accountMemberNumber" className={input} defaultValue={founder?.memberNumber ?? ""} /></div>
        <div><label className={label} htmlFor="effectiveFrom">Effective from (optional)</label><input id="effectiveFrom" name="effectiveFrom" type="date" className={input} /></div>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="documentShowsAuthority" value="yes" className="mt-1" /> The selected document itself shows this person&apos;s name, position and authority to sign for {entity.name}.</label>
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

const CHOICES: Partial<Record<keyof ScheduleATerms, readonly string[]>> = { professionalRole: PROFESSIONAL_ROLES, independentStatusRoute: INDEPENDENT_STATUS_ROUTES, regulatoryApprovalStatus: REGULATORY_APPROVAL_STATUSES };

export function ScheduleAForm({ onboardingId, agreementId, terms, today }: { onboardingId: string; agreementId: string; terms: Partial<ScheduleATerms>; today: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(saveScheduleAAction, null);
  return (
    <Box title="Agreement terms (Schedule A) — stated by you, not guessed">
      <p className="font-sans text-caption text-ordift-ink-muted">The instructor&apos;s name, email, the Ghana jurisdiction, the contracting entity and the signatory are filled in from verified records. The terms below have no verified source, so they must be stated here. Session fees, dates and topics are not part of this agreement: each workshop gets its own Session Schedule.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="agreementId" value={agreementId} />
        {SCHEDULE_A_FIELDS.map((fld) => (
          <div key={fld.key}>
            <label className={label} htmlFor={`sa-${fld.key}`}>{fld.label}{fld.required ? " (required)" : " (optional)"} — {fld.hint}</label>
            {CHOICES[fld.key] ? (
              <select id={`sa-${fld.key}`} name={fld.key} className={input} defaultValue={terms[fld.key] ?? ""}><option value="">Choose…</option>{CHOICES[fld.key]!.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            ) : fld.key === "agreementEffectiveDate" ? (
              <input id={`sa-${fld.key}`} name={fld.key} type="date" min={today} className={input} defaultValue={terms[fld.key] ?? ""} />
            ) : (
              <input id={`sa-${fld.key}`} name={fld.key} className={input} defaultValue={terms[fld.key] ?? ""} />
            )}
          </div>
        ))}
        <button className={button} disabled={pending}>{pending ? "Saving…" : "Save terms"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function ApproveForIssueForm({ onboardingId, agreementId, previewSha256 }: { onboardingId: string; agreementId: string; previewSha256: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(approveForIssueAction, null);
  return (
    <Box title="Approve this exact document for issue">
      <p className="font-sans text-caption text-ordift-ink-muted">Re-checks every legal prerequisite now. Nothing is sent. Preview fingerprint: <span className="font-mono">{previewSha256.slice(0, 16)}…</span></p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="agreementId" value={agreementId} />
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="confirmPreview" value="yes" className="mt-1" /> I have reviewed the full preview above.</label>
        <button className={button} disabled={pending}>{pending ? "Approving…" : "Approve for issue"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}

export function IssueAgreementForm({ onboardingId, agreementId }: { onboardingId: string; agreementId: string }) {
  const [state, action, pending] = useActionState<JourneyActionState, FormData>(issueAgreementAction, null);
  return (
    <Box title="Issue for signature">
      <p className="font-sans text-caption text-ordift-ink-muted">Stores the immutable document with its SHA-256, then emails each signatory a secure, expiring link to review and sign. The agreement counts as executed only when both have signed.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="onboardingId" value={onboardingId} /><input type="hidden" name="agreementId" value={agreementId} />
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="confirmIssue" value="yes" className="mt-1" /> I confirm secure signing links should be emailed now.</label>
        <button className={button} disabled={pending}>{pending ? "Issuing…" : "Issue for signature"}</button>
        <Result state={state} />
      </form>
    </Box>
  );
}
