"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { readinessIssueReplyAction, readinessIssueReportResolvedAction, submitReadinessAction } from "@/app/portal/(dashboard)/collaborator/readinessActions";
import { CONCERN_AREAS, ISSUE_STATUS_LABELS, READINESS_STATE_LABELS, READINESS_STATUS_LABELS, READINESS_STATUSES, readinessChecklistFor, type IssueStatus, type ReadinessState } from "@/lib/crewSupport/readinessRules";

export type ReadinessPanelIssue = { id: string; status: string; kind: string; events: { id: string; actorRole: string; event: string; body: string | null; createdAt: string }[] };
export type ReadinessPanelData = {
  engagementId: string;
  serviceFamily: string | null;
  state: ReadinessState;
  startLabel: string | null; // already formatted in the job's timezone
  timezone: string | null;
  callTimeKnown: boolean;
  latest: { version: number; status: string; checks: Record<string, string>; concerns: Record<string, string>; remarks: string | null; submittedAt: string } | null;
  canRespond: string | null; // null = may answer; otherwise the reason they can't
  issues: ReadinessPanelIssue[];
};

const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const LABEL = "font-sans text-caption text-ordift-ink-muted";
const TONE: Record<ReadinessState, string> = {
  not_confirmed: "bg-amber-50 text-amber-900 border-amber-200",
  stale: "bg-amber-50 text-amber-900 border-amber-200",
  ready: "bg-green-50 text-green-900 border-green-200",
  need_assistance: "bg-blue-50 text-blue-900 border-blue-200",
  not_ready: "bg-red-50 text-red-900 border-red-200",
};
const WHO: Record<string, string> = { management: "Ordift management", professional: "You", system: "System" };

function Thread({ issue, engagementId }: { issue: ReadinessPanelIssue; engagementId: string }) {
  const closed = issue.status === "resolved";
  return (
    <div className="rounded-lg border border-black/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-sans text-body-small font-medium text-ordift-ink">Your request for help</span>
        <span className="rounded-full border border-black/10 bg-ordift-offwhite px-2.5 py-0.5 font-sans text-caption text-ordift-ink">{ISSUE_STATUS_LABELS[issue.status as IssueStatus] ?? issue.status}</span>
      </div>
      {issue.status === "awaiting_professional" && <p className="font-sans text-caption text-ordift-ink">Management is waiting for you to confirm whether this is sorted.</p>}
      <ul className="space-y-2">
        {issue.events.filter((e) => e.body).map((e) => (
          <li key={e.id} className="font-sans text-body-small text-ordift-ink">
            <span className="text-ordift-ink-muted">{WHO[e.actorRole] ?? e.actorRole} · {new Date(e.createdAt).toLocaleString()}: </span>{e.body}
          </li>
        ))}
      </ul>
      {!closed && (
        <div className="space-y-2">
          <ActionForm action={readinessIssueReplyAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="engagementId" value={engagementId} />
            <input type="hidden" name="issueId" value={issue.id} />
            <input name="body" placeholder="Reply to management…" maxLength={1000} required className={`${INPUT} sm:flex-1`} />
            <SubmitButton pendingLabel="Sending…" className="rounded-md border border-black/20 px-3 py-2 font-sans text-caption font-semibold">Send reply</SubmitButton>
          </ActionForm>
          <ActionForm action={readinessIssueReportResolvedAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="engagementId" value={engagementId} />
            <input type="hidden" name="issueId" value={issue.id} />
            <SubmitButton pendingLabel="Saving…" className="rounded-md bg-ordift-navy-950 px-3 py-2 font-sans text-caption font-semibold text-white">I&apos;ve sorted this</SubmitButton>
            <span className={LABEL}>Management will verify and close it — you can&apos;t close it yourself.</span>
          </ActionForm>
        </div>
      )}
      {closed && <p className="font-sans text-caption text-ordift-ink-muted">Closed by management.</p>}
    </div>
  );
}

// The assigned professional's readiness card. Saving it records the answer for management; it does not
// complete the job, release anything, change any payment or send any email.
export default function ReadinessPanel({ data }: { data: ReadinessPanelData }) {
  const checklist = readinessChecklistFor(data.serviceFamily);
  const l = data.latest;
  return (
    <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-5" aria-labelledby="readiness-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="readiness-heading" className="font-serif font-medium text-body text-ordift-ink">Pre-assignment readiness</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            {data.startLabel ? <>Starts {data.startLabel}{data.timezone ? ` (${data.timezone})` : ""}{data.callTimeKnown ? "" : " — call time not set"}. </> : null}
            Let us know if you&apos;re ready, or what you need. Saving this does not change your assignment, files or payment.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 font-sans text-caption font-medium ${TONE[data.state]}`}>{READINESS_STATE_LABELS[data.state]}</span>
      </div>

      {data.state === "stale" && <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900">The schedule has changed since you last answered. Please check the new date and time, then confirm again.</p>}

      {data.canRespond ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">{data.canRespond}</p>
      ) : (
        <ActionForm action={submitReadinessAction} className="space-y-4">
          <input type="hidden" name="engagementId" value={data.engagementId} />
          <fieldset className="space-y-2">
            <legend className={LABEL}>How ready are you?</legend>
            {READINESS_STATUSES.map((s) => (
              <label key={s} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                <input type="radio" name="status" value={s} required defaultChecked={data.state !== "stale" && l?.status === s} className="mt-1" />
                <span>{READINESS_STATUS_LABELS[s]}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            {checklist.map((q) => (
              <label key={q.id} className="flex flex-col gap-1">
                <span className={LABEL}>{q.label}</span>
                <select name={`c_${q.id}`} defaultValue={l?.checks[q.id] ?? ""} className={INPUT}>
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
          </div>
          <div className="space-y-3">
            <p className={LABEL}>If anything is outstanding, tell us what (required for Need assistance or Not ready):</p>
            {CONCERN_AREAS.map((a) => (
              <label key={a.id} className="flex flex-col gap-1">
                <span className={LABEL}>{a.label}</span>
                <textarea name={`n_${a.id}`} rows={2} maxLength={500} defaultValue={l?.concerns[a.id] ?? ""} className={INPUT} />
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Other remarks</span>
              <textarea name="remarks" rows={2} maxLength={2000} defaultValue={l?.remarks ?? ""} className={INPUT} />
            </label>
          </div>
          <SubmitButton pendingLabel="Saving…" className="rounded-md bg-ordift-navy-950 px-4 py-2 font-sans text-body-small font-semibold text-white">{l ? "Update my answer" : "Confirm my readiness"}</SubmitButton>
          {l && <p className={LABEL}>Last answer: version {l.version}, {new Date(l.submittedAt).toLocaleString()}. Earlier answers are kept.</p>}
        </ActionForm>
      )}

      {data.issues.map((i) => <Thread key={i.id} issue={i} engagementId={data.engagementId} />)}
    </section>
  );
}
