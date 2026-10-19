import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listActivePricingMarkets } from "@/lib/commercial/pricingCatalog";
import { NewQuotationForm, type EnquiryContext } from "./NewQuotationForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { listActiveCurrencies } from "@/lib/payments/currency";

export const metadata: Metadata = {
  title: "New Quotation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ enquiryId?: string }> }) {
  const { enquiryId } = await searchParams;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [usersResult, markets] = await Promise.all([listUsersWithRoles(), listActivePricingMarkets()]);
  const clients = usersResult.ok
    ? usersResult.users.filter((u) => u.roles.includes("client")).map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
    : [];

  // M2a: "Create a quotation for this enquiry". The client details are prefilled from the enquiry (never from a placeholder address). A portal account becomes
  // the registered Client; otherwise the prospect fields are used. The enquiry's Crew Support and one-active-quotation rules are enforced when it is saved.
  let enquiry: EnquiryContext | undefined;
  if (enquiryId) {
    const admin = createAdminClient();
    const { data: e } = await admin.from("enquiries").select("id, reference_number, user_id, full_name, email, phone, payment_country, commercial_intent").eq("id", enquiryId).maybeSingle();
    if (e && e.commercial_intent !== "creative_crew_support") {
      const market = e.payment_country ? await (await createClient()).from("payment_country_config").select("default_currency_code").eq("country", e.payment_country).maybeSingle() : { data: null };
      enquiry = {
        id: e.id,
        reference: e.reference_number,
        clientProfileId: e.user_id && clients.some((c) => c.id === e.user_id) ? e.user_id : null,
        prospectName: e.full_name ?? "",
        prospectEmail: isPlaceholderEmail(e.email) ? "" : e.email ?? "",
        prospectPhone: e.phone ?? "",
        defaultCurrency: (market.data as { default_currency_code: string } | null)?.default_currency_code ?? "USD",
      };
    }
  }
  const currencies = (await listActiveCurrencies()).map((c) => c.code);

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href="/admin/pricing/quotations" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Client Quotations
        </Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">New Quotation</h1>
      </div>
      {enquiryId && !enquiry ? <p className="font-sans text-body-small text-red-700 mb-4">That enquiry cannot have an ordinary quotation (not found, or it is a Creative Crew Support enquiry).</p> : null}
      {enquiry ? <p className="font-sans text-body-small text-ordift-ink-muted mb-4">For enquiry {enquiry.reference}. Details are prefilled; nothing is saved until you create the quotation.</p> : null}
      <NewQuotationForm clients={clients} markets={markets} enquiry={enquiry} currencies={currencies} />
    </div>
  );
}
