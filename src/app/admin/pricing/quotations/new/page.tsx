import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listActivePricingMarkets } from "@/lib/commercial/pricingCatalog";
import { NewQuotationForm } from "./NewQuotationForm";

export const metadata: Metadata = {
  title: "New Quotation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function NewQuotationPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [usersResult, markets] = await Promise.all([listUsersWithRoles(), listActivePricingMarkets()]);
  const clients = usersResult.ok
    ? usersResult.users.filter((u) => u.roles.includes("client")).map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
    : [];

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href="/admin/pricing/quotations" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Client Quotations
        </Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">New Quotation</h1>
      </div>
      <NewQuotationForm clients={clients} markets={markets} />
    </div>
  );
}
