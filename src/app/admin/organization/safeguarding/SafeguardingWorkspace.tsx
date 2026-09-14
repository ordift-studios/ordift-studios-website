"use client";

import { useActionState } from "react";
import { escalateSafeguardingConcernAction, resolveSafeguardingConcernAction, type ActionState } from "./actions";

export interface SafeguardingConcernView {
  id: string;
  reportedByName: string;
  concerningName: string | null;
  description: string;
  immediateSafetyActionTaken: string | null;
  mandatoryReportingObligationNotes: string | null;
  status: string;
  resolutionNotes: string | null;
  reportedAt: string;
}

function EscalateForm({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(escalateSafeguardingConcernAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <input name="escalationNotes" required placeholder="Escalation notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Saving…" : "Escalate"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function ResolveForm({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveSafeguardingConcernAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <input name="resolutionNotes" required placeholder="Resolution notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Resolve"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function ConcernRow({ concern }: { concern: SafeguardingConcernView }) {
  const canAct = concern.status === "reported" || concern.status === "escalated";
  return (
    <li className="rounded-lg border border-red-900/15 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">Reported by {concern.reportedByName}</p>
          {concern.concerningName && <p className="font-sans text-caption text-ordift-ink-muted">Concerning: {concern.concerningName}</p>}
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{concern.description}&rdquo;</p>
          {concern.immediateSafetyActionTaken && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Immediate safety action: {concern.immediateSafetyActionTaken}</p>}
          {concern.mandatoryReportingObligationNotes && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Mandatory reporting: {concern.mandatoryReportingObligationNotes}</p>}
          {concern.resolutionNotes && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Notes: {concern.resolutionNotes}</p>}
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">Reported {new Date(concern.reportedAt).toLocaleDateString()}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-sans text-caption whitespace-nowrap">{concern.status}</span>
      </div>
      {canAct && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {concern.status === "reported" && <EscalateForm reportId={concern.id} />}
          <ResolveForm reportId={concern.id} />
        </div>
      )}
    </li>
  );
}

export function SafeguardingWorkspace({ concerns }: { concerns: SafeguardingConcernView[] }) {
  return (
    <section className="space-y-3">
      {concerns.length > 0 ? (
        <ul className="space-y-3">
          {concerns.map((c) => (
            <ConcernRow key={c.id} concern={c} />
          ))}
        </ul>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">No safeguarding concerns on record.</p>
      )}
    </section>
  );
}
