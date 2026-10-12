"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { submitJobReportAction } from "@/app/portal/(dashboard)/collaborator/assignmentWorkActions";
import { COMPLETION_STATUS_LABELS, COMPLETION_STATUSES, questionsFor, type CompletionStatus } from "@/lib/crewSupport/jobReportRules";

export type ReportView = {
  id: string;
  version: number;
  correctionReason: string | null;
  actualServiceDate: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  completionStatus: string;
  wentSmoothly: boolean | null;
  answers: Record<string, string>;
  incidents: string | null;
  clientRequests: string | null;
  additionalServices: string | null;
  outstandingWork: string | null;
  remarks: string | null;
  submittedAt: string;
};

const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const LABEL = "font-sans text-caption text-ordift-ink-muted";

function Fields({ engagementId, serviceFamily, defaults, scheduledDate, correction }: { engagementId: string; serviceFamily: string | null; defaults?: ReportView; scheduledDate: string; correction: boolean }) {
  const questions = questionsFor(serviceFamily);
  return (
    <div className="space-y-4">
      <input type="hidden" name="engagementId" value={engagementId} />
      {correction && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>What are you correcting, and why? (the original report is kept)</span>
          <textarea name="correctionReason" required minLength={5} rows={2} className={INPUT} />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Date the work was actually performed</span>
          <input type="date" name="actualServiceDate" required defaultValue={defaults?.actualServiceDate ?? ""} className={INPUT} aria-describedby="scheduled-date-hint" />
          <span id="scheduled-date-hint" className="font-sans text-caption text-ordift-ink-muted">The system shows {scheduledDate} as the scheduled date. It is not filled in for you: enter the date the work really happened, which may differ.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Actual start (optional)</span>
          <input type="time" name="actualStartTime" defaultValue={defaults?.actualStartTime ?? ""} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Actual finish (optional)</span>
          <input type="time" name="actualEndTime" defaultValue={defaults?.actualEndTime ?? ""} className={INPUT} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Completion status</span>
        <select name="completionStatus" required defaultValue={defaults?.completionStatus ?? "completed"} className={INPUT}>
          {COMPLETION_STATUSES.map((s) => (
            <option key={s} value={s}>{COMPLETION_STATUS_LABELS[s as CompletionStatus]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Overall, did the job go smoothly?</span>
        <select name="wentSmoothly" defaultValue={defaults?.wentSmoothly == null ? "" : defaults.wentSmoothly ? "yes" : "no"} className={INPUT}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {questions.map((q) => (
          <label key={q.id} className="flex flex-col gap-1">
            <span className={LABEL}>{q.label}</span>
            <select name={`q_${q.id}`} defaultValue={defaults?.answers[q.id] ?? ""} className={INPUT}>
              <option value="">—</option>
              {(q.kind === "yes_no" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : q.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {([
        ["incidents", "Incidents or problems (if any)"],
        ["clientRequests", "Client requests made on the day"],
        ["additionalServices", "Any additional services provided or requested"],
        ["outstandingWork", "Outstanding work still to be done"],
        ["remarks", "Other remarks"],
      ] as const).map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1">
          <span className={LABEL}>{label}</span>
          <textarea name={name} rows={2} maxLength={2000} defaultValue={(defaults?.[name] as string | null) ?? ""} className={INPUT} />
        </label>
      ))}
    </div>
  );
}

function Summary({ r, serviceFamily }: { r: ReportView; serviceFamily: string | null }) {
  const qs = new Map(questionsFor(serviceFamily).map((q) => [q.id, q]));
  const answered = Object.entries(r.answers).map(([id, v]) => {
    const q = qs.get(id);
    const label = q?.kind === "yes_no" ? (v === "yes" ? "Yes" : "No") : q?.options?.find((o) => o.value === v)?.label ?? v;
    return q ? `${q.label} — ${label}` : null;
  }).filter(Boolean);
  const rows: [string, string | null][] = [
    ["Status", COMPLETION_STATUS_LABELS[r.completionStatus as CompletionStatus] ?? r.completionStatus],
    ["Performed on", `${r.actualServiceDate}${r.actualStartTime ? ` · ${r.actualStartTime}${r.actualEndTime ? `–${r.actualEndTime}` : ""}` : ""}`],
    ["Went smoothly", r.wentSmoothly == null ? null : r.wentSmoothly ? "Yes" : "No"],
    ["Incidents", r.incidents], ["Client requests", r.clientRequests], ["Additional services", r.additionalServices], ["Outstanding work", r.outstandingWork], ["Remarks", r.remarks],
  ];
  return (
    <dl className="space-y-1 font-sans text-body-small text-ordift-ink">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt className="inline text-ordift-ink-muted">{k}: </dt><dd className="inline">{v}</dd></div>
      ))}
      {answered.length > 0 && <ul className="list-disc pl-5 text-ordift-ink-muted">{answered.map((a) => <li key={a}>{a}</li>)}</ul>}
    </dl>
  );
}

// The assigned professional's job-completion report. Submitting it records that the work was performed — it
// does not complete the client's project and has no effect on payment.
export default function JobReportPanel({ engagementId, serviceFamily, reports, scheduledDate }: { engagementId: string; serviceFamily: string | null; reports: ReportView[]; scheduledDate: string }) {
  const latest = reports[0];
  return (
    <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-4" aria-labelledby="job-report-heading">
      <div>
        <h2 id="job-report-heading" className="font-serif font-medium text-body text-ordift-ink">Job report</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">An internal record of the work you performed. Clients don&apos;t see it, and submitting it does not complete the client&apos;s project or affect any payment.</p>
      </div>

      {!latest ? (
        <ActionForm action={submitJobReportAction} className="space-y-4">
          <Fields engagementId={engagementId} serviceFamily={serviceFamily} scheduledDate={scheduledDate} correction={false} />
          <SubmitButton pendingLabel="Submitting…" className="rounded-md bg-ordift-navy-950 px-4 py-2 font-sans text-body-small font-semibold text-white">Confirm work performed &amp; submit report</SubmitButton>
        </ActionForm>
      ) : (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="font-sans text-body-small font-medium text-green-900">Report submitted{latest.version > 1 ? ` (version ${latest.version})` : ""} on {new Date(latest.submittedAt).toLocaleString()}</p>
            {latest.correctionReason && <p className="font-sans text-caption text-green-900">Correction: {latest.correctionReason}</p>}
          </div>
          <Summary r={latest} serviceFamily={serviceFamily} />
          <details>
            <summary className="cursor-pointer font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Correct this report</summary>
            <ActionForm action={submitJobReportAction} className="mt-3 space-y-4">
              <Fields engagementId={engagementId} serviceFamily={serviceFamily} defaults={latest} scheduledDate={scheduledDate} correction />
              <SubmitButton pendingLabel="Saving…" className="rounded-md bg-ordift-navy-950 px-4 py-2 font-sans text-body-small font-semibold text-white">Save correction as a new version</SubmitButton>
            </ActionForm>
          </details>
          {reports.length > 1 && (
            <details>
              <summary className="cursor-pointer font-sans text-caption text-ordift-ink-muted">Earlier versions ({reports.length - 1})</summary>
              <ul className="mt-2 space-y-3">
                {reports.slice(1).map((r) => (
                  <li key={r.id} className="rounded-lg border border-black/10 p-3">
                    <p className="font-sans text-caption text-ordift-ink-muted">Version {r.version} · {new Date(r.submittedAt).toLocaleString()}{r.correctionReason ? ` · ${r.correctionReason}` : ""}</p>
                    <Summary r={r} serviceFamily={serviceFamily} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
