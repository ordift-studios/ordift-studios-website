import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getEmployingEntityById, getEmployingEntitySensitiveDetails, listProfileIdsForEmployingEntity } from "@/lib/organization/legalEntities";
import { listEntityExpenses, listEntityRegistrations, listEntitySignatories, listVaultDocuments } from "@/lib/organization/entityRegistrations";
import { REGISTRATION_LABELS, trackCompliance } from "@/lib/organization/entityRegistry";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { EntityDetailWorkspace } from "./EntityDetailWorkspace";
import { EntityRegistryPanels } from "./EntityRegistryPanels";

export const metadata: Metadata = {
  title: "Legal Entity — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function LegalEntityDetailPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/organization");

  const entity = await getEmployingEntityById(entityId);
  if (!entity) notFound();

  const [sensitiveDetails, vaultDocuments, profileIds, usersResult, registrations, signatories, expenses] = await Promise.all([
    getEmployingEntitySensitiveDetails(entityId, user.id),
    listVaultDocuments(entityId, user.id),
    listProfileIdsForEmployingEntity(entityId),
    listUsersWithRoles(),
    listEntityRegistrations(entityId, user.id),
    listEntitySignatories(entityId, user.id),
    listEntityExpenses(entityId, user.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const tracked = trackCompliance(registrations, today);

  const nameById = new Map<string, string>();
  if (usersResult.ok) {
    for (const u of usersResult.users) nameById.set(u.id, u.fullName ?? u.email ?? u.id);
  }
  const staffNames = profileIds.map((id) => nameById.get(id) ?? "(no name on record)");

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Legal Entities</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{entity.legalName ?? entity.name}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href="/admin/organization/legal-entities" className="underline underline-offset-4">← Legal Entities</Link>
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Overview</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Jurisdiction: {entity.jurisdictionName ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Payroll jurisdiction: {entity.payrollJurisdictionName ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Registration type: {entity.registrationType ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Registration date: {entity.registrationDate ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Effective from: {entity.effectiveFrom ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Default currency: {entity.defaultCurrency ?? "Not set"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Employer-capable: {entity.employerCapable ? "Yes" : "No"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Verification: {entity.verificationStatus.replace(/_/g, " ")}{entity.verifiedAt ? ` (${new Date(entity.verifiedAt).toLocaleDateString()})` : ""}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Staff Assigned ({staffNames.length})</h2>
          {staffNames.length > 0 ? (
            <ul className="space-y-1">
              {staffNames.map((name, i) => (
                <li key={i} className="font-sans text-caption text-ordift-ink-muted">· {name}</li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No one currently has this entity recorded as their current employment terms — this is expected for staff hired before the effective-dated employment-terms history began being populated.</p>
          )}
        </div>
      </section>

      <EntityDetailWorkspace entityId={entityId} registrationNumber={sensitiveDetails?.registrationNumber ?? null} taxIdentifier={sensitiveDetails?.taxIdentifier ?? null} registeredAddress={sensitiveDetails?.registeredAddress ?? null} documents={[]} hideDocuments />
      <EntityRegistryPanels
        entityId={entityId}
        tracked={tracked}
        registrations={registrations.map((r) => ({ id: r.id, kind: r.kind, label: REGISTRATION_LABELS[r.kind], status: r.status, identifier: r.identifier, issuedOn: r.issuedOn, expiresOn: r.expiresOn, note: r.note, facts: r.facts }))}
        signatories={signatories}
        documents={vaultDocuments}
        expenses={expenses}
        canonicalPermitPending={registrations.some((r) => r.kind === "commercial_permit")}
      />
    </div>
  );
}
