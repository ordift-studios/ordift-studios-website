import { createAdminClient } from "@/lib/supabase/admin";

// The market an enquiry belongs to (its payment country) and the service it asked about. A plain read of the enquiry, kept here, in the organisation module, so that the contracting-entity
// section can show the market suggestion without importing any commercial (quotation, pricing, payment) code. Used by the quotation entity advice as well.
export async function loadEnquiryMarket(enquiryId: string | null): Promise<{ country: string | null; service: string | null }> {
  if (!enquiryId) return { country: null, service: null };
  const { data } = await createAdminClient().from("enquiries").select("payment_country, service").eq("id", enquiryId).maybeSingle();
  const e = data as { payment_country?: string | null; service?: string | null } | null;
  return { country: e?.payment_country ?? null, service: e?.service ?? null };
}
