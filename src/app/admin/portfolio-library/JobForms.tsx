"use client";

/* eslint-disable @next/next/no-img-element -- short-lived signed URLs to private files */
import { useActionState, useEffect, useState } from "react";
import { previewUrlsAction } from "@/app/admin/crew-support/releaseActions";
import { DESTINATIONS } from "@/lib/portfolio/destinations";
import { GRANTOR_CAPACITIES, PERMISSION_METHODS, REVIEW_CHECKS } from "@/lib/portfolio/permissionModel";
import { recogniseContractAction, recordPermissionAction, recordUseAction, requestPermissionAction, reviewPhotoAction, verifyPermissionAction, type FormState } from "./actions";

const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const btn = "rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-60";
const label = "block font-sans text-caption text-ordift-ink-muted mb-1";

function Hidden({ jobType, jobId }: { jobType: string; jobId: string }) { return <><input type="hidden" name="jobType" value={jobType} /><input type="hidden" name="jobId" value={jobId} /></>; }
function Result({ s }: { s: FormState }) { return s ? <p role={s.ok ? "status" : "alert"} className={`font-sans text-caption ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.message}</p> : null; }
function Uses({ name = "destinations", only }: { name?: string; only?: string[] }) {
  return (
    <fieldset className="space-y-1"><legend className={label}>Uses authorised (nothing is ticked for you)</legend>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">{DESTINATIONS.filter((d) => !only || only.includes(d.key)).map((d) => <label key={d.key} className="flex items-center gap-2 font-sans text-caption"><input type="checkbox" name={name} value={d.key} />{d.label}</label>)}</div>
    </fieldset>
  );
}

// Guided historical-permission recording (Route C). Records only what the person can show; the date is optional and is never filled in for them.
export function RecordPermissionForm({ jobType, jobId, files }: { jobType: string; jobId: string; files: { id: string; name: string }[] }) {
  const [s, act, pending] = useActionState(recordPermissionAction, null as FormState);
  const [scope, setScope] = useState<"job" | "files">("job");
  const [decision, setDecision] = useState("granted");
  return (
    <form action={act} className="space-y-3">
      <Hidden jobType={jobType} jobId={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor="decision">What happened</label><select id="decision" name="decision" className={input} value={decision} onChange={(e) => setDecision(e.target.value)}><option value="granted">Permission was given</option><option value="declined">Permission was refused</option><option value="withdrawn">Permission was withdrawn</option></select></div>
        <div><label className={label} htmlFor="grantorName">Who gave it (full name)</label><input id="grantorName" name="grantorName" className={input} required /></div>
        <div><label className={label} htmlFor="grantorCapacity">In what capacity</label><select id="grantorCapacity" name="grantorCapacity" className={input} defaultValue=""><option value="" disabled>Choose…</option>{GRANTOR_CAPACITIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div><label className={label} htmlFor="method">How it was given</label><select id="method" name="method" className={input} defaultValue=""><option value="" disabled>Choose…</option>{PERMISSION_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
        <div><label className={label} htmlFor="grantedOn">Date it was given (leave blank if not established)</label><input id="grantedOn" name="grantedOn" type="date" className={input} /></div>
        <div><label className={label} htmlFor="expiresOn">Permission ends on (optional)</label><input id="expiresOn" name="expiresOn" type="date" className={input} /></div>
      </div>
      {decision === "granted" ? (
        <>
          <Uses />
          <fieldset className="space-y-1"><legend className={label}>Photographs covered</legend>
            <label className="flex items-center gap-2 font-sans text-caption"><input type="radio" name="scope" value="job" checked={scope === "job"} onChange={() => setScope("job")} />Every photograph of this job</label>
            <label className="flex items-center gap-2 font-sans text-caption"><input type="radio" name="scope" value="files" checked={scope === "files"} onChange={() => setScope("files")} />Only the photographs I choose</label>
            {scope === "files" && <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">{files.map((f) => <label key={f.id} className="flex items-center gap-2 font-sans text-caption"><input type="checkbox" name="fileIds" value={f.id} /><span className="truncate">{f.name}</span></label>)}</div>}
          </fieldset>
          <div><label className={label} htmlFor="restrictions">Restrictions the grantor set (leave blank if none were stated)</label><input id="restrictions" name="restrictions" className={input} /></div>
        </>
      ) : <div><label className={label} htmlFor="note">Why / what was said</label><input id="note" name="note" className={input} /></div>}
      <div><label className={label} htmlFor="evidenceSummary">Supporting evidence: what it is and where it is kept (message, document, recording…)</label><textarea id="evidenceSummary" name="evidenceSummary" rows={3} className={input} required /></div>
      <fieldset className="space-y-1"><legend className={label}>Is that evidence enough to rely on?</legend>
        <label className="flex items-center gap-2 font-sans text-caption"><input type="radio" name="evidenceSufficient" value="yes" />Yes, I have checked it and it covers these uses</label>
        <label className="flex items-center gap-2 font-sans text-caption"><input type="radio" name="evidenceSufficient" value="no" defaultChecked />Not yet: keep it as &ldquo;verification still required&rdquo;</label>
      </fieldset>
      <button className={btn} disabled={pending}>{pending ? "Saving…" : "Record this permission"}</button><Result s={s} />
    </form>
  );
}

export function ContractForm({ jobType, jobId, agreements }: { jobType: string; jobId: string; agreements: { id: string; reference: string; executed: boolean; summary: string }[] }) {
  const [s, act, pending] = useActionState(recogniseContractAction, null as FormState);
  if (agreements.length === 0) return <p className="font-sans text-body-small text-ordift-ink-muted">No agreement names this job as its context, so there is nothing to recognise. Signing a contract does not by itself give marketing permission.</p>;
  return (
    <form action={act} className="space-y-3">
      <Hidden jobType={jobType} jobId={jobId} />
      <div><label className={label} htmlFor="agreementId">Agreement</label><select id="agreementId" name="agreementId" className={input} defaultValue=""><option value="" disabled>Choose…</option>{agreements.map((a) => <option key={a.id} value={a.id}>{a.reference} — {a.executed ? "fully executed" : "not executed"} — {a.summary}</option>)}</select></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className={label} htmlFor="clause">Clause giving the permission</label><input id="clause" name="clause" className={input} /></div><div><label className={label} htmlFor="grantorName2">Grantor name (as in the agreement)</label><input id="grantorName2" name="grantorName" className={input} /></div></div>
      <Uses /><button className={btn} disabled={pending}>{pending ? "Checking…" : "Recognise from this agreement"}</button><Result s={s} />
      <p className="font-sans text-caption text-ordift-ink-muted">The database accepts this only if the agreement is fully executed, is linked to this job, and its recorded release grants every use ticked.</p>
    </form>
  );
}

export function VerifyForm({ jobType, jobId, recordId }: { jobType: string; jobId: string; recordId: string }) {
  const [s, act, pending] = useActionState(verifyPermissionAction, null as FormState);
  return <form action={act} className="flex flex-wrap items-center gap-2"><Hidden jobType={jobType} jobId={jobId} /><input type="hidden" name="recordId" value={recordId} /><input name="note" placeholder="What did you check?" aria-label="What did you check" className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" /><button className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption" disabled={pending}>Mark verified</button><Result s={s} /></form>;
}

export function RequestForm({ jobType, jobId, addressee, approved }: { jobType: string; jobId: string; addressee: { id: string; name: string } | null; approved: boolean }) {
  const [s, act, pending] = useActionState(requestPermissionAction, null as FormState);
  if (!addressee) return <p className="font-sans text-body-small text-ordift-ink-muted">No client portal account is linked to this job, so a portal request cannot be sent. Use the historical-permission form instead.</p>;
  if (!approved) return <p className="rounded-lg bg-black/5 p-3 font-sans text-body-small text-ordift-ink-muted">The client permission wording is still a draft awaiting your approval, so requests are switched off.</p>;
  return <form action={act} className="space-y-3"><Hidden jobType={jobType} jobId={jobId} /><input type="hidden" name="addressedTo" value={addressee.id} /><p className="font-sans text-body-small">Ask <strong>{addressee.name}</strong> in their client portal. Nothing is emailed; they see it when they next sign in.</p><Uses /><button className={btn} disabled={pending}>Create the request</button><Result s={s} /></form>;
}

export type ReviewPhoto = { id: string; name: string; kind: string; permission: string; internal: string; usable: string[] };
export function PhotoReview({ jobType, jobId, photos }: { jobType: string; jobId: string; photos: ReviewPhoto[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { let alive = true; previewUrlsAction(photos.slice(0, 48).map((p) => p.id)).then((r) => { if (!alive || !r.ok) return; const n: Record<string, string> = {}; for (const [id, v] of Object.entries(r.urls)) if ("url" in v) n[id] = v.url; setUrls(n); }).catch(() => {}); return () => { alive = false; }; }, [photos]);
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((p) => <li key={p.id} className="rounded-xl border border-black/10 bg-white p-2"><PhotoCard jobType={jobType} jobId={jobId} p={p} url={urls[p.id]} /></li>)}
    </ul>
  );
}
function PhotoCard({ jobType, jobId, p, url }: { jobType: string; jobId: string; p: ReviewPhoto; url?: string }) {
  const [s, act, pending] = useActionState(reviewPhotoAction, null as FormState);
  const [decision, setDecision] = useState("approved");
  return (
    <div className="space-y-1">
      {url ? <img src={url} alt={p.name} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <div className="aspect-[4/3] w-full rounded-lg bg-black/5" />}
      <p className="truncate font-sans text-caption font-medium" title={p.name}>{p.name} · {p.kind}</p>
      <p className="font-sans text-caption text-ordift-ink-muted">{p.permission}<br />{p.internal}</p>
      {p.usable.length > 0 && <p className="font-sans text-caption text-green-800">Usable for: {p.usable.join(", ")}</p>}
      <details><summary className="cursor-pointer font-sans text-caption underline">Internal review</summary>
        <form action={act} className="mt-2 space-y-2"><Hidden jobType={jobType} jobId={jobId} /><input type="hidden" name="fileId" value={p.id} />
          <select name="decision" aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)} className={input}><option value="approved">Approve</option><option value="rejected">Reject</option><option value="returned">Return for further review</option><option value="revoked">Revoke earlier approval</option></select>
          {decision === "approved" && (<><Uses /><fieldset className="space-y-1"><legend className={label}>Confirm each check</legend>{REVIEW_CHECKS.map((c) => <label key={c.key} className="flex items-start gap-2 font-sans text-caption"><input type="checkbox" name={`check_${c.key}`} className="mt-0.5" />{c.label}</label>)}</fieldset></>)}
          <input name="notes" placeholder="Review notes" aria-label="Review notes" className={input} />
          <button className={btn} disabled={pending}>Record decision</button><Result s={s} />
        </form>
      </details>
    </div>
  );
}

export function UseForm({ jobType, jobId, files }: { jobType: string; jobId: string; files: { id: string; name: string }[] }) {
  const [s, act, pending] = useActionState(recordUseAction, null as FormState);
  return (
    <form action={act} className="grid grid-cols-1 gap-2 sm:grid-cols-5"><Hidden jobType={jobType} jobId={jobId} />
      <select name="fileId" aria-label="Photograph" className={input} defaultValue=""><option value="" disabled>Photograph…</option>{files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <select name="destination" aria-label="Use" className={input} defaultValue=""><option value="" disabled>Use…</option>{DESTINATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
      <select name="action" aria-label="Action" className={input}><option value="published">Published</option><option value="shared">Shared</option><option value="ended">Ended</option></select>
      <input name="reference" placeholder="Where (page, brochure, share name)" aria-label="Where" className={input} />
      <button className={btn} disabled={pending}>Record</button><div className="sm:col-span-5"><Result s={s} /></div>
    </form>
  );
}
