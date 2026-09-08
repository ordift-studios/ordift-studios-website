import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseReviewQueue } from "@/lib/content/sanity/pulseAdmin";
import { PERMISSION_LABEL, TRUST_LABEL } from "@/lib/pulse/adminLabels";
import { getLastPulseDiscoveryRun, type LastPulseDiscoveryRun } from "@/lib/pulse/pulseDiscoveryStatus";

export const metadata: Metadata = {
  title: "Ordift Pulse — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Minimum Admin review interface for Ordift Pulse (Phase D, 2026-08-24 —
// see PULSE_INGESTION_FOUNDATION.md). Admin/Super Admin gated, mirroring
// /admin/recruitment's gate — this surfaces external-sourced content and
// publishing controls, the same sensitivity class. Deliberately no
// analytics/charts/bulk actions — a list + a detail page, per explicit
// scope direction.
export default async function AdminPulsePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [queue, lastRun] = await Promise.all([getPulseReviewQueue(), getLastPulseDiscoveryRun()]);
  const incoming = queue.filter((item) => !item.isRejected);
  const rejected = queue.filter((item) => item.isRejected);

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Ordift Pulse</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Discovered drafts awaiting review. Nothing here is public until an Admin/Super Admin explicitly publishes it — discovery never
            auto-publishes.
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2 max-w-2xl">
            Published Pulse articles appear in{" "}
            <Link href="/journal" target="_blank" className="underline underline-offset-4">
              Ordift Stories
            </Link>{" "}
            alongside Ordift-original editorial content.
          </p>
        </div>
        <Link
          href="/admin/pulse/sources"
          className="inline-flex items-center min-h-10 px-4 rounded-md border border-black/15 font-sans text-body-small font-semibold text-ordift-ink hover:border-black/30"
        >
          Manage Sources →
        </Link>
      </div>

      <DiscoveryStatus lastRun={lastRun} />

      <QueueTable title={`Incoming (${incoming.length})`} items={incoming} />
      {rejected.length > 0 && <QueueTable title={`Rejected (${rejected.length})`} items={rejected} className="mt-10" />}
    </div>
  );
}

const STATUS_LABEL: Record<LastPulseDiscoveryRun["status"], string> = {
  successful: "Successful",
  completed_with_errors: "Completed with errors",
  interrupted: "Interrupted — did not finish",
};

const STATUS_COLOR: Record<LastPulseDiscoveryRun["status"], string> = {
  successful: "text-green-700",
  completed_with_errors: "text-amber-700",
  interrupted: "text-red-700",
};

const TRIGGER_LABEL: Record<LastPulseDiscoveryRun["trigger"], string> = {
  cron: "automatic",
  manual: "manual",
  unknown: "—",
};

// Adaptive Discovery Remediation, Part 4 (2026-09-08) — "the Founder
// should not need database access to know whether Pulse is alive."
// Deliberately restrained: no charts, no infrastructure-monitoring
// styling — a few plain facts, built entirely from the activity_log
// rows discovery already writes (pulseDiscoveryStatus.ts). The cadence
// line states the CONFIGURED schedule (a real, knowable fact — see
// vercel.json) rather than computing/guessing an actual next
// invocation time, which Vercel does not expose to the app.
function DiscoveryStatus({ lastRun }: { lastRun: LastPulseDiscoveryRun | null }) {
  return (
    <div className="mb-10 bg-white rounded-lg border border-ordift-ink/10 p-5 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Automatic Discovery</p>
        <p className="font-sans text-body-small text-ordift-ink">Runs daily at 03:00 UTC</p>
      </div>
      <div>
        <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Last Discovery</p>
        {lastRun ? (
          <p className="font-sans text-body-small text-ordift-ink">
            {new Date(lastRun.occurredAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <span className={STATUS_COLOR[lastRun.status]}>{STATUS_LABEL[lastRun.status]}</span>
            {" · "}
            {TRIGGER_LABEL[lastRun.trigger]}
          </p>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted italic">No discovery run has ever completed.</p>
        )}
      </div>
      {lastRun && lastRun.status !== "interrupted" && (
        <div>
          <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">New Drafts</p>
          <p className="font-sans text-body-small text-ordift-ink">
            {lastRun.created} of {lastRun.fetched} checked{lastRun.errorCount > 0 ? ` · ${lastRun.errorCount} error${lastRun.errorCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function QueueTable({
  title,
  items,
  className = "",
}: {
  title: string;
  items: Awaited<ReturnType<typeof getPulseReviewQueue>>;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">Nothing here.</p>
      ) : (
        <div className="bg-white rounded-lg border border-ordift-ink/10 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ordift-ink/10">
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Title</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Source</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Topic</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Region</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Trust</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Permission</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Duplicate</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Relevance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-ordift-ink/5 last:border-0 hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/pulse/${item.id}`} className="font-sans text-body-small text-ordift-ink font-medium hover:text-ordift-gold-pressed">
                      {item.title}
                    </Link>
                    {item.isFlaggedForReview && (
                      <span className="ml-2 inline-block rounded-full px-2 py-0.5 font-sans text-caption bg-amber-100 text-amber-800">
                        flagged for review
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{item.sourceName ?? "—"}</td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{item.categoryNames.join(", ") || "—"}</td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{item.regionNames.join(", ") || "—"}</td>
                  <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{TRUST_LABEL[item.sourceTrust]}</td>
                  <td className="px-5 py-3 font-sans text-caption text-ordift-ink-muted">{PERMISSION_LABEL[item.sourcePermission]}</td>
                  <td className="px-5 py-3 font-sans text-caption">
                    {item.isDuplicate ? (
                      <span className="text-amber-700" title={item.duplicateOfTitle ?? undefined}>
                        Possible duplicate
                      </span>
                    ) : (
                      <span className="text-ordift-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{item.relevanceScore?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
