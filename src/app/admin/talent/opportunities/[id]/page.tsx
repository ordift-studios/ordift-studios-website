import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getOpportunityDetailForAdmin, listCandidatesForOpportunity, listAvailableCandidatesForOpportunity } from "@/lib/talent/talentOverview";
import { OpportunityStatusForm } from "./OpportunityStatusForm";
import { AddCandidateForm } from "./AddCandidateForm";
import { CandidateStatusForm } from "./CandidateStatusForm";

export const metadata: Metadata = { title: "Opportunity — Ordift Studios Admin", robots: { index: false, follow: false } };

// Opportunities Admin (2026-09-09) — per-opportunity management page,
// same pattern as /admin/talent/[id]/page.tsx. Every write goes
// through actions.ts, which goes through the existing, DORMANT
// talent.opportunity.administer capability — this page renders the
// forms regardless of who's viewing (matching every other admin page's
// convention here), the underlying action call is the real
// authorization boundary. Adding or transitioning a candidate never
// creates an engagement, payment_obligation, or any Payables record —
// that remains a separate, later, deliberate staff action.
export default async function AdminOpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const { id } = await params;
  const [opportunity, candidates, availableCandidates] = await Promise.all([
    getOpportunityDetailForAdmin(id),
    listCandidatesForOpportunity(id),
    listAvailableCandidatesForOpportunity(id),
  ]);
  if (!opportunity) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/talent/opportunities" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Opportunities
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">{opportunity.title}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
          {opportunity.categoryName ?? "No category"} · Created {new Date(opportunity.createdAt).toLocaleDateString()}
        </p>
        {opportunity.description && <p className="font-sans text-body-small text-ordift-ink mt-3 max-w-2xl">{opportunity.description}</p>}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Status</h2>
        <OpportunityStatusForm opportunityId={opportunity.id} currentStatus={opportunity.status} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Candidates</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Adding or updating a candidate here never books or engages them — a real confirmed booking is always a separate,
          deliberate step through the existing engagement/Payables architecture.
        </p>
        {candidates.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted italic">No candidates yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-left font-sans text-body-small">
              <thead>
                <tr className="border-b border-black/10">
                  {["Talent", "Status", "Added"].map((h) => (
                    <th key={h} className="px-2 py-2 font-semibold text-ordift-ink-muted uppercase tracking-wide text-caption">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.candidacyId} className="border-b border-black/5">
                    <td className="px-2 py-2 align-top">
                      <Link href={`/admin/talent/${c.profileId}`} className="font-semibold underline text-ordift-ink">
                        {c.memberNumber ?? c.name ?? c.profileId}
                      </Link>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <CandidateStatusForm candidacyId={c.candidacyId} opportunityId={opportunity.id} profileId={c.profileId} currentStatus={c.status} />
                    </td>
                    <td className="px-2 py-2 align-top text-ordift-ink-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddCandidateForm opportunityId={opportunity.id} candidates={availableCandidates} />
      </section>
    </div>
  );
}
