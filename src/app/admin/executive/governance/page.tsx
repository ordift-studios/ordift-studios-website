import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { isExecutiveAdmin, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";

export const metadata: Metadata = {
  title: "Governance — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// CHANCELLOR's jurisdiction hub — an honest gap report, not a
// fabricated dashboard. No corporate-records/contract/compliance-
// tracking table or workflow exists anywhere in Production. The
// approved capability taxonomy (GOVERNANCE_CAPABILITIES, Phase 3.4) is
// already defined and ready for when real functionality is built.
export default async function ExecutiveGovernancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const superAdmin = isSuperAdmin(user);
  if (!superAdmin && !(await isExecutiveAdmin(user.id))) redirect("/admin/executive");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">CHANCELLOR · Governance</h1>
      </div>
      <div className="rounded-xl border border-black/10 bg-white p-6 max-w-2xl">
        <p className="font-sans text-body-small text-ordift-ink">
          No Governance/Records/Policy/Compliance/Contract functionality exists in Production yet. This is reported
          honestly rather than represented with placeholder metrics or fabricated data. CHANCELLOR administers
          governance workflow and liaises with external counsel where such functionality is eventually built — never
          represented as providing licensed legal advice.
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          The approved capability taxonomy is already defined and dormant, ready to wire up once real functionality
          is built: {Object.values(GOVERNANCE_CAPABILITIES).join(", ")}.
        </p>
      </div>
    </div>
  );
}
