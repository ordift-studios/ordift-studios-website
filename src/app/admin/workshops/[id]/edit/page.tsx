import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getWorkshopByIdAdmin, getVenuesAdmin } from "@/lib/content/sanity/workshopAdmin";
import WorkshopForm from "../../WorkshopForm";
import { updateWorkshopAction } from "../../actions";

export const metadata: Metadata = {
  title: "Edit Workshop — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function EditWorkshopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok && !isSuperAdmin(user)) redirect(`/admin/workshops/${id}`);

  const [workshop, venues] = await Promise.all([getWorkshopByIdAdmin(id), getVenuesAdmin()]);
  if (!workshop) notFound();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Edit Workshop</h1>
      </div>
      <WorkshopForm action={updateWorkshopAction} workshop={workshop} venues={venues} submitLabel="Save Changes" />
    </div>
  );
}
