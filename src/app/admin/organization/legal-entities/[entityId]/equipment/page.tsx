import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getEmployingEntityById } from "@/lib/organization/legalEntities";
import { loadEquipmentPanelData } from "@/lib/organization/equipmentFinancing";
import { EquipmentPanel } from "./EquipmentPanel";

export const metadata: Metadata = { title: "Equipment & Financing — Ordift Studios Admin", robots: { index: false, follow: false } };

// Super Admin only (re-checked here, in every action, in the library and in the database). Reads only; the panel's two forms are the only writes.
export default async function EquipmentFinancingPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/organization");
  const entity = await getEmployingEntityById(entityId);
  if (!entity) notFound();
  const data = await loadEquipmentPanelData(entityId, user.id, entity.legalName ?? entity.name);
  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Legal Entities</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Equipment &amp; Financing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">{entity.legalName ?? entity.name} · <Link href={`/admin/organization/legal-entities/${entityId}`} className="underline underline-offset-4">← Legal entity</Link></p>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-3xl">
          Acquisition cost, financing liability, actual payments and accounting expense are kept apart. A payment recorded here is <strong>reported</strong>, never bank-reconciled; statement reconciliation is a later, separate step.
          The accounting treatment stays pending professional advice. Nothing here creates an expense, a journal entry or a bank movement.
        </p>
      </div>
      <EquipmentPanel entityId={entityId} views={data.views} invoiceDocs={data.invoiceDocs} financialDocs={data.financialDocs} />
    </div>
  );
}
