import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listStatutoryWageRules } from "@/lib/organization/statutoryWageEngine";
import { listEmploymentJurisdictions } from "@/lib/portal/adminData";
import { listActiveStaffRoster } from "@/lib/organization/hrDashboard";
import { StatutoryWagesWorkspace } from "./StatutoryWagesWorkspace";

export const metadata: Metadata = {
  title: "Statutory Wages — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 4 (2026-09-15) —
// Jurisdiction-Aware Statutory Wage Engine. Super-Admin-only: statutory
// wage floors are foundational legal/compliance data, same tier as
// Legal Entity registration.
export default async function StatutoryWagesPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/organization");

  const [rules, jurisdictions, staffRoster] = await Promise.all([
    listStatutoryWageRules(),
    listEmploymentJurisdictions(),
    listActiveStaffRoster(),
  ]);

  const jurisdictionNameById = new Map(jurisdictions.map((j) => [j.id, j.name]));
  const ruleViews = rules.map((r) => ({
    id: r.id,
    jurisdictionName: jurisdictionNameById.get(r.jurisdictionId) ?? "Unknown jurisdiction",
    rateBasis: r.rateBasis,
    rateAmount: r.rateAmount,
    currency: r.currency,
    monthlyConversionFactor: r.monthlyConversionFactor,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    verificationStatus: r.verificationStatus,
    sourceAuthority: r.sourceAuthority,
    notes: r.notes,
  }));
  const jurisdictionOptions = jurisdictions.map((j) => ({ id: j.id, name: j.name }));
  const staffOptions = staffRoster.map((s) => ({ id: s.profileId, name: s.fullName ?? "(no name on record)" }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People &amp; Organization</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Statutory Wages</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Each jurisdiction&rsquo;s statutory wage floor, kept in its own native legal basis. No calculation happens invisibly
          — every compliance check shows the exact rule and reasoning used.
        </p>
      </div>

      <StatutoryWagesWorkspace rules={ruleViews} jurisdictionOptions={jurisdictionOptions} staffOptions={staffOptions} />
    </div>
  );
}
