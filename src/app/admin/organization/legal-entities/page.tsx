import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listEmployingEntities, countActiveStaffByEmployingEntity } from "@/lib/organization/legalEntities";
import { listEmploymentJurisdictions } from "@/lib/portal/adminData";
import { LegalEntitiesWorkspace } from "./LegalEntitiesWorkspace";

export const metadata: Metadata = {
  title: "Legal Entities — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 1 (2026-09-15) —
// Legal Entity / Operating-Jurisdiction foundation. Super-Admin-only:
// registration facts and evidence are foundational legal/compliance
// data. Built to scale to Qatar, then any future jurisdiction, without
// redesign — a new entity is a form submission, not a schema change.
export default async function LegalEntitiesPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/organization");

  const [entities, staffCounts, jurisdictions] = await Promise.all([
    listEmployingEntities(),
    countActiveStaffByEmployingEntity(),
    listEmploymentJurisdictions(),
  ]);

  const entityViews = entities.map((e) => ({
    id: e.id,
    name: e.name,
    legalName: e.legalName,
    tradingName: e.tradingName,
    jurisdictionName: e.jurisdictionName,
    registrationType: e.registrationType,
    registrationDate: e.registrationDate,
    active: e.active,
    employerCapable: e.employerCapable,
    defaultCurrency: e.defaultCurrency,
    verificationStatus: e.verificationStatus,
    staffCount: staffCounts[e.id] ?? 0,
  }));

  const jurisdictionOptions = jurisdictions.map((j) => ({ id: j.id, name: j.name }));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People &amp; Organization</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Legal Entities</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Every Ordift legal/registered business entity, its jurisdiction, and verification status. Registration number, tax
          identifier, and evidence documents are restricted to Super Admin on each entity&rsquo;s own page.
        </p>
      </div>

      <LegalEntitiesWorkspace entities={entityViews} jurisdictionOptions={jurisdictionOptions} />
    </div>
  );
}
