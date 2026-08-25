import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import {
  isExecutiveAdmin,
  OPERATIONS_CAPABILITIES,
  FINANCE_CAPABILITIES,
  PEOPLE_CAPABILITIES,
  IDENTITY_CAPABILITIES,
  getExecutivePositionOccupancy,
} from "@/lib/organization/authority";
import { listDepartmentRequests } from "@/lib/organization/departmentRequests";
import { listRecruitmentRequisitions } from "@/lib/recruitment/requisitions";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import { listAuthorityGrants, isGrantActive } from "@/lib/organization/authority";
import { getAllWorkshopsAdmin } from "@/lib/content/sanity/workshopAdmin";

export const metadata: Metadata = {
  title: "Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Unified Executive Administration Platform (2026-08-25). Every
// figure below is read from real, existing tables built in Phases
// 3.2-3.4 and Workshop Management V1, Phase B — nothing here is a
// placeholder/dummy metric. CHIEF/Super Admin sees every jurisdiction
// unconditionally, via the same authorizeWithSuperAdminOverride()
// pattern used throughout; empty G9 Positions never block this page or
// any jurisdiction hub — CHIEF operates entirely through the existing
// Super Admin override architecture, no fabricated grant is ever
// created to make this work.
export default async function ExecutiveCommandCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const superAdmin = isSuperAdmin(user);
  const execAdmin = await isExecutiveAdmin(user.id);
  if (!superAdmin && !execAdmin) redirect("/admin/overview");

  const EXECUTIVE_CALL_SIGNS = ["PRIME", "VAULT", "PULSE", "GEEK", "ARCHITECT", "CHANCELLOR"] as const;

  const [departmentRequests, requisitions, identities, obligations, grants, workshops, occupancy] = await Promise.all([
    listDepartmentRequests(),
    listRecruitmentRequisitions(),
    listCorporateIdentities(),
    listAllPaymentObligations(),
    listAuthorityGrants(),
    getAllWorkshopsAdmin(),
    getExecutivePositionOccupancy(EXECUTIVE_CALL_SIGNS),
  ]);

  const pendingDepartmentRequests = departmentRequests.filter((r) => r.status === "submitted").length;
  const pendingRequisitions = requisitions.filter((r) => r.requestStatus === "submitted").length;
  const identitiesReserved = identities.filter((i) => i.status === "reserved").length;
  const pendingObligations = obligations.filter((o) => o.status === "pending_approval").length;
  const activeGrants = grants.filter((g) => isGrantActive(g));
  const activeWorkshops = workshops.filter((w) => w.status === "open" || w.status === "coming-soon").length;

  const jurisdictions = [
    {
      key: "operations",
      callSign: "PRIME",
      title: "Operations",
      href: "/admin/executive/operations",
      summary: `${pendingDepartmentRequests} pending cross-department request(s) · ${activeWorkshops} active workshop(s)`,
      capability: OPERATIONS_CAPABILITIES.workshopAdminister,
    },
    {
      key: "finance",
      callSign: "VAULT",
      title: "Finance",
      href: "/admin/executive/finance",
      summary: `${pendingObligations} payment obligation(s) pending approval`,
      capability: FINANCE_CAPABILITIES.workshopRevenueView,
    },
    {
      key: "people",
      callSign: "PULSE",
      title: "People / HR",
      href: "/admin/executive/people",
      summary: `${pendingRequisitions} requisition(s) pending review`,
      capability: PEOPLE_CAPABILITIES.workshopEngagementAdminister,
    },
    {
      key: "technology",
      callSign: "GEEK",
      title: "Technology",
      href: "/admin/executive/technology",
      summary: `${identitiesReserved} corporate identity/identities reserved`,
      capability: IDENTITY_CAPABILITIES.view,
    },
    {
      key: "strategy",
      callSign: "ARCHITECT",
      title: "Strategy",
      href: "/admin/executive/strategy",
      summary: "No Strategy functionality exists in Production yet",
      capability: null,
    },
    {
      key: "governance",
      callSign: "CHANCELLOR",
      title: "Governance",
      href: "/admin/executive/governance",
      summary: "No Governance/Records functionality exists in Production yet",
      capability: null,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Executive</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Command Center — CHIEF/Super Admin has complete visibility across every jurisdiction below regardless of
          whether the corresponding Position is occupied. Each figure is read from real Production data, never a
          placeholder.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jurisdictions.map((j) => {
          const position = occupancy[j.callSign];
          return (
            <Link key={j.key} href={j.href} className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans font-semibold uppercase tracking-[0.15em] text-eyebrow text-ordift-gold-pressed">{j.callSign}</p>
                <span
                  className={`shrink-0 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${
                    position?.occupied ? "bg-green-50 text-green-800" : "bg-ordift-offwhite text-ordift-ink-muted"
                  }`}
                >
                  {position?.occupied ? "Occupied" : "Vacant"}
                </span>
              </div>
              <p className="font-serif text-card-title text-ordift-ink mt-1">{j.title}</p>
              {position?.occupied && position.occupantName && (
                <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{position.occupantName}</p>
              )}
              <p className="font-sans text-caption text-ordift-ink-muted mt-2">{j.summary}</p>
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Active Authority Grants</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">
          Standing and delegated authority currently in effect — see{" "}
          <Link href="/admin/authority" className="underline underline-offset-4">Authority</Link> to grant/revoke.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {activeGrants.map((g) => (
            <li key={g.id} className="px-4 py-2.5 font-sans text-caption text-ordift-ink-muted">
              {g.authority}{g.scopeDepartmentName ? ` · ${g.scopeDepartmentName}` : ""}{g.expiresAt ? " · delegated" : " · standing"}
            </li>
          ))}
          {activeGrants.length === 0 && (
            <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">
              None active — no GR.9 executive or Director Position is currently occupied and granted. CHIEF operates
              every jurisdiction above through Super Admin authority.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
