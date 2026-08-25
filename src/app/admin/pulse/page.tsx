import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getPulseReviewQueue } from "@/lib/content/sanity/pulseAdmin";
import { PERMISSION_LABEL, TRUST_LABEL } from "@/lib/pulse/adminLabels";

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

  const queue = await getPulseReviewQueue();
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

      <QueueTable title={`Incoming (${incoming.length})`} items={incoming} />
      {rejected.length > 0 && <QueueTable title={`Rejected (${rejected.length})`} items={rejected} className="mt-10" />}
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
