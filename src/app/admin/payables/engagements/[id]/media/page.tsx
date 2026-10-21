import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getEngagement } from "@/lib/payables/engagements";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listProjectFilesForEngagement, PROJECT_FILE_KINDS } from "@/lib/payables/projectFiles";
import MediaFileUploader from "@/components/payables/MediaFileUploader";
import { requestStaffFileUploadAuthorizationAction, recordStaffUploadedFileAction } from "../../../actions";
import MediaReviewGallery from "./MediaReviewGallery";
import { toGalleryFile } from "@/lib/crewSupport/fileReview";
import { crewRequestForEngagement } from "@/lib/crewSupport/fileReleaseFlow";

export const metadata: Metadata = {
  title: "Engagement Media — Payables — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STAFF_FILE_KIND_OPTIONS = PROJECT_FILE_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }));

// Phase H.1/H.2 (2026-09-04) — internal staff media/backup/retention
// panel for one engagement. Staff can upload any file_kind (source
// material included, unlike the portal path which only accepts
// deliverable/revision); confirm backup (starts the grace-period
// countdown); set/clear a retain override. Purge itself is triggered
// from the Payables index (a global "Run Cleanup" action, not per-
// engagement) since eligibility spans every engagement at once.
export default async function EngagementMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) redirect("/admin/payables");

  const { id } = await params;
  const engagement = await getEngagement(id);
  if (!engagement) notFound();

  const [payee, files, crewRequest] = await Promise.all([
    engagement.payeeProfileId ? getPayeeProfile(engagement.payeeProfileId) : Promise.resolve(null),
    listProjectFilesForEngagement(id),
    crewRequestForEngagement(id),
  ]);
  // Oldest first, so the gallery reads in the order the work was done; the viewer's own separation-of-duties block is
  // evaluated per file (the assigned professional is the engagement's payee).
  const gallery = [...files].reverse().map((f) => toGalleryFile(f, user.id, engagement.payeeProfileId ?? null));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance · Payables · Media</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {engagement.operationalTitleName ?? "Engagement"} — {payee?.fullName ?? engagement.externalPayeeName ?? "(no payee)"}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Status: <strong>{engagement.status}</strong>
          {payee && (
            <>
              {" · "}
              <Link href={`/admin/payables/payees/${payee.id}`} className="underline">
                View payee →
              </Link>
            </>
          )}
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Uploads &amp; approvals</h2>

        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 space-y-2" data-testid="what-the-buttons-mean">
          <p className="font-sans text-body-small font-semibold text-ordift-ink">Three different things happen to a file here</p>
          <ul className="list-disc space-y-1 pl-5 font-sans text-caption text-ordift-ink-muted">
            <li><strong>Review for the client</strong> — Approve for client / Return for rework. Approving does not show anything to the client.</li>
            <li><strong>Release</strong> — done on {crewRequest ? <Link href={`/admin/crew-support/${crewRequest.requestId}`} className="underline">{crewRequest.reference}</Link> : "the Crew Support request"}: approved files are explicitly released, and the client email is a separate, optional step.</li>
            <li><strong>Retention</strong> — Confirm backup / Retain / Final version control how long Ordift keeps a file. They never approve, release or email anything.</li>
          </ul>
          <p className="font-sans text-caption text-ordift-ink-muted">
            &ldquo;Uploading as&rdquo; (Deliverable, Final Approved, Source RAW…) describes the file for retention only. A file uploaded as Final Approved is still reviewed and released like any other.
          </p>
        </div>

        <MediaReviewGallery engagementId={id} requestId={crewRequest?.requestId ?? ""} engagementStatus={engagement.status} files={gallery} />

        <MediaFileUploader
          engagementId={id}
          fileKindOptions={STAFF_FILE_KIND_OPTIONS}
          requestUpload={requestStaffFileUploadAuthorizationAction}
          recordUpload={recordStaffUploadedFileAction}
        />
      </section>
    </div>
  );
}
