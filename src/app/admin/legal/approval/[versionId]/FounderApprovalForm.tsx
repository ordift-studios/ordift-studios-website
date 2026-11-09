"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { approvalSentenceFor, CONCLUSIONS, CONCLUSION_LABELS, NOT_COUNSEL_APPROVAL_STATEMENT, TEXT_RELATIONS, TEXT_RELATION_LABELS } from "@/lib/legal/founderApproval";
import { recordFounderApprovalAction } from "./approvalActions";

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const label = "font-sans text-caption text-ordift-ink-muted block mb-1";
const Row = ({ id, text, children }: { id: string; text: React.ReactNode; children: React.ReactNode }) => (<div><label htmlFor={id} className={label}>{text}</label>{children}</div>);
const ZONES = ["Asia/Qatar", "Africa/Accra", "Europe/London", "Asia/Dubai", "Europe/Paris", "America/New_York", "UTC"];

// The Founder's own approval, recorded AFTER the telephone consultation. Failed submissions keep everything typed (ActionForm restores values).
export default function FounderApprovalForm({ versionId, code, version, docxSha256 }: { versionId: string; code: string; version: string; docxSha256: string }) {
  return (
    <ActionForm action={recordFounderApprovalAction} className="space-y-5">
      <input type="hidden" name="versionId" value={versionId} />

      <fieldset className="space-y-3 rounded-lg border border-black/10 p-4">
        <legend className="font-sans text-caption font-semibold text-ordift-ink px-1">The telephone consultation (as you recorded it on your sheet)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Row id="fa-date" text="Date of the call"><input id="fa-date" name="consultationDate" type="date" required className={field} /></Row>
          <Row id="fa-start" text="Started (24-hour)"><input id="fa-start" name="startTime" type="time" required className={field} /></Row>
          <Row id="fa-end" text="Ended (24-hour)"><input id="fa-end" name="endTime" type="time" required className={field} /></Row>
          <Row id="fa-zone" text="Time zone of those times"><select id="fa-zone" name="timezone" defaultValue="Asia/Qatar" className={field}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></Row>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Row id="fa-counsel" text="Counsel's name, as given on the call"><input id="fa-counsel" name="counselName" required autoComplete="off" className={field} /></Row>
          <Row id="fa-firm" text="Counsel's firm or chambers (write “not stated” if none)"><input id="fa-firm" name="counselFirm" required autoComplete="off" className={field} /></Row>
        </div>
        <Row id="fa-ident" text="How you satisfied yourself that you were speaking with counsel"><textarea id="fa-ident" name="identityCheckNote" required rows={2} className={field} placeholder="For example: I called counsel back on a number I took from an independent source." /></Row>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-black/10 p-4">
        <legend className="font-sans text-caption font-semibold text-ordift-ink px-1">Counsel's advice (in counsel's words, not yours)</legend>
        <Row id="fa-rec" text="Counsel's recommendations"><textarea id="fa-rec" name="recommendations" required rows={4} className={field} /></Row>
        <Row id="fa-amend" text="Amendments counsel requested (write “None requested” if none) and where they are now in the text"><textarea id="fa-amend" name="amendments" required rows={3} className={field} /></Row>
        <Row id="fa-concl" text="Counsel's conclusion">
          <select id="fa-concl" name="conclusion" required defaultValue="" className={field}>
            <option value="" disabled>Choose…</option>
            {CONCLUSIONS.map((c) => <option key={c} value={c}>{CONCLUSION_LABELS[c]}</option>)}
          </select>
        </Row>
        <Row id="fa-conclnote" text="Counsel's conclusion in counsel's words"><textarea id="fa-conclnote" name="conclusionNote" required rows={2} className={field} /></Row>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="counselAskedToSeeFinalText" value="yes" className="mt-1" /> Counsel asked to see the final text before it is used</label>
        <Row id="fa-reconf" text="If counsel asked: when and how counsel saw or reconfirmed the final text"><textarea id="fa-reconf" name="reconfirmationNote" rows={2} className={field} /></Row>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-black/10 p-4">
        <legend className="font-sans text-caption font-semibold text-ordift-ink px-1">The text you are approving</legend>
        <p className="font-sans text-caption text-ordift-ink-muted">The registered master&apos;s SHA-256 is shown in the panel above. The system re-reads the stored file and re-hashes it when you press the button.</p>
        <Row id="fa-reviewed" text="SHA-256 of the exact draft counsel heard (the full 64 characters from section 1 of your sheet)"><input id="fa-reviewed" name="reviewedDraftSha256" required autoComplete="off" spellCheck={false} className={`${field} font-mono`} /></Row>
        <Row id="fa-rel" text="How the registered master relates to the text counsel heard">
          <select id="fa-rel" name="textRelation" required defaultValue="" className={field}>
            <option value="" disabled>Choose…</option>
            {TEXT_RELATIONS.map((t) => <option key={t} value={t}>{TEXT_RELATION_LABELS[t]}</option>)}
          </select>
        </Row>
        <Row id="fa-prefix" text={<>Compare the registered hash with your sheet, then type its first 12 characters: <span className="font-mono text-ordift-ink">{docxSha256.slice(0, 12)}</span></>}><input id="fa-prefix" name="typedHashPrefix" required autoComplete="off" spellCheck={false} className={`${field} font-mono`} /></Row>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-black/10 p-4">
        <legend className="font-sans text-caption font-semibold text-ordift-ink px-1">Your confirmation</legend>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="statementAccepted" value="yes" className="mt-1" /> <span>{NOT_COUNSEL_APPROVAL_STATEMENT} I record it as my own approval.</span></label>
        <Row id="fa-sentence" text={<>To approve, type exactly: <span className="font-semibold text-ordift-ink">{approvalSentenceFor(code, version)}</span></>}><input id="fa-sentence" name="typedSentence" required autoComplete="off" className={field} /></Row>
        <SubmitButton pendingLabel="Recording…" className="min-h-11 px-5 rounded-full bg-ordift-ink text-white font-sans text-body-small">Record my Founder approval</SubmitButton>
        <p className="font-sans text-caption text-ordift-ink-muted">This sets the approval once and records the details above. It does not activate, publish or issue the agreement.</p>
      </fieldset>
    </ActionForm>
  );
}
