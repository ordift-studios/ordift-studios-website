import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { listCrewSupportRequests } from "@/lib/crewSupport/admin";
import { CREW_SUPPORT_STATUSES, SERVICE_FAMILIES, STATUS_LABELS } from "@/lib/crewSupport/config";

export const metadata: Metadata = { title: "Crew Support — Ordift Studios Admin", robots: { index: false, follow: false } };

function dateRange(start: string, end: string) {
  return start === end ? start : `${start} → ${end}`;
}

export default async function AdminCrewSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!canManageCrewSupport(user)) redirect("/admin/overview");
  const { status } = await searchParams;
  const activeStatus = (CREW_SUPPORT_STATUSES as readonly string[]).includes(status ?? "") ? status : undefined;
  const rows = await listCrewSupportRequests(activeStatus);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Client &amp; Commercial</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Creative Crew Support</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Requests from professionals who lead their own project and need Ordift crew. A request is an enquiry, not a booking — availability is only confirmed by staff.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/crew-support" className={`rounded-full border px-3 py-1 font-sans text-caption ${!activeStatus ? "border-ordift-ink bg-ordift-ink text-white" : "border-black/15 text-ordift-ink-muted"}`}>All</Link>
        {CREW_SUPPORT_STATUSES.map((s) => (
          <Link key={s} href={`/admin/crew-support?status=${s}`} className={`rounded-full border px-3 py-1 font-sans text-caption ${activeStatus === s ? "border-ordift-ink bg-ordift-ink text-white" : "border-black/15 text-ordift-ink-muted"}`}>{STATUS_LABELS[s]}</Link>
        ))}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-4 sm:p-6 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No Crew Support requests{activeStatus ? " with this status" : " yet"}.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                <th className="pb-2 pr-4">Reference</th><th className="pb-2 pr-4">Requester / lead</th><th className="pb-2 pr-4">Project</th><th className="pb-2 pr-4">Dates</th><th className="pb-2 pr-4">Crew</th><th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => (
                <tr key={r.id} className="font-sans text-body-small text-ordift-ink align-top">
                  <td className="py-2 pr-4"><Link href={`/admin/crew-support/${r.id}`} className="text-ordift-gold-pressed underline underline-offset-4">{r.referenceNumber}</Link></td>
                  <td className="py-2 pr-4">{r.requesterName}{r.requesterCompany ? ` · ${r.requesterCompany}` : ""}{r.leadCompany ? <span className="block text-caption text-ordift-ink-muted">Lead: {r.leadCompany}</span> : null}</td>
                  <td className="py-2 pr-4">{r.projectName}<span className="block text-caption text-ordift-ink-muted">{SERVICE_FAMILIES.find((f) => f.value === r.serviceFamily)?.label ?? r.serviceFamily} · {r.location}</span></td>
                  <td className="py-2 pr-4 whitespace-nowrap">{dateRange(r.startDate, r.endDate)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.slotsAssigned}/{r.slotsTotal} assigned</td>
                  <td className="py-2">{STATUS_LABELS[r.status]}{r.urgency === "urgent" ? <span className="block text-caption text-red-700">Urgent</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
