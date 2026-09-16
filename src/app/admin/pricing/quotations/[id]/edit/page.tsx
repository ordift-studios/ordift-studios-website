import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getClientQuotation } from "@/lib/commercial/clientQuotations";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listActivePricingMarkets } from "@/lib/commercial/pricingCatalog";
import { NewQuotationForm, type QuotationFormInitialData } from "../../new/NewQuotationForm";

export const metadata: Metadata = {
  title: "Edit Quotation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Task 1 — Client Quotation record management (2026-09-16). Draft only
// — updateClientQuotationDraft() itself refuses anything else; this
// page also redirects away cleanly rather than showing a form that
// would just error on submit.
export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const quotation = await getClientQuotation(id);
  if (!quotation) notFound();
  if (quotation.status !== "draft") redirect(`/admin/pricing/quotations/${id}`);

  const [usersResult, markets] = await Promise.all([listUsersWithRoles(), listActivePricingMarkets()]);
  const clients = usersResult.ok
    ? usersResult.users.filter((u) => u.roles.includes("client")).map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
    : [];

  const editing: QuotationFormInitialData = {
    quotationId: quotation.id,
    partyType: quotation.clientProfileId ? "client" : "prospect",
    clientProfileId: quotation.clientProfileId,
    prospectName: quotation.prospectName ?? "",
    prospectCompany: quotation.prospectCompany ?? "",
    prospectEmail: quotation.prospectEmail ?? "",
    prospectPhone: quotation.prospectPhone ?? "",
    items: quotation.items.map((i) => ({
      serviceItem: i.serviceItem,
      description: i.description ?? "",
      quantity: String(i.quantity),
      unitBasis: i.unitBasis,
      sellingRate: String(i.sellingRate),
      discountPercent: i.discountPercent != null ? String(i.discountPercent) : "",
      taxPercent: i.taxPercent != null ? String(i.taxPercent) : "",
      sourceType: i.sourceType,
      sourceReference: i.sourceReference ?? "",
    })),
    currency: quotation.currency,
    validUntil: quotation.validUntil ?? "",
    paymentBookingTerms: quotation.paymentBookingTerms ?? "",
    commercialNotes: quotation.commercialNotes ?? "",
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <Link href={`/admin/pricing/quotations/${id}`} className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← {quotation.quotationReference}
        </Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">Edit Quotation</h1>
      </div>
      <NewQuotationForm clients={clients} markets={markets} editing={editing} />
    </div>
  );
}
