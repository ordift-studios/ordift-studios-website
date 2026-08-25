import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getVenuesAdmin } from "@/lib/content/sanity/workshopAdmin";
import WorkshopForm from "../WorkshopForm";
import { createWorkshopAction } from "../actions";

export const metadata: Metadata = {
  title: "New Workshop — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function NewWorkshopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok && !isSuperAdmin(user)) redirect("/admin/workshops");

  const venues = await getVenuesAdmin();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">New Workshop</h1>
      </div>
      <WorkshopForm action={createWorkshopAction} venues={venues} submitLabel="Create Workshop" />
    </div>
  );
}
