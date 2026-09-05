import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getMyEngagement, getMyPayableStatus, getEngagementUpdates } from "@/lib/portal/engagementPortalData";
import { listMyProjectFiles, deriveProjectFileDisplayState } from "@/lib/payables/projectFiles";
import { isTerminalEngagementStatus } from "@/lib/payables/engagements";
import { PAYABLE_STATUS_LABELS } from "@/lib/payments/payoutObligations";
import { isInstructorEngagement } from "@/lib/portal/externalWorkforce";
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
export default async function CollaboratorEngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const engagement = await getMyEngagement(id, user.id);
  if (!engagement) notFound();

  const [payable, updates, filesResult] = await Promise.all([
    engagement.paymentObligationId ? getMyPayableStatus(engagement.paymentObligationId) : Promise.resolve(null),
    getEngagementUpdates(id),
    listMyProjectFiles(id, user.id),
  ]);
  const files = filesResult.ok ? filesResult.files : [];
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

      <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Files</h2>
        <EngagementFileList
          files={files.map((f) => ({
            id: f.id,
            fileKind: f.fileKind,
            originalFilename: f.originalFilename,
            sizeBytes: f.sizeBytes,
            version: f.version,
            uploadedAt: f.uploadedAt,
            displayState: deriveProjectFileDisplayState({ lifecycleState: f.lifecycleState, engagementStatus: engagement.status, fileKind: f.fileKind }),
          }))}
        />
        {closed ? (
          <p className="font-sans text-caption text-ordift-ink-muted">This engagement is closed — no new files can be added. Files above remain available.</p>
        ) : (
          <MediaFileUploader
            engagementId={id}
            fileKindOptions={[
              { value: "deliverable", label: "Deliverable" },
              { value: "revision", label: "Revision" },
            ]}
            requestUpload={requestFileUploadAuthorizationAction}
            recordUpload={recordUploadedFileAction}
          />
        )}
      </section>

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
    </div>
  );
}
