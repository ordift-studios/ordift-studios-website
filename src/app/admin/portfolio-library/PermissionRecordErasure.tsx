"use client";

import { useActionState } from "react";
import { DESTINATION_LABEL, type Destination } from "@/lib/portfolio/destinations";
import { BASES, REASON_HELP } from "@/lib/portfolio/erasureRules";
import type { ErasureView } from "@/lib/portfolio/permissionRecordErasure";
import { eraseRecordAction, jobHoldAction, retentionPolicyAction, type ErasureFormState } from "./erasureActions";

// Retention and controlled erasure for this job's client-permission records (proposed 0183; rendered only while PERMISSION_RECORD_ERASURE_ENABLED). Nothing is automatic and nothing here touches the permission's scope, uses or history.
const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const btn = "rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption";
const Msg = ({ s }: { s: ErasureFormState }) => (s ? <p role={s.ok ? "status" : "alert"} className={`font-sans text-caption ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.message}</p> : null);
const Hidden = ({ jobType, jobId }: { jobType: string; jobId: string }) => (<><input type="hidden" name="jobType" value={jobType} /><input type="hidden" name="jobId" value={jobId} /></>);

export function PermissionRecordErasure({ jobType, jobId, view }: { jobType: string; jobId: string; view: ErasureView }) {
  const [ps, policy, pp] = useActionState(retentionPolicyAction, null as ErasureFormState);
  const [hs, hold, hp] = useActionState(jobHoldAction, null as ErasureFormState);
  return (
    <div className="space-y-4">
      <p className="font-sans text-body-small text-ordift-ink-muted">Retention policy: {view.policyYears ? <><strong>{view.policyYears} years</strong> after the permission and the last authorised use have ended (management policy, not a statutory period). {view.policyNote}</> : "none recorded yet, so erasure on the retention basis is refused."} Longer retention applies where a duty, limitation period, dispute or hold requires it; shorter where the law requires it.</p>
      {!view.policyYears && (
        <form action={policy} className="grid grid-cols-1 gap-2 sm:grid-cols-4"><Hidden jobType={jobType} jobId={jobId} />
          <input name="years" type="number" min={1} max={50} placeholder="Years" aria-label="Retention years" className={input} />
          <input name="note" placeholder="What was decided (10-500 characters)" aria-label="Policy note" className={`${input} sm:col-span-2`} /><button className={btn} disabled={pp}>Record policy</button><Msg s={ps} /></form>)}
      <form action={hold} className="flex flex-wrap items-center gap-1"><Hidden jobType={jobType} jobId={jobId} /><input type="hidden" name="action" value={view.hold ? "released" : "placed"} />
        <span className="font-sans text-caption">{view.hold ? <strong>Hold in place since {view.hold.at.slice(0, 10)}: {view.hold.reason}</strong> : "No hold on this job."}</span>
        <input name="note" placeholder={`Reason (${REASON_HELP})`} aria-label="Hold reason" className={input} /><button className={btn} disabled={hp}>{view.hold ? "Release hold" : "Place hold"}</button><Msg s={hs} /></form>
      <ul className="space-y-2">{view.rows.map((r) => <Row key={r.id} jobType={jobType} jobId={jobId} r={r} />)}{view.rows.length === 0 && <li className="font-sans text-caption text-ordift-ink-muted">No permission records for this job.</li>}</ul>
    </div>
  );
}

function Row({ jobType, jobId, r }: { jobType: string; jobId: string; r: ErasureView["rows"][number] }) {
  const [s, act, pending] = useActionState(eraseRecordAction, null as ErasureFormState);
  return (
    <li className="space-y-1 rounded-xl border border-black/10 bg-white p-2">
      <p className="font-sans text-caption"><strong>{r.decision}</strong> · {r.source.replace(/_/g, " ")} · recorded {r.recordedAt.slice(0, 10)} · {r.destinations.map((d) => DESTINATION_LABEL[d as Destination] ?? d).join(", ") || "no uses"}{r.erased ? " · personal details erased" : ""}{r.hasStoredFile ? " · references a stored evidence file: erasure is refused (cannot be verified)" : ""}</p>
      <p className="font-sans text-caption text-ordift-ink-muted">{r.endedOn ? `Ended ${r.endedOn}` : "Not ended"}{r.lastUseOn ? ` · last use ${r.lastUseOn}` : ""}{r.earliestRetentionDate ? ` · earliest erasure on the retention basis ${r.earliestRetentionDate}` : ""}</p>
      {r.blockersRetention.length > 0 && <p className="font-sans text-caption text-amber-900">On the retention basis, blocked: {r.blockersRetention.join("; ")}.</p>}
      {!r.erased && !r.hasStoredFile && (
        <form action={act} className="space-y-1"><Hidden jobType={jobType} jobId={jobId} /><input type="hidden" name="recordId" value={r.id} />
          <select name="basis" aria-label="Basis for erasure" className={input} defaultValue=""><option value="" disabled>Basis for erasure…</option>{BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
          <input name="note" placeholder={`Reason (${REASON_HELP})`} aria-label="Reason for erasure" className={input} />
          <label className="flex items-start gap-2 font-sans text-caption"><input type="checkbox" name="confirmPermitted" className="mt-0.5" />I confirm erasure is permitted: no dispute, legal obligation, audit or active permission still needs this evidence</label>
          <button className={btn} disabled={pending}>Erase details</button><Msg s={s} /></form>)}
    </li>
  );
}
