import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentEntityType } from "@/lib/payments/types";

// Which payment market a client's Pay Now flow belongs to. NULL / unset = the existing behaviour
// (Ghana, Paystack) — nothing about Ghana changes. 'QA' = Direct Bank Transfer into the active
// default Qatar receiving account, and is NEVER routed through the Ghana Paystack merchant.
export type PaymentCountry = "GH" | "QA";

export const PAYMENT_MARKETS: Record<PaymentCountry, { label: string; currency: string; bankTransferOnly: boolean }> = {
  GH: { label: "Ghana", currency: "GHS", bankTransferOnly: false },
  QA: { label: "Qatar", currency: "QAR", bankTransferOnly: true },
};

export function isPaymentCountry(value: unknown): value is PaymentCountry {
  return value === "GH" || value === "QA";
}

// Server-authoritative: reads the entity's own stored market (never a client-supplied value).
// Workshop registrations are always Ghana.
export async function getEntityPaymentCountry(entityType: PaymentEntityType | string, entityId: string): Promise<PaymentCountry> {
  if (entityType !== "enquiry") return "GH";
  const { data } = await createAdminClient().from("enquiries").select("payment_country").eq("id", entityId).maybeSingle();
  return isPaymentCountry(data?.payment_country) ? data.payment_country : "GH";
}

// The raw stored value (null = unset), for the admin control — unlike getEntityPaymentCountry it
// does not default to Ghana.
export async function getStoredPaymentCountry(enquiryId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("enquiries").select("payment_country").eq("id", enquiryId).maybeSingle();
  return (data?.payment_country as string | null) ?? null;
}
