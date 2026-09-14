"use client";

import { useActionState } from "react";
import { acknowledgeGrievanceAction, resolveGrievanceAction, resolveSpeakUpReportAction, type ActionState } from "./actions";

export interface GrievanceView {
  id: string;
  raisedByName: string;
  againstName: string | null;
  grievanceType: "informal" | "formal";
  description: string;
  bypassedManager: boolean;
  status: string;
  submittedAt: string;
  acknowledgementDueAt: string;
}

export interface SpeakUpReportView {
  id: string;
  reportedByName: string | null;
  description: string;
  status: string;
  submittedAt: string;
}

function AcknowledgeForm({ grievanceId }: { grievanceId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acknowledgeGrievanceAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="grievanceId" value={grievanceId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Acknowledge"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}

function ResolveGrievanceForm({ grievanceId }: { grievanceId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveGrievanceAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="grievanceId" value={grievanceId} />
      <select name="status" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Outcome…</option>
        <option value="resolved">Resolved</option>
        <option value="escalated">Escalated</option>
      </select>
      <input name="resolutionNotes" required placeholder="Resolution notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Saving…" : "Resolve"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function GrievanceRow({ grievance }: { grievance: GrievanceView }) {
  const canAct = ["submitted", "acknowledged", "under_review"].includes(grievance.status);
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">
            {grievance.raisedByName} <span className="text-ordift-ink-muted font-normal">({grievance.grievanceType})</span>
          </p>
          {grievance.againstName && <p className="font-sans text-caption text-ordift-ink-muted">Against: {grievance.againstName}</p>}
          {grievance.bypassedManager && <p className="font-sans text-caption text-ordift-gold-pressed">Manager bypassed</p>}
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{grievance.description}&rdquo;</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            Submitted {new Date(grievance.submittedAt).toLocaleDateString()} · Acknowledgement due {new Date(grievance.acknowledgementDueAt).toLocaleDateString()}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans text-caption whitespace-nowrap">{grievance.status.replace(/_/g, " ")}</span>
      </div>
      {canAct && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {grievance.status === "submitted" && <AcknowledgeForm grievanceId={grievance.id} />}
          <ResolveGrievanceForm grievanceId={grievance.id} />
        </div>
      )}
    </li>
  );
}

function ResolveSpeakUpForm({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveSpeakUpReportAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <input name="resolutionNotes" required placeholder="Resolution notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Resolve"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function SpeakUpRow({ report }: { report: SpeakUpReportView }) {
  const canAct = report.status === "submitted" || report.status === "under_review";
  return (
    <li className="rounded-lg border border-red-900/15 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{report.reportedByName ?? "Anonymous"}</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{report.description}&rdquo;</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">Submitted {new Date(report.submittedAt).toLocaleDateString()}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-sans text-caption whitespace-nowrap">{report.status.replace(/_/g, " ")}</span>
      </div>
      {canAct && (
        <div className="pt-1">
          <ResolveSpeakUpForm reportId={report.id} />
        </div>
      )}
    </li>
  );
}

export function EmployeeRelationsWorkspace({
  grievances,
  speakUpReports,
  canSeeSpeakUp,
}: {
  grievances: GrievanceView[];
  speakUpReports: SpeakUpReportView[] | null;
  canSeeSpeakUp: boolean;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Grievances</h2>
        {grievances.length > 0 ? (
          <ul className="space-y-3">
            {grievances.map((g) => (
              <GrievanceRow key={g.id} grievance={g} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No grievances on record.</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-red-900/20 bg-red-50/30 p-6">
        <div>
          <h2 className="font-serif font-medium text-body text-ordift-ink">Speak-Up (Confidential Channel)</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            A dedicated whistleblowing channel, deliberately separate from grievances. Reports may be anonymous. Super-Admin-only, and non-retaliation applies to every report handled here.
          </p>
        </div>
        {!canSeeSpeakUp || speakUpReports === null ? (
          <p className="font-sans text-caption text-ordift-ink-muted">Restricted to Super Admin.</p>
        ) : speakUpReports.length > 0 ? (
          <ul className="space-y-3">
            {speakUpReports.map((r) => (
              <SpeakUpRow key={r.id} report={r} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No Speak-Up reports on record.</p>
        )}
      </section>
    </div>
  );
}
