import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { listAssetAssignmentsForProfile, listAssetIncidentReportsForProfile, listCompanyAssets } from "@/lib/organization/assets";
import { listBusinessTravelAuthorizationsForProfile } from "@/lib/organization/businessTravel";
import { listPortfolioUseRequestsForProfile } from "@/lib/organization/portfolioUse";
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

  const [assignments, assetIncidents, companyAssets, travelAuthorizations, portfolioUseRequests] = await Promise.all([
    listAssetAssignmentsForProfile(user.id),
    listAssetIncidentReportsForProfile(user.id),
    listCompanyAssets(),
    listBusinessTravelAuthorizationsForProfile(user.id),
    listPortfolioUseRequestsForProfile(user.id),
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

      <MyRequestsWorkspace
        assignmentOptions={assignmentOptions}
        assetIncidents={assetIncidents.map((i) => ({ id: i.id, incidentType: i.incidentType, description: i.description, determination: i.determination, reportedAt: i.reportedAt }))}
        travelAuthorizations={travelAuthorizations.map((t) => ({ id: t.id, destinationCountry: t.destinationCountry, purpose: t.purpose, status: t.status, createdAt: t.createdAt }))}
        portfolioUseRequests={portfolioUseRequests.map((p) => ({ id: p.id, description: p.description, status: p.status, createdAt: p.createdAt }))}
      />
    </div>
  );
}
