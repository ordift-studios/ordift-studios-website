"use client";

import { useActionState } from "react";
import { DESTINATIONS, DESTINATION_LABEL, type Destination } from "@/lib/portfolio/destinations";
import { BASES } from "@/lib/portfolio/erasureRules";
import { DECLARATIONS, EVIDENCE_KINDS, GRANTORS, ORIGINS, SUBJECT_KINDS } from "@/lib/portfolio/subjectRules";
import type { PhotoPeopleView, SubjectGrantView } from "@/lib/portfolio/subjects";
import { addSubjectAction, declarePeopleAction, recordSubjectPermissionAction, fileHoldAction, redactSubjectPermissionAction, setOriginAction, verifySubjectPermissionAction, withdrawSubjectPermissionAction, type SubjectFormState } from "./subjectActions";

// Permission evidence for the people and property shown in ONE photograph (proposed 0182; rendered only while SUBJECT_PERMISSIONS_ENABLED). A tick is never evidence: a grant is recorded, then verified in a separate dated step that names the evidence examined.
const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const label = "block font-sans text-caption text-ordift-ink-muted mb-1";
const btn = "rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption";
const STATUS: Record<SubjectGrantView["status"], string> = { recorded_unverified: "Recorded, NOT verified (counts for nothing)", verified: "Verified", withdrawn: "Withdrawn", replaced: "Replaced by a later grant", expired: "Expired" };
const Msg = ({ s }: { s: SubjectFormState }) => (s ? <p role={s.ok ? "status" : "alert"} className={`font-sans text-caption ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.message}</p> : null);
const Hidden = ({ jobType, jobId, fileId }: { jobType: string; jobId: string; fileId: string }) => (<><input type="hidden" name="jobType" value={jobType} /><input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="fileId" value={fileId} /></>);

export function SubjectEvidence({ jobType, jobId, fileId, view }: { jobType: string; jobId: string; fileId: string; view: PhotoPeopleView }) {
  const [ds, declare, dp] = useActionState(declarePeopleAction, null as SubjectFormState);
  const [as, add, ap] = useActionState(addSubjectAction, null as SubjectFormState);
  return (
    <div className="mt-2 space-y-3 rounded-lg bg-black/[0.03] p-2">
      <p className="font-sans text-caption font-medium">People and property shown</p>
      <OriginRow jobType={jobType} jobId={jobId} fileId={fileId} origin={view.origin} />
      <HoldRow jobType={jobType} jobId={jobId} fileId={fileId} hold={view.hold} />
      <p className="font-sans text-caption text-ordift-ink-muted">{view.declaration ? <>Declared: {DECLARATIONS.find((d) => d.key === view.declaration!.value)?.label}. Basis: {view.declaration.note}</> : "Nothing declared yet: the photograph cannot be cleared for any use."}</p>
      <form action={declare} className="space-y-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} />
        <select name="declaration" aria-label="What the photograph shows" className={input} defaultValue=""><option value="" disabled>What does it show?</option>{DECLARATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        <textarea name="note" rows={2} placeholder="Basis of your assessment: who is identifiable, how, and which permissions apply. Crowds and background people are never assumed either way." aria-label="Basis of assessment" className={input} />
        <button className={btn} disabled={dp}>Record declaration</button><Msg s={ds} /></form>
      {view.subjects.map((s) => (
        <div key={s.id} className="space-y-2 rounded-lg border border-black/10 bg-white p-2">
          <p className="font-sans text-caption font-medium">{SUBJECT_KINDS.find((k) => k.key === s.kind)?.label}: {s.label}</p>
          {s.grants.length === 0 && <p className="font-sans text-caption text-amber-900">No permission recorded: the photograph stays blocked.</p>}
          {s.grants.map((g) => <GrantRow key={g.id} jobType={jobType} jobId={jobId} fileId={fileId} subjectId={s.id} g={g} />)}
          <RecordGrant jobType={jobType} jobId={jobId} fileId={fileId} subjectId={s.id} kind={s.kind} />
        </div>
      ))}
      <form action={add} className="grid grid-cols-1 gap-1 sm:grid-cols-3"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} />
        <select name="kind" aria-label="Kind" className={input} defaultValue=""><option value="" disabled>Who or what?</option>{SUBJECT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
        <input name="label" placeholder="Where in the frame (not a full name)" aria-label="Where in the frame" className={input} />
        <button className={btn} disabled={ap}>Add to the list</button><Msg s={as} /></form>
    </div>
  );
}

function GrantRow({ jobType, jobId, fileId, subjectId, g }: { jobType: string; jobId: string; fileId: string; subjectId: string; g: SubjectGrantView }) {
  const [vs, verify, vp] = useActionState(verifySubjectPermissionAction, null as SubjectFormState);
  const [ws, withdraw, wp] = useActionState(withdrawSubjectPermissionAction, null as SubjectFormState);
  const [rs, redact, rp] = useActionState(redactSubjectPermissionAction, null as SubjectFormState);
  return (
    <div className="space-y-1 border-t border-black/5 pt-1">
      <p className="font-sans text-caption"><strong>{STATUS[g.status]}</strong> · {g.erased ? "details erased under the retention policy" : <>{GRANTORS.adult.concat(GRANTORS.child, GRANTORS.property).find((x) => x.key === g.grantorKind)?.label ?? g.grantorKind}: {g.grantorName}{g.grantorRelationship ? ` (${g.grantorRelationship})` : ""}</>} · given {g.givenOn ?? "date not recorded"} · {g.destinations.map((d) => DESTINATION_LABEL[d as Destination] ?? d).join(", ")}{g.expiresOn ? ` · until ${g.expiresOn}` : " · no expiry"}{g.restrictions ? ` · limits: ${g.restrictions}` : ""}</p>
      <p className="font-sans text-caption text-ordift-ink-muted">Evidence kept: {g.evidenceReference}{g.verifiedOn ? ` · verified ${g.verifiedOn.slice(0, 10)}` : ""}</p>
      {g.status === "recorded_unverified" && (
        <form action={verify} className="space-y-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} /><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="grantId" value={g.id} />
          <input name="evidenceExamined" placeholder="The evidence you actually examined, and where it is kept" aria-label="Evidence examined" className={input} />
          <input name="note" placeholder="What you checked and how" aria-label="What you checked" className={input} />
          <button className={btn} disabled={vp}>Verify (dated, attributed to you)</button><Msg s={vs} /></form>)}
      {(g.status === "verified" || g.status === "recorded_unverified") && (
        <form action={withdraw} className="flex gap-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} /><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="grantId" value={g.id} />
          <input name="note" placeholder="Why it is withdrawn (stops use at once)" aria-label="Reason for withdrawal" className={input} /><button className={btn} disabled={wp}>Withdraw</button><Msg s={ws} /></form>)}
      {(g.status === "withdrawn" || g.status === "replaced" || g.status === "expired") && !g.erased && (
        <form action={redact} className="flex gap-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} /><input type="hidden" name="grantId" value={g.id} />
          <select name="basis" defaultValue="" aria-label="Basis for erasure" className={input}><option value="" disabled>Basis for erasure</option>{BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
          <input name="note" placeholder="Reason (10-200 characters, no names)" aria-label="Reason for erasure" className={input} />
          <label className="flex items-start gap-2 font-sans text-caption"><input type="checkbox" name="confirmPermitted" className="mt-0.5" />I confirm erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence</label>
          <button className={btn} disabled={rp}>Erase details</button><Msg s={rs} /></form>)}
    </div>
  );
}

function RecordGrant({ jobType, jobId, fileId, subjectId, kind }: { jobType: string; jobId: string; fileId: string; subjectId: string; kind: "adult" | "child" | "property" }) {
  const [s, act, pending] = useActionState(recordSubjectPermissionAction, null as SubjectFormState);
  return (
    <details><summary className="cursor-pointer font-sans text-caption underline">Record a permission (or a replacement)</summary>
      <form action={act} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} /><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="subjectKind" value={kind} />
        <div><label className={label}>Given by</label><select name="grantorKind" className={input} defaultValue=""><option value="" disabled>Choose…</option>{GRANTORS[kind].map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></div>
        <div><label className={label}>Name of the person who gave it</label><input name="grantorName" className={input} /></div>
        <div><label className={label}>Relationship or capacity (required for a guardian or representative)</label><input name="grantorRelationship" className={input} /></div>
        <div><label className={label}>Where a representative&apos;s authority is documented</label><input name="authorityReference" className={input} /></div>
        <div><label className={label}>Date it was given</label><input name="givenOn" type="date" className={input} /></div>
        <div><label className={label}>Kind of evidence</label><select name="evidenceKind" className={input} defaultValue=""><option value="" disabled>Choose…</option>{EVIDENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></div>
        <div className="sm:col-span-2"><label className={label}>Where the evidence is kept (a reference, not a copy; no identity documents)</label><input name="evidenceReference" className={input} /></div>
        <div><label className={label}>Agreement id (release agreement only)</label><input name="agreementId" className={input} /></div>
        <div><label className={label}>Replaces grant id (optional)</label><input name="replacesGrantId" className={input} /></div>
        <fieldset className="sm:col-span-2"><legend className={label}>Uses covered (none is ticked for you)</legend><div className="grid grid-cols-2 gap-1 sm:grid-cols-4">{DESTINATIONS.map((d) => <label key={d.key} className="flex items-center gap-2 font-sans text-caption"><input type="checkbox" name="destinations" value={d.key} />{d.label}</label>)}</div></fieldset>
        <div><label className={label}>Limits they set</label><input name="restrictions" className={input} /></div>
        <div><label className={label}>Expiry (leave blank only if genuinely ongoing)</label><input name="expiresOn" type="date" className={input} /></div>
        <div className="sm:col-span-2"><button className={btn} disabled={pending}>Record (not yet verified)</button><Msg s={s} /></div>
      </form>
    </details>
  );
}

function HoldRow({ jobType, jobId, fileId, hold }: { jobType: string; jobId: string; fileId: string; hold: { reason: string; at: string } | null }) {
  const [s, act, pending] = useActionState(fileHoldAction, null as SubjectFormState);
  return (
    <form action={act} className="flex flex-wrap items-center gap-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} /><input type="hidden" name="action" value={hold ? "released" : "placed"} />
      <span className="font-sans text-caption">{hold ? <strong>Hold in place since {hold.at.slice(0, 10)}: {hold.reason}</strong> : "No hold on this photograph."}</span>
      <input name="note" placeholder={hold ? "Why the hold is released (no names)" : "Kind of dispute, complaint, audit or obligation (no names, 10-200 characters)"} aria-label="Hold reason" className={input} /><button className={btn} disabled={pending}>{hold ? "Release hold" : "Place hold"}</button><Msg s={s} /></form>
  );
}

function OriginRow({ jobType, jobId, fileId, origin }: { jobType: string; jobId: string; fileId: string; origin: string | null }) {
  const [s, act, pending] = useActionState(setOriginAction, null as SubjectFormState);
  return (
    <form action={act} className="flex flex-wrap items-center gap-1"><Hidden jobType={jobType} jobId={jobId} fileId={fileId} />
      <span className="font-sans text-caption">Origin: <strong>{ORIGINS.find((o) => o.key === origin)?.label ?? "not recorded (treated as Qatar if a child is shown)"}</strong></span>
      <select name="origin" aria-label="Where the photograph originates" className={input} defaultValue=""><option value="" disabled>Set origin…</option>{ORIGINS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select><button className={btn} disabled={pending}>Record origin</button><Msg s={s} /></form>
  );
}
