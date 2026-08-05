import type { Metadata } from "next";
import { getRecentActivity } from "@/lib/admin/activityLog";

export const metadata: Metadata = {
  title: "Activity — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const ACTION_LABELS: Record<string, string> = {
  "role.grant": "Granted a role",
  "role.revoke": "Revoked a role",
  "enquiry.stage_change": "Changed enquiry stage",
  "enquiry.note_added": "Added an enquiry note",
  "flag.toggle": "Toggled a feature flag",
  "booking.status_change": "Changed booking status",
  "deliverable.published": "Published a deliverable",
  "deliverable.removed": "Removed a deliverable",
  "project_request.decided": "Decided a project request",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTIVITY_PAGE_LIMIT = 100;

export default async function AdminActivityPage() {
  const activity = await getRecentActivity(ACTIVITY_PAGE_LIMIT);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Activity
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Last {activity.length} action{activity.length === 1 ? "" : "s"} across the Admin Platform.
        </p>
      </div>

      {activity.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No activity recorded yet.</p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
          {activity.map((entry) => (
            <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-sans text-body-small text-ordift-ink">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                  {entry.actorUserId ? ` — ${entry.actorLabel}` : ""}
                </p>
                {(entry.entityType || entry.actorRoleLabel || entry.actorDepartment) && (
                  <p className="font-sans text-caption text-ordift-ink-muted">
                    {[
                      entry.entityType ? `${entry.entityType}${entry.entityId ? ` · ${entry.entityId}` : ""}` : null,
                      entry.actorRoleLabel,
                      entry.actorDepartment,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                {formatDateTime(entry.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
