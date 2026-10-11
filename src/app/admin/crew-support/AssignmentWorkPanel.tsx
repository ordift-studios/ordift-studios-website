import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { COMPLETION_STATUS_LABELS, questionsFor, type CompletionStatus } from "@/lib/crewSupport/jobReportRules";
import { RELEASE_STATUS_LABELS, SELF_REVIEW_MESSAGE, managementActions, releaseCategoryLabel, reviewerConflict, type ReleaseStatus } from "@/lib/crewSupport/fileRelease";
import type { AssignmentReport } from "@/lib/crewSupport/jobReports";
import type { ProjectFile } from "@/lib/payables/projectFiles";
import { releaseFilesAction, reviewFileAction } from "./releaseActions";
import ReviewFileLink from "./ReviewFileLink";

export type AssignmentWork = { slotId: string; label: string; assigneeId: string | null; engagementId: string; serviceFamily: string | null; reports: AssignmentReport[]; files: ProjectFile[] };

const BTN = "rounded-md px-3 py-1.5 font-sans text-caption font-semibold";
const INPUT = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";

function ReportBlock({ reports, serviceFamily }: { reports: AssignmentReport[]; serviceFamily: string | null }) {
  const r = reports[0];
  if (!r) return <p className="font-sans text-body-small text-ordift-ink-muted">No job report submitted yet.</p>;
  const qs = new Map(questionsFor(serviceFamily).map((q) => [q.id, q]));
  const answered = Object.entries(r.answers).flatMap(([id, v]) => {
    const q = qs.get(id);
    if (!q) return [];
    const label = q.kind === "yes_no" ? (v === "yes" ? "Yes" : "No") : q.options?.find((o) => o.value === v)?.label ?? v;
    return [`${q.label} — ${label}`];
  });
  const lines: [string, string | null][] = [
    ["Status", COMPLETION_STATUS_LABELS[r.completionStatus as CompletionStatus] ?? r.completionStatus],
    ["Performed on", `${r.actualServiceDate}${r.actualStartTime ? ` · ${r.actualStartTime}${r.actualEndTime ? `–${r.actualEndTime}` : ""}` : ""}`],
    ["Went smoothly", r.wentSmoothly == null ? null : r.wentSmoothly ? "Yes" : "No"],
    ["Incidents", r.incidents], ["Client requests", r.clientRequests], ["Additional services", r.additionalServices], ["Outstanding work", r.outstandingWork], ["Remarks", r.remarks],
  ];
  return (
    <div className="space-y-1">
      <p className="font-sans text-caption text-ordift-ink-muted">Version {r.version} · submitted {new Date(r.submittedAt).toLocaleString()}{r.correctionReason ? ` · correction: ${r.correctionReason}` : ""}</p>
      {lines.filter(([, v]) => v).map(([k, v]) => (
        <p key={k} className="font-sans text-body-small text-ordift-ink"><span className="text-ordift-ink-muted">{k}: </span>{v}</p>
      ))}
      {answered.length > 0 && <ul className="list-disc pl-5 font-sans text-caption text-ordift-ink-muted">{answered.map((a) => <li key={a}>{a}</li>)}</ul>}
      {reports.length > 1 && (
        <details>
          <summary className="cursor-pointer font-sans text-caption text-ordift-ink-muted">Earlier versions ({reports.length - 1}) — kept for audit</summary>
          <ul className="mt-1 space-y-1 font-sans text-caption text-ordift-ink-muted">
            {reports.slice(1).map((o) => <li key={o.id}>Version {o.version} · {new Date(o.submittedAt).toLocaleString()} · {COMPLETION_STATUS_LABELS[o.completionStatus as CompletionStatus] ?? o.completionStatus}{o.correctionReason ? ` · ${o.correctionReason}` : ""}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

// Management's view of an accepted job: the professional's report, and the files they have uploaded with
// where each is in the review-and-release flow. Nothing reaches the client until it is released here.
export default function AssignmentWorkPanel({ requestId, work, canReview, isTest, viewerId }: { requestId: string; work: AssignmentWork[]; canReview: boolean; isTest: boolean; viewerId: string }) {
  if (work.length === 0) return null;
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-6" aria-labelledby="assignment-work-heading">
      <div>
        <h2 id="assignment-work-heading" className="font-serif font-medium text-body text-ordift-ink">Assignment work: reports &amp; files</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">
          Reports are internal. Files stay private until they are approved and released; releasing posts a project update for the client{isTest ? " (this is a test record, so no client email is ever sent)" : " and can email them"}. Releasing files does not complete the client project or pay anyone.
        </p>
        {!canReview && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Only authorised management can approve and release files.</p>}
      </div>

      {work.map((w) => {
        const awaiting = w.files.filter((f) => f.releaseStatus === "submitted");
        const approved = w.files.filter((f) => f.releaseStatus === "approved");
        const others = w.files.filter((f) => !["submitted", "approved"].includes(f.releaseStatus));
        // Nobody reviews or releases their own work, whatever their role.
        const conflicted = (f: (typeof w.files)[number]) => reviewerConflict({ reviewerId: viewerId, uploadedBy: f.uploadedBy, submittedBy: f.submittedForReleaseBy, assigneeId: w.assigneeId });
        const anyConflict = [...awaiting, ...approved].some((f) => conflicted(f));
        return (
          <div key={w.slotId} className="space-y-4 border-t border-black/5 pt-4 first:border-t-0 first:pt-0">
            <p className="font-sans text-body-small font-medium text-ordift-ink">{w.label}</p>
            <ReportBlock reports={w.reports} serviceFamily={w.serviceFamily} />
            {canReview && anyConflict && (
              <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900">{SELF_REVIEW_MESSAGE}</p>
            )}

            <div className="space-y-3">
              <p className="font-sans text-body-small font-medium text-ordift-ink">Files ({w.files.length})</p>
              {w.files.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">Nothing uploaded yet.</p>}

              {awaiting.length > 0 && <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">Awaiting your review</p>}
              {awaiting.map((f) => (
                <div key={f.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <p className="font-sans text-body-small text-ordift-ink"><ReviewFileLink fileId={f.id} label={f.originalFilename} /> <span className="text-ordift-ink-muted">· {releaseCategoryLabel(f.releaseCategory)} · client title “{f.clientTitle}”</span></p>
                  {f.clientDescription && <p className="font-sans text-caption text-ordift-ink-muted">{f.clientDescription}</p>}
                  {canReview && !conflicted(f) && managementActions(f.releaseStatus).length > 0 && (
                    <ActionForm action={reviewFileAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="requestId" value={requestId} />
                      <input type="hidden" name="fileId" value={f.id} />
                      <input name="note" placeholder="Note (required to request changes or decline)" className={`${INPUT} sm:max-w-xs`} />
                      <SubmitButton name="decision" value="approve" pendingLabel="Saving…" className={`${BTN} bg-ordift-navy-950 text-white`}>Approve</SubmitButton>
                      <SubmitButton name="decision" value="request_changes" pendingLabel="Saving…" className={`${BTN} border border-black/20`}>Request changes</SubmitButton>
                      <SubmitButton name="decision" value="reject" pendingLabel="Saving…" className={`${BTN} border border-red-300 text-red-800`}>Decline</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}

              {approved.length > 0 && <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">Approved — not yet released</p>}
              {approved.length > 0 && (
                canReview && !approved.some((f) => conflicted(f)) ? (
                  <ActionForm action={releaseFilesAction} className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                    <input type="hidden" name="requestId" value={requestId} />
                    <ul className="space-y-1">
                      {approved.map((f) => (
                        <li key={f.id} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                          <input type="checkbox" name="fileId" value={f.id} defaultChecked id={`rel-${f.id}`} className="mt-1" />
                          <label htmlFor={`rel-${f.id}`}><ReviewFileLink fileId={f.id} label={f.clientTitle ?? f.originalFilename} /> <span className="text-ordift-ink-muted">· {releaseCategoryLabel(f.releaseCategory)}</span></label>
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 font-sans text-caption text-ordift-ink">
                      <input type="checkbox" name="notifyClient" defaultChecked={false} disabled={isTest} /> Also email the client one “files ready” message with a secure portal link (off by default){isTest ? " — disabled for test records" : ""}
                    </label>
                    <SubmitButton pendingLabel="Releasing…" className={`${BTN} bg-ordift-gold text-ordift-navy-950`}>Release selected to the client</SubmitButton>
                  </ActionForm>
                ) : (
                  <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink">{approved.map((f) => <li key={f.id}>{f.clientTitle ?? f.originalFilename}</li>)}</ul>
                )
              )}

              {others.length > 0 && (
                <ul className="space-y-1 font-sans text-caption text-ordift-ink-muted">
                  {others.map((f) => (
                    <li key={f.id}>
                      {canReview ? <ReviewFileLink fileId={f.id} label={f.originalFilename} /> : f.originalFilename} · {releaseCategoryLabel(f.releaseCategory)} · {RELEASE_STATUS_LABELS[f.releaseStatus as ReleaseStatus] ?? f.releaseStatus}
                      {f.releaseStatus === "changes_requested" && f.releaseReviewNote ? ` — “${f.releaseReviewNote}”` : ""}
                      {f.releasedAt ? ` · ${new Date(f.releasedAt).toLocaleString()}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
