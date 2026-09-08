import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseSourcesAdmin } from "@/lib/content/sanity/pulseAdmin";
import { PERMISSION_LABEL, TRUST_LABEL, RIGHTS_STATUS_DISCLAIMER } from "@/lib/pulse/adminLabels";
import { getLastDiscoveryRunBySourceId, type LastPulseDiscoveryRun } from "@/lib/pulse/pulseDiscoveryStatus";
import type { PulsePermissionClassification } from "@/lib/content/types";
import RunDiscoveryButton from "./RunDiscoveryButton";

export const metadata: Metadata = { title: "Pulse Sources — Ordift Studios Admin", robots: { index: false, follow: false } };

const CLASSIFICATION_SHORT_LABEL: Record<string, string> = {
  official_primary: "Official / Primary",
  editorial_discovery: "Editorial / Discovery",
};

const RIGHTS_PILL_CLASS: Record<PulsePermissionClassification, string> = {
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  unknown: "bg-black/10 text-ordift-ink-muted",
};

function DiscoveryStatusText({ run }: { run: LastPulseDiscoveryRun | undefined }) {
  if (!run) return <span className="font-sans text-caption text-ordift-ink-muted italic">Never run</span>;
  const dateLabel = new Date(run.occurredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (run.status === "interrupted") return <span className="font-sans text-caption text-red-700">{dateLabel} — interrupted</span>;
  const color = run.status === "completed_with_errors" ? "text-amber-700" : "text-green-700";
  return (
    <span className={`font-sans text-caption ${color}`}>
      {dateLabel} — {run.created} new
    </span>
  );
}

export default async function AdminPulseSourcesPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const sources = await getPulseSourcesAdmin();
  const lastRunBySource = await getLastDiscoveryRunBySourceId(sources.map((s) => s.id));

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/pulse" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
            ← Back to Ordift Pulse
          </Link>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mt-4 mb-2">Admin</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pulse Sources</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            A new source is never active by default and can never auto-publish until its permission is confirmed Green — activating a
            source here only makes it eligible for a discovery run, it does not run one.
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2 max-w-2xl italic">{RIGHTS_STATUS_DISCLAIMER}</p>
        </div>
        <Link
          href="/admin/pulse/sources/new"
          className="inline-flex items-center min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold hover:bg-ordift-navy-900"
        >
          + Add Source
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-ordift-ink/10 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ordift-ink/10">
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Name</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Type / Classification</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Active</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Trust</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Rights</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Auto-Publish</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Last Discovery</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Discovery</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-ordift-ink/5 last:border-0 hover:bg-black/[0.02]">
                <td className="px-5 py-3">
                  <Link href={`/admin/pulse/sources/${s.id}`} className="font-sans text-body-small text-ordift-ink font-medium hover:text-ordift-gold-pressed">
                    {s.name}
                  </Link>
                </td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">
                  {s.sourceType}
                  <br />
                  {CLASSIFICATION_SHORT_LABEL[s.sourceClassification] ?? s.sourceClassification}
                </td>
                <td className="px-5 py-3 font-sans text-caption">
                  {s.isActive ? <span className="text-green-700">Active</span> : <span className="text-ordift-ink-muted">Inactive</span>}
                </td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{TRUST_LABEL[s.editorialTrustLevel]}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 font-sans text-caption font-semibold ${RIGHTS_PILL_CLASS[s.permissionClassification]}`} title={PERMISSION_LABEL[s.permissionClassification]}>
                    {s.permissionClassification}
                  </span>
                </td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{s.autoPublishEligible ? "Eligible" : "No"}</td>
                <td className="px-5 py-3">
                  <DiscoveryStatusText run={lastRunBySource.get(s.id)} />
                </td>
                <td className="px-5 py-3">
                  {s.isActive ? <RunDiscoveryButton sourceId={s.id} /> : <span className="font-sans text-caption text-ordift-ink-muted">Inactive</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
