import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listAssetAssignmentsForProfile, listAssetIncidentReportsForProfile, listCompanyAssets } from "@/lib/organization/assets";
import { listBusinessTravelAuthorizationsForProfile } from "@/lib/organization/businessTravel";
import { listPortfolioUseRequestsForProfile } from "@/lib/organization/portfolioUse";
import { listNeedsMyApprovalItems } from "@/lib/organization/approvalsCentre";
import { MyRequestsWorkspace } from "./MyRequestsWorkspace";

export const metadata: Metadata = {
  title: "My Requests — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service — My Requests (Phase B6 Step 6, 2026-09-15):
// asset incident reporting, business travel authorization, and
// portfolio-use requests. Every read is always scoped to the CURRENT
// user's own id.
export default async function MyRequestsPage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [assignments, assetIncidents, companyAssets, travelAuthorizations, portfolioUseRequests, needsMyApproval] = await Promise.all([
    listAssetAssignmentsForProfile(user.id),
    listAssetIncidentReportsForProfile(user.id),
    listCompanyAssets(),
    listBusinessTravelAuthorizationsForProfile(user.id),
    listPortfolioUseRequestsForProfile(user.id),
    listNeedsMyApprovalItems(user.id),
  ]);

  const assetById = new Map(companyAssets.map((a) => [a.id, a]));
  const assignmentOptions = assignments
    .filter((a) => a.status === "issued")
    .map((a) => ({ id: a.id, label: (() => { const asset = assetById.get(a.assetId); return asset ? `${asset.assetIdentifier} — ${asset.description}` : a.assetId; })() }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">My Requests</h1>
      </div>

      {needsMyApproval.length > 0 && (
        <section className="mb-8 rounded-xl border border-ordift-gold/40 bg-white p-6">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Needs My Approval / Action</h2>
          <p className="font-sans text-caption text-ordift-ink-muted mb-4">
            Aggregated across every governed workflow you hold approval authority over — each item links to the real
            page where the decision is made; nothing is decided here.
          </p>
          <ul className="divide-y divide-black/5">
            {needsMyApproval.map((item) => (
              <li key={`${item.domain}-${item.id}`} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={item.href} className="font-sans text-body-small font-semibold text-ordift-gold-pressed underline underline-offset-4">
                    {item.title}
                  </Link>
                  <p className="font-sans text-caption text-ordift-ink-muted">{item.subtitle}</p>
                </div>
                <span className="shrink-0 font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MyRequestsWorkspace
        assignmentOptions={assignmentOptions}
        assetIncidents={assetIncidents.map((i) => ({ id: i.id, incidentType: i.incidentType, description: i.description, determination: i.determination, reportedAt: i.reportedAt }))}
        travelAuthorizations={travelAuthorizations.map((t) => ({ id: t.id, destinationCountry: t.destinationCountry, purpose: t.purpose, status: t.status, createdAt: t.createdAt }))}
        portfolioUseRequests={portfolioUseRequests.map((p) => ({ id: p.id, description: p.description, status: p.status, createdAt: p.createdAt }))}
      />
    </div>
  );
}
