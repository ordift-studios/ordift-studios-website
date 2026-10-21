import ActionForm from "@/components/admin/ActionForm";
import { COMPLETION_STATUS_LABELS, questionsFor, type CompletionStatus } from "@/lib/crewSupport/jobReportRules";
import { ASSIGNEE_NOTICE_BODY, ASSIGNEE_NOTICE_TITLE, SELF_REVIEW_MESSAGE, isAssignedProfessional, releaseCategoryLabel, reviewerConflict } from "@/lib/crewSupport/fileRelease";
import type { AssignmentReport } from "@/lib/crewSupport/jobReports";
import type { ProjectFile } from "@/lib/payables/projectFiles";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { summarizeDeliverySet, toGalleryFile } from "@/lib/crewSupport/fileReview";
import { notifyReleasedFilesAction, releaseFilesAction } from "./releaseActions";
import AssignmentReviewGallery from "./AssignmentReviewGallery";
import ReviewFileLink from "./ReviewFileLink";

export type AssignmentWork = { slotId: string; label: string; assigneeId: string | null; engagementId: string; serviceFamily: string | null; reports: AssignmentReport[]; files: ProjectFile[]; emailedFileIds?: string[] };

const BTN = "rounded-md px-3 py-1.5 font-sans text-caption font-semibold";

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
        const released = w.files.filter((f) => f.releaseStatus === "released");
        const emailed = new Set(w.emailedFileIds ?? []);
        const unemailed = released.filter((f) => !emailed.has(f.id));
        const set = summarizeDeliverySet(w.files.map((f) => ({ id: f.id, fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: Boolean(f.purgedAt) })));
        const gallery = w.files.map((f) => toGalleryFile(f, viewerId, w.assigneeId, emailed.has(f.id)));
        // Nobody reviews or releases their own work, whatever their role.
        const conflicted = (f: (typeof w.files)[number]) => reviewerConflict({ reviewerId: viewerId, uploadedBy: f.uploadedBy, submittedBy: f.submittedForReleaseBy, assigneeId: w.assigneeId });
        const anyConflict = [...awaiting, ...approved].some((f) => conflicted(f));
        const viewerIsAssignee = isAssignedProfessional(viewerId, w.assigneeId);
        return (
          <div key={w.slotId} className="space-y-4 border-t border-black/5 pt-4 first:border-t-0 first:pt-0">
            <p className="font-sans text-body-small font-medium text-ordift-ink">{w.label}</p>
            {viewerIsAssignee && (
              <div role="note" aria-label="Self-review restriction" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <p className="font-sans text-caption font-semibold text-amber-900">{ASSIGNEE_NOTICE_TITLE}</p>
                <p className="font-sans text-caption text-amber-900">{ASSIGNEE_NOTICE_BODY}</p>
              </div>
            )}
            <ReportBlock reports={w.reports} serviceFamily={w.serviceFamily} />
            {canReview && anyConflict && !viewerIsAssignee && (
              <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-caption text-amber-900">{SELF_REVIEW_MESSAGE}</p>
            )}

            <div className="space-y-3">
              <p className="font-sans text-body-small font-medium text-ordift-ink">Files ({w.files.length})</p>
              {w.files.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">Nothing uploaded yet.</p>}

              {w.files.length > 0 && (
                <p className="font-sans text-caption text-ordift-ink-muted" data-testid="delivery-set">
                  Delivery set: <strong>{set.ready}</strong> approved and ready to release · <strong>{set.awaitingReview}</strong> awaiting review · <strong>{set.returned}</strong> returned for rework · <strong>{set.released}</strong> released{set.notInSet > 0 ? ` · ${set.notInSet} not part of the delivery (internal or private files)` : ""}.
                </p>
              )}
              {w.files.length > 0 && <AssignmentReviewGallery requestId={requestId} engagementId={w.engagementId} files={gallery} />}

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
                    <ConfirmSubmitButton confirmMessage="Release the ticked files to the client now? They become visible in the client’s portal immediately. This does not complete the project or pay anyone." pendingLabel="Releasing…" className={`${BTN} bg-ordift-gold text-ordift-navy-950`}>Release selected to the client</ConfirmSubmitButton>
                  </ActionForm>
                ) : (
                  <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink">{approved.map((f) => <li key={f.id}>{f.clientTitle ?? f.originalFilename}</li>)}</ul>
                )
              )}

              {released.length > 0 && (
                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/40 p-3">
                  <p className="font-sans text-body-small font-medium text-ordift-ink">Released to the client ({released.length})</p>
                  <ul className="space-y-1 font-sans text-caption text-ordift-ink-muted">
                    {released.map((f) => (
                      <li key={f.id}>
                        {f.clientTitle ?? f.originalFilename} · released {f.releasedAt ? new Date(f.releasedAt).toLocaleString() : ""} · client email: {emailed.has(f.id) ? "sent" : "not sent"}
                      </li>
                    ))}
                  </ul>
                  {unemailed.length > 0 && canReview && !isTest && !unemailed.some((f) => conflicted(f)) && (
                    <ActionForm action={notifyReleasedFilesAction} className="space-y-2">
                      <input type="hidden" name="requestId" value={requestId} />
                      {unemailed.map((f) => <input key={f.id} type="hidden" name="fileId" value={f.id} />)}
                      <p className="font-sans text-caption text-ordift-ink-muted">Releasing and emailing are separate. {unemailed.length} released file{unemailed.length === 1 ? " has" : "s have"} not been emailed about. This sends the client ONE “files ready” email with their secure portal link; a file is never emailed about twice.</p>
                      <ConfirmSubmitButton confirmMessage={`Email the client once about ${unemailed.length} released file${unemailed.length === 1 ? "" : "s"}?`} pendingLabel="Sending…" className={`${BTN} border border-black/20`}>Email the client about these files</ConfirmSubmitButton>
                    </ActionForm>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
