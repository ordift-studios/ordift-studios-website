import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getAllEnquiries, getAllWorkshopRegistrations, crmStageLabel } from "@/lib/portal/data";

export const metadata: Metadata = {
  title: "Staff — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function StaffPortalPage() {
  const user = await getCurrentUser();
  if (!isStaffOrAdmin(user)) redirect("/portal");

  const [enquiries, registrations] = await Promise.all([
    getAllEnquiries(),
    getAllWorkshopRegistrations(),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Staff
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Operations Overview
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Read-only view of the most recent enquiries and workshop
          registrations. The Google Sheet stays the record of truth for
          editing status, payments, and internal notes.
        </p>
      </div>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">
          Recent Enquiries ({enquiries.length})
        </h2>
        {enquiries.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No enquiries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Reference</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Service</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Stage</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((e) => (
                  <tr key={e.id} className="border-b border-black/5">
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink">{e.referenceNumber}</td>
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink capitalize">
                      {e.service.replace(/-/g, " ")}
                    </td>
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink-muted">
                      {crmStageLabel(e.crmStage)}
                    </td>
                    <td className="py-3 font-sans text-body-small text-ordift-ink-muted">
                      {formatDate(e.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">
          Recent Workshop Registrations ({registrations.length})
        </h2>
        {registrations.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No registrations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Reference</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Workshop</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">Status</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3">Registered</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => (
                  <tr key={r.id} className="border-b border-black/5">
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink">{r.registrationReference}</td>
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink">{r.workshopTitle}</td>
                    <td className="py-3 pr-4 font-sans text-body-small text-ordift-ink-muted">
                      {r.registrationStatus}
                      {r.registrationStatus === "Waitlisted" && r.waitingListPosition
                        ? ` (${r.waitingListPosition})`
                        : ""}
                    </td>
                    <td className="py-3 font-sans text-body-small text-ordift-ink-muted">
                      {formatDate(r.registrationDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
