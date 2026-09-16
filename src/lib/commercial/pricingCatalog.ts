import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCorporateSession, type CorporateProductSlug } from "@/lib/pricing/corporateHeadshotPricing";
import type { QuotationLineItemInput } from "./clientQuotations";

// Connect Client Quotations to existing Pricing (2026-09-16, Task C).
// Deliberately does NOT reimplement any pricing formula — reuses
// estimateCorporateSession() (corporateHeadshotPricing.ts) verbatim,
// the same real, approved calculation the public Corporate & Headshots
// estimator and the admin Pricing page both already use, including its
// own correct refusal to auto-price 51+ people ("requiresCustomQuote"
// — Ordift's own Pricing engine already treats that as a Custom
// Corporate Proposal, never an automatic price; this integration
// respects that boundary rather than inventing a formula past it).
//
// Only Corporate & Headshots is wired in this first pass — Ordift's
// other configured services (Film/Advertising/Events/Video Production
// etc.) each have their own distinct pricing dimensions (crew,
// equipment, location, deliverables, licensing) and are not yet wired
// to this quotation-prefill path; those quotation lines remain
// authorized manual entries (source_type: 'manual'), never a
// fabricated price.

export type PricingMarketOption = { slug: string; name: string };

export async function listActivePricingMarkets(): Promise<PricingMarketOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("pricing_markets").select("slug, name").eq("active", true).order("sort_order", { ascending: true });
  if (error) {
    console.error("[commercial] failed to list pricing_markets", error.message);
    return [];
  }
  return data ?? [];
}

const PRODUCT_LABELS: Record<CorporateProductSlug, string> = {
  individual_headshot: "Corporate Headshot — Individual",
  executive_portrait: "Executive Portrait",
  team_headshots: "Team Headshots",
};

export type CorporateHeadshotQuoteSuggestion =
  | { ok: true; item: QuotationLineItemInput }
  | { ok: false; requiresCustomQuote: true; reason: string }
  | { ok: false; requiresCustomQuote: false; error: string };

// Resolves a real, current Corporate & Headshots rate into a ready-to-use
// quotation line item — currency is always USD, matching this Pricing
// engine's own convention (it has no other-currency concept); an admin
// quoting in a different currency can still add this as a reference and
// adjust, but nothing here invents a conversion rate.
export async function suggestCorporateHeadshotQuotationLine(params: {
  marketSlug: string;
  marketName: string;
  product: CorporateProductSlug;
  numberOfPeople?: number;
}): Promise<CorporateHeadshotQuoteSuggestion> {
  const result = await estimateCorporateSession({
    marketSlug: params.marketSlug,
    product: params.product,
    numberOfPeople: params.numberOfPeople,
  });

  if (!result.ok) {
    return { ok: false, requiresCustomQuote: true, reason: result.reason };
  }

  const isTeam = params.product === "team_headshots";
  const quantity = isTeam ? params.numberOfPeople ?? 1 : 1;
  const rate = isTeam ? result.totalPriceUsd / quantity : result.totalPriceUsd;
  const sourceReference = `Corporate Headshot Rates: ${params.product}, ${params.marketName}${result.minimumApplied ? " (minimum booking applied)" : ""}`;

  return {
    ok: true,
    item: {
      serviceItem: PRODUCT_LABELS[params.product],
      description: isTeam ? `${quantity} people` : null,
      quantity,
      unitBasis: isTeam ? "item" : "item",
      sellingRate: Math.round(rate * 100) / 100,
      sourceType: "pricing",
      sourceReference,
    },
  };
}
