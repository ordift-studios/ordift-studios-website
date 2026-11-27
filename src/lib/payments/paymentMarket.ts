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

// What the stored market MEANS. An enquiry with no market stored is two different things:
//  * a website or earlier enquiry (not recorded by staff): NULL has always meant "existing behaviour" (Ghana / Paystack), and is left exactly as it was;
//  * an enquiry a STAFF MEMBER recorded (created_by is set: WhatsApp, a call, a visit): nobody has chosen a market, and the client may be anywhere. No online payment route is
//    offered until a Super Admin selects one. Defaulting such a client to Ghana/Paystack in GHS would be a route nobody agreed to.
export type PaymentMarketState =
  | { state: "selected"; market: PaymentCountry }
  | { state: "legacy_default"; market: "GH" }
  | { state: "unselected"; market: null };

export function resolvePaymentMarketState(row: { payment_country: string | null; created_by: string | null } | null | undefined, entityType: string): PaymentMarketState {
  if (entityType !== "enquiry") return { state: "legacy_default", market: "GH" };
  if (row && isPaymentCountry(row.payment_country)) return { state: "selected", market: row.payment_country };
  if (row && row.created_by) return { state: "unselected", market: null };
  return { state: "legacy_default", market: "GH" };
}

export async function getEntityPaymentMarketState(entityType: PaymentEntityType | string, entityId: string): Promise<PaymentMarketState> {
  if (entityType !== "enquiry") return resolvePaymentMarketState(null, entityType);
  const { data } = await createAdminClient().from("enquiries").select("payment_country, created_by").eq("id", entityId).maybeSingle();
  return resolvePaymentMarketState((data as { payment_country: string | null; created_by: string | null } | null) ?? null, entityType);
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

// For the admin control: the raw stored value plus whether the enquiry was recorded by staff (so "not selected" can be shown as exactly that).
export async function getStoredPaymentMarket(enquiryId: string): Promise<{ stored: string | null; staffRecorded: boolean }> {
  const { data } = await createAdminClient().from("enquiries").select("payment_country, created_by").eq("id", enquiryId).maybeSingle();
  return { stored: (data?.payment_country as string | null) ?? null, staffRecorded: Boolean(data?.created_by) };
}
