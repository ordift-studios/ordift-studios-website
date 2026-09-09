import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { listTalentOpportunitiesForAdmin } from "@/lib/talent/talentOverview";

export const metadata: Metadata = { title: "Opportunities — Ordift Studios Admin", robots: { index: false, follow: false } };

// Opportunities Admin (2026-09-09) — list view, same pattern as
// /admin/talent's own page: real Production rows only, no fixture
// data, an honest empty state until a real opportunity exists. This
// area is internal casting/opportunity records only — never a public
// listing, same boundary talent_opportunities' own migration comment
// already states.
export default async function AdminTalentOpportunitiesPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const canAdministerOpportunities = (await authorizeWithSuperAdminOverride(user.id, TALENT_CAPABILITIES.opportunityAdminister)).ok;
  const opportunities = await listTalentOpportunitiesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/talent" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
            ← Talent Management
          </Link>
          <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">Opportunities</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-1 max-w-xl">
            Internal casting/opportunity records only — never a public listing. Adding a candidate here never books or engages
            them; a real booking is always a separate, deliberate step through the existing engagement/Payables architecture.
          </p>
        </div>
        {canAdministerOpportunities && (
          <Link
            href="/admin/talent/opportunities/new"
            className="inline-flex items-center min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold hover:bg-ordift-navy-900"
          >
            + New Opportunity
          </Link>
        )}
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-white p-6">
          <p className="font-sans text-body-small text-ordift-ink-muted italic">No opportunities exist yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white overflow-x-auto -mx-2 p-6">
          <table className="min-w-full text-left font-sans text-body-small">
            <thead>
              <tr className="border-b border-black/10">
                {["Title", "Category", "Status", "Created"].map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold text-ordift-ink-muted uppercase tracking-wide text-caption">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id} className="border-b border-black/5">
                  <td className="px-2 py-2 align-top">
                    <Link href={`/admin/talent/opportunities/${o.id}`} className="font-semibold underline text-ordift-ink">
                      {o.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2 align-top text-ordift-ink">{o.categoryName ?? "—"}</td>
                  <td className="px-2 py-2 align-top">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold bg-black/5 text-ordift-ink">{o.status}</span>
                  </td>
                  <td className="px-2 py-2 align-top text-ordift-ink">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
