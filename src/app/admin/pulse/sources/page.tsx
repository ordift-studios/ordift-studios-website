import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseSourcesAdmin } from "@/lib/content/sanity/pulseAdmin";
import { PERMISSION_LABEL, TRUST_LABEL } from "@/lib/pulse/adminLabels";

export const metadata: Metadata = { title: "Pulse Sources — Ordift Studios Admin", robots: { index: false, follow: false } };

export default async function AdminPulseSourcesPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const sources = await getPulseSourcesAdmin();

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/pulse" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Back to Ordift Pulse
        </Link>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mt-4 mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pulse Sources</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          A new source is never active by default and can never auto-publish until its permission is confirmed Green — activating a
          source here only makes it eligible for a discovery run, it does not run one.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-ordift-ink/10 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ordift-ink/10">
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Name</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Type</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Active</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Trust</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Permission</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Auto-Publish</th>
              <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Last Policy Review</th>
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
                <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{s.sourceType}</td>
                <td className="px-5 py-3 font-sans text-caption">
                  {s.isActive ? <span className="text-green-700">Active</span> : <span className="text-ordift-ink-muted">Inactive</span>}
                </td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{TRUST_LABEL[s.editorialTrustLevel]}</td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{PERMISSION_LABEL[s.permissionClassification]}</td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{s.autoPublishEligible ? "Eligible" : "No"}</td>
                <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{s.lastPolicyReviewDate ?? "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
