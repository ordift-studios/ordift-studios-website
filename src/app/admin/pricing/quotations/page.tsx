import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listClientQuotations } from "@/lib/commercial/clientQuotations";

export const metadata: Metadata = {
  title: "Client Quotations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-black/5 text-ordift-ink-muted",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
  superseded: "bg-black/5 text-ordift-ink-muted",
};

// Universal Commercial Rate Card & Quotation System, selling side
// (2026-09-16) — client-facing quotations, distinct from the internal
// Pricing engine's rate tables (which this reuses conceptually, never
// duplicates) and from Vendor Rate Cards (cost-side, admin-only,
// completely separate table — see migration 0134's own comment).
export default async function ClientQuotationsPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const quotations = await listClientQuotations();

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Pricing</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Client Quotations</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Formal, versioned quotations for registered Clients and offline prospects. Selling-side only — provider
            cost and internal margin are never stored or shown here.
          </p>
        </div>
        <Link href="/admin/pricing/quotations/new" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
          New Quotation
        </Link>
      </div>

      {quotations.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No quotations yet.</p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10">
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Reference</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Client / Prospect</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Total</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Status</th>
                <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Valid Until</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="px-4 py-2">
                    <Link href={`/admin/pricing/quotations/${q.id}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                      {q.quotationReference}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink">
                    {q.clientName ?? q.prospectName ?? "—"} {q.prospectCompany ? `(${q.prospectCompany})` : ""}
                  </td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink tabular-nums">{q.currency} {q.total.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${STATUS_STYLES[q.status] ?? "bg-black/5"}`}>{q.status}</span>
                  </td>
                  <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted">{q.validUntil ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
