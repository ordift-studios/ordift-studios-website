import { createClient } from "@/lib/supabase/server";
import { paystackProvider } from "@/lib/payments/providers/paystack";
import type { PaymentProvider } from "@/lib/payments/types";

// Config-driven country -> provider resolution (architecture proposal
// §3) — adding a country later means a payment_country_config row plus
// a new class implementing PaymentProvider, never a change here or in
// any booking/workshop/checkout code. Only Paystack is registered
// today; a Qatar provider is added to this map only once selected
// (architecture proposal §13) — deliberately not stubbed in advance.
const PROVIDERS: Record<string, PaymentProvider> = {
  paystack: paystackProvider,
};

export type CountryPaymentConfig = {
  country: string;
  defaultCurrencyCode: string;
  gatewayProvider: string;
};

export async function getActiveCountryConfig(country: string): Promise<CountryPaymentConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_country_config")
    .select("country, default_currency_code, gateway_provider")
    .eq("country", country)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[payments] failed to load payment_country_config", error.message);
    return null;
  }
  if (!data) return null;

  return {
    country: data.country,
    defaultCurrencyCode: data.default_currency_code,
    gatewayProvider: data.gateway_provider,
  };
}

export function getProvider(providerId: string): PaymentProvider {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`[payments] no PaymentProvider registered for provider id "${providerId}"`);
  }
  return provider;
}
