import type { Metadata } from "next";
import Link from "next/link";
import { getOverviewStats } from "@/lib/admin/overview";
import { getRecentActivity } from "@/lib/admin/activityLog";
import ActiveUsersPanel from "@/components/admin/ActiveUsersPanel";

export const metadata: Metadata = {
  title: "Overview — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  "role.grant": "Granted a role",
  "role.revoke": "Revoked a role",
  "enquiry.stage_change": "Changed enquiry stage",
  "enquiry.note_added": "Added an enquiry note",
  "flag.toggle": "Toggled a feature flag",
  "booking.status_change": "Changed booking status",
};

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/10 bg-white p-6 hover:border-black/25 transition-colors"
    >
      <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">{label}</p>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{value}</p>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const [stats, activity] = await Promise.all([getOverviewStats(), getRecentActivity()]);

  return (
    <div className="space-y-12">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Overview
        </h1>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="New Enquiries (7 days)" value={stats.newEnquiriesThisWeek} href="/admin/enquiries" />
        <StatCard label="Open Workshops" value={stats.openWorkshopsCount} href="/admin/bookings" />
        <StatCard
          label="Pending Model Applications"
          value={stats.pendingModelApplications}
          href="/admin/users"
        />
        <StatCard
          label="Pending Vendor Applications"
          value={stats.pendingVendorApplications}
          href="/admin/users"
        />
      </section>

      <ActiveUsersPanel />

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No activity recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {activity.map((entry) => (
              <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {entry.actorName ? ` — ${entry.actorName}` : ""}
                  </p>
                  {entry.entityId && (
                    <p className="font-sans text-caption text-ordift-ink-muted">{entry.entityId}</p>
                  )}
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
