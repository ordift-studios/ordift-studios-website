import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { getEngagement } from "@/lib/payables/engagements";
import { getPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listProjectFilesForEngagement, deriveProjectFileDisplayState, PROJECT_FILE_KINDS } from "@/lib/payables/projectFiles";
import MediaFileUploader from "@/components/payables/MediaFileUploader";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import {
  requestStaffFileUploadAuthorizationAction,
  recordStaffUploadedFileAction,
  confirmProjectFileBackupAction,
  setProjectFileRetainAction,
} from "../../../actions";

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

  const [payee, files] = await Promise.all([
    engagement.payeeProfileId ? getPayeeProfile(engagement.payeeProfileId) : Promise.resolve(null),
    listProjectFilesForEngagement(id),
  ]);

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

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Files</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-4">
          {files.map((f) => (
            <li key={f.id} className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-sans text-body-small text-ordift-ink">
                  {f.originalFilename} {f.version > 1 && <span className="text-ordift-ink-muted">v{f.version}</span>}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {f.fileKind} · {f.sizeBytes ? `${(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "—"} ·{" "}
                  {deriveProjectFileDisplayState({ lifecycleState: f.lifecycleState, engagementStatus: engagement.status, fileKind: f.fileKind })}
                  {f.retain && " · Retained"}
                  {f.purgeScheduledAt && !f.purgedAt && ` · Purge scheduled ${new Date(f.purgeScheduledAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {f.lifecycleState === "active" && f.fileKind !== "final_approved" && (
                  <form action={confirmProjectFileBackupAction}>
                    <input type="hidden" name="fileId" value={f.id} />
                    <input type="hidden" name="engagementId" value={id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Confirm this file has been backed up externally? This starts the retention grace period before eventual cleanup.`}
                      pendingLabel="Confirming…"
                      className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
                    >
                      Confirm Backup
                    </ConfirmSubmitButton>
                  </form>
                )}
                <form action={setProjectFileRetainAction}>
                  <input type="hidden" name="fileId" value={f.id} />
                  <input type="hidden" name="engagementId" value={id} />
                  <input type="hidden" name="retain" value={f.retain ? "false" : "true"} />
                  <button type="submit" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                    {f.retain ? "Remove Retain" : "Retain"}
                  </button>
                </form>
              </div>
            </li>
          ))}
          {files.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">No files yet.</li>}
        </ul>

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
