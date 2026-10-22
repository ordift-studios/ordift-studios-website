import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getMyEngagement, getMyPayableStatus, getEngagementUpdates } from "@/lib/portal/engagementPortalData";
import { listMyProjectFiles, deriveProjectFileDisplayState } from "@/lib/payables/projectFiles";
import { isTerminalEngagementStatus } from "@/lib/payables/engagements";
import { PAYABLE_STATUS_LABELS } from "@/lib/payments/payoutObligations";
import { isInstructorEngagement } from "@/lib/portal/externalWorkforce";
import { getMyPortalModules } from "@/lib/portal/portalModules";
import { getCrewAssignmentForEngagement } from "@/lib/crewSupport/crewOffers";
import { getServiceFamilyForEngagement, listMyReports } from "@/lib/crewSupport/jobReports";
import { RELEASE_CATEGORIES } from "@/lib/crewSupport/fileRelease";
import CrewJobDetails from "@/components/portal/CrewJobDetails";
import JobReportPanel from "@/components/portal/JobReportPanel";
import ReadinessPanel from "@/components/portal/ReadinessPanel";
import ClientFeedbackPanel from "@/components/portal/ClientFeedbackPanel";
import { loadClientFeedbackForProfessional } from "@/lib/crewSupport/clientResponses";
import { getReadinessForProfessional } from "@/lib/crewSupport/readiness";
import { formatInZone } from "@/lib/crewSupport/schedule";
import MediaFileUploader from "@/components/payables/MediaFileUploader";
import EngagementFileList from "@/components/portal/EngagementFileList";
import { postEngagementUpdateAction, requestFileUploadAuthorizationAction, recordUploadedFileAction } from "../../actions";

export const metadata: Metadata = {
  title: "Assignment — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Phase H.1/H.2 (2026-09-04) — the shared assignment-detail surface
// for any external-workforce relationship whose engagement this
// account owns (contractor, true vendor, or model alike — ownership is
// engagements.payee_profile_id, not a role check). Brief/due date/
// compensation/status are all already-RLS-readable data this page is
// the first thing to actually render.
//
// Phase K.1 (2026-09-05) — this page previously rendered Files and
// Feedback unconditionally for whoever owned the engagement, contrary
// to what modulesForRelationship() already declared (files: false for
// vendor/model). Ownership was always correctly enforced (getMyEngagement/
// listMyProjectFiles never leaked another person's data) — the gap was
// that a real vendor or model account could see a Files/Feedback
// section modulesForRelationship() says shouldn't exist for them at
// all. Fixed by actually consulting getMyPortalModules() here, the
// same classification every index page (collaborator/vendor/model)
// resolves for itself — a module now renders only when the viewer's
// real relationship supports it, never merely because the page has the
// data available to render.
export default async function CollaboratorEngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const engagement = await getMyEngagement(id, user.id);
  if (!engagement) notFound();

  const [crewJob, payable, updates, filesResult, { modules }] = await Promise.all([
    getCrewAssignmentForEngagement(id, user.id),
    engagement.paymentObligationId ? getMyPayableStatus(engagement.paymentObligationId) : Promise.resolve(null),
    getEngagementUpdates(id),
    listMyProjectFiles(id, user.id),
    getMyPortalModules(user.id, user.roles),
  ]);
  const allFiles = filesResult.ok ? filesResult.files : [];
  // What the client said about THIS assignment (null unless the signed-in person is its assigned professional and there is a response).
  const clientFeedback = crewJob ? await loadClientFeedbackForProfessional(id, user.id).catch(() => null) : null;
  // A file the uploader removed before submitting is kept on record but no longer listed.
  const files = allFiles.filter((f) => !(f.releaseStatus === "withdrawn" && f.purgedAt));
  // An accepted Crew Support job always has its own workspace (job report, files, feedback), whatever the
  // person's payee classification — the Founder or a staff member working a crew job is "unclassified"
  // for the external-workforce modules and used to see none of it.
  const isCrewJob = Boolean(crewJob);
  const showFiles = modules.files || isCrewJob;
  const showFeedback = modules.feedback || isCrewJob;
  const [reports, serviceFamily, readiness] = isCrewJob ? await Promise.all([listMyReports(id, user.id), getServiceFamilyForEngagement(id), getReadinessForProfessional(id, user.id)]) : [[], null, null];
  const instructor = isInstructorEngagement(engagement.operationalTitleName);
  const closed = isTerminalEngagementStatus(engagement.status);

  async function submitUpdate(formData: FormData) {
    "use server";
    await postEngagementUpdateAction(formData);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          {instructor ? "Workshop Session" : "Assignment"}
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {engagement.operationalTitleName ?? "Engagement"} {engagement.engagementTypeName ? `· ${engagement.engagementTypeName}` : ""}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Status: <strong>{engagement.status}</strong>
          {engagement.dueDate && <> · Due {new Date(engagement.dueDate).toLocaleDateString()}</>}
        </p>
      </div>

      {crewJob && <CrewJobDetails job={crewJob} />}

      {clientFeedback && <ClientFeedbackPanel feedback={clientFeedback} />}

      <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Brief</h2>
        <p className="font-sans text-body-small text-ordift-ink">{engagement.roleNote ?? "No brief note provided."}</p>
        {engagement.notes && <p className="font-sans text-body-small text-ordift-ink-muted">{engagement.notes}</p>}
      </section>

      <section className="bg-white border border-black/10 rounded-2xl p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Compensation</h2>
        <p className="font-sans text-body-small text-ordift-ink">
          {engagement.agreedAmount ? `${engagement.currency ?? ""} ${engagement.agreedAmount}` : "Not yet set"}
        </p>
        {payable && (
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            Payable status: {PAYABLE_STATUS_LABELS[payable.status] ?? payable.status}
            {payable.paidAt && <> · paid {new Date(payable.paidAt).toLocaleDateString()}</>}
          </p>
        )}
      </section>

      {readiness?.enrolled && readiness.active && (
        <ReadinessPanel
          data={{
            engagementId: id, serviceFamily: readiness.serviceFamily, state: readiness.state, timezone: readiness.timezone, callTimeKnown: readiness.callTimeKnown,
            startLabel: readiness.startMs != null && readiness.timezone ? formatInZone(readiness.startMs, readiness.timezone) : null,
            latest: readiness.latest ? { version: readiness.latest.version, status: readiness.latest.status, checks: readiness.latest.checks, concerns: readiness.latest.concerns, remarks: readiness.latest.remarks, submittedAt: readiness.latest.submittedAt } : null,
            canRespond: readiness.canRespond,
            issues: readiness.issues.filter((i) => i.status !== "resolved" || i.events.length > 0).slice(0, 3).map((i) => ({ id: i.id, status: i.status, kind: i.kind, events: i.events.map((e) => ({ id: e.id, actorRole: e.actorRole, event: e.event, body: e.body, createdAt: e.createdAt })) })),
          }}
        />
      )}

      {crewJob && (
        <JobReportPanel
          engagementId={id}
          serviceFamily={serviceFamily}
          scheduledDate={crewJob.startDate.slice(0, 10)}
          reports={reports.map((r) => ({ id: r.id, version: r.version, correctionReason: r.correctionReason, actualServiceDate: r.actualServiceDate, actualStartTime: r.actualStartTime, actualEndTime: r.actualEndTime, completionStatus: r.completionStatus, wentSmoothly: r.wentSmoothly, answers: r.answers, incidents: r.incidents, clientRequests: r.clientRequests, additionalServices: r.additionalServices, outstandingWork: r.outstandingWork, remarks: r.remarks, submittedAt: r.submittedAt }))}
        />
      )}

      {showFiles && (
      <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Files</h2>
        {isCrewJob && <p className="font-sans text-caption text-ordift-ink-muted">Everything you upload here is private to Ordift. Submit a file for review when it is ready; the client sees it only after management approves and releases it.</p>}
        <EngagementFileList
          releaseEngagementId={isCrewJob ? id : undefined}
          files={files.map((f) => ({
            id: f.id,
            fileKind: f.fileKind,
            originalFilename: f.originalFilename,
            sizeBytes: f.sizeBytes,
            version: f.version,
            uploadedAt: f.uploadedAt,
            displayState: deriveProjectFileDisplayState({ lifecycleState: f.lifecycleState, engagementStatus: engagement.status, fileKind: f.fileKind }),
            releaseCategory: f.releaseCategory,
            releaseStatus: f.releaseStatus,
            clientTitle: f.clientTitle,
            releaseReviewNote: f.releaseReviewNote,
            canRemove: f.uploadedBy === user.id,
          }))}
        />
        {closed ? (
          <p className="font-sans text-caption text-ordift-ink-muted">This engagement is closed — no new files can be added. Files above remain available.</p>
        ) : (
          <MediaFileUploader
            engagementId={id}
            fileKindOptions={isCrewJob ? [{ value: "deliverable", label: "Deliverable" }] : [
              { value: "deliverable", label: "Deliverable" },
              { value: "revision", label: "Revision" },
            ]}
            categoryOptions={isCrewJob ? RELEASE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) : undefined}
            requestUpload={requestFileUploadAuthorizationAction}
            recordUpload={recordUploadedFileAction}
          />
        )}
      </section>
      )}

      {showFeedback && (
      <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-5">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Feedback</h2>
        {closed ? (
          <p className="font-sans text-caption text-ordift-ink-muted">This engagement is closed — no new updates can be posted.</p>
        ) : (
        <form action={submitUpdate} className="space-y-2 border-b border-black/5 pb-5">
          <input type="hidden" name="engagementId" value={id} />
          <textarea
            name="note"
            required
            placeholder="Post an update…"
            rows={3}
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <input
            type="url"
            name="linkUrl"
            placeholder="Reference link (optional)"
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <button type="submit" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
            Post Update
          </button>
        </form>
        )}
        {updates.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No updates yet.</p>
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id}>
                <p className="font-sans text-body-small text-ordift-ink">{u.note}</p>
                {u.linkUrl && (
                  <a href={u.linkUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    {u.linkUrl}
                  </a>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                  {u.authorName ?? "Team member"} — {new Date(u.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
