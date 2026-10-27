// SERVER-SIDE: builds a DRAFT rate card from the existing selling-rate tables through their existing read functions (which select selling fields only — there is no cost column in
// these tables). Read-only: this file writes nothing. The result is always a draft with empty descriptions and placeholder conditions, so it cannot be approved as it stands.
import { getActivePersonalSessionRates, listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import { getActiveTierRates, getTierDeliverables } from "@/lib/pricing/weddingEventPricing";
import type { ServiceMode, WeddingEventCategory } from "@/lib/pricing/weddingEventEstimate";
import { getActiveCorporateHeadshotRates, getActiveCorporateMinimumBooking, getAllActiveCorporatePriorityDeliveryPercentages, getActiveCorporateRetouchRate, getActiveCorporateTeamTierRates } from "@/lib/pricing/corporateHeadshotPricing";
import { getActiveCatalogueBaseRate, getActiveCatalogueMinimum, getActiveCreativeFeeRates, getActivePostProductionRates } from "@/lib/pricing/commercialPricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContractingEntityStanding } from "@/lib/organization/entityRegistrations";
import { commercialSection, corporateSection, personalSessionSection, weddingEventSection } from "./mappers";
import { convertContent, DEFAULT_ROUNDING } from "./convert";
import { applyEligibility } from "./eligibility";
import { PLACEHOLDER_MARK, type FxBasis, type RateCardContent, type RateCardSection, type RoundingRule } from "./types";

const ALL_ACTIVITIES = ["photography", "videography", "graphic_design", "talent_management", "production_services", "drone_operations"];
const CUSTOM_NOTE = `${PLACEHOLDER_MARK} Wording for requirements that do not fit a standard package (for example: "Tell us what you need and we will prepare an individual quotation").`;

// The governed exchange rate (append-only table) with the reason note that records where it came from.
export async function loadGovernedRate(currency: string): Promise<{ ok: true; rateToUsd: number; effectiveFrom: string; source: string } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient().from("exchange_rates").select("rate_to_usd, effective_from, reason").eq("currency_code", currency).lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1);
  if (error || !data?.length) return { ok: false, error: `No governed ${currency} exchange rate is on record.` };
  return { ok: true, rateToUsd: Number(data[0].rate_to_usd), effectiveFrom: String(data[0].effective_from).slice(0, 10), source: (data[0].reason as string | null)?.trim() || "" };
}

export type DraftOptions = { marketSlug: string; today: string; entityId?: string; currency?: string; rule?: RoundingRule };

export async function buildDraftFromSellingRates(o: DraftOptions): Promise<{ ok: true; draft: RateCardContent } | { ok: false; error: string }> {
  const market = (await listActivePricingMarkets()).find((m) => m.slug === o.marketSlug);
  if (!market) return { ok: false, error: "That market is not an active pricing market." };
  const sections: RateCardSection[] = [];
  const ps = personalSessionSection(await getActivePersonalSessionRates(o.marketSlug)); if (ps.items.length) sections.push(ps);
  for (const category of ["wedding", "event"] as WeddingEventCategory[]) {
    const [rates, deliverables] = [await getActiveTierRates(category, o.marketSlug), await getTierDeliverables(category)];
    for (const mode of ["photography", "film", "photography_film"] as ServiceMode[]) { const s = weddingEventSection(category, mode, rates, deliverables); if (s.items.length) sections.push(s); }
  }
  const corp = corporateSection(await getActiveCorporateHeadshotRates(o.marketSlug), await getActiveCorporateTeamTierRates(o.marketSlug), await getActiveCorporateMinimumBooking(o.marketSlug), await getActiveCorporateRetouchRate(o.marketSlug), await getAllActiveCorporatePriorityDeliveryPercentages());
  if (corp.items.length) sections.push(corp);
  const com = commercialSection(await getActiveCreativeFeeRates(o.marketSlug), await getActiveCatalogueBaseRate(o.marketSlug), await getActiveCatalogueMinimum(o.marketSlug), await getActivePostProductionRates());
  if (com.items.length) sections.push(com);
  for (const s of sections) s.customQuotationNote = CUSTOM_NOTE;

  let draft: RateCardContent = {
    meta: { title: "Rate Card", editionLabel: "Draft", effectiveDate: o.today, marketSlug: market.slug, marketName: market.name, currency: "USD", conversionPolicy: "none" },
    coverImage: "", sections,
    conditions: [{ title: "Prices", text: `${PLACEHOLDER_MARK} Approved wording on currency, validity and what the prices include.` }, { title: "Tax and deposits", text: `${PLACEHOLDER_MARK} Approved wording on tax, deposits and payment schedule.` }, { title: "Usage and delivery", text: `${PLACEHOLDER_MARK} Approved wording on usage rights and delivery timelines.` }],
    contact: [{ label: "Website", value: "ordiftstudios.com" }, { label: "Email", value: `${PLACEHOLDER_MARK} contact email` }, { label: "WhatsApp", value: `${PLACEHOLDER_MARK} booking number` }],
  };
  if (o.entityId) {
    const st = await getContractingEntityStanding(o.entityId, o.today, ALL_ACTIVITIES);
    if (!st) return { ok: false, error: "The issuing entity was not found." };
    const keys = st.assessment.activities.filter((a) => a.state === "licensed" || a.state === "listed_on_registration").map((a) => a.key);
    draft = applyEligibility(draft, { entityId: o.entityId, entityName: st.entity.legal_name ?? st.entity.name, checkedOn: o.today, keys });
  }
  if (o.currency && o.currency !== "USD") {
    const r = await loadGovernedRate(o.currency);
    if (!r.ok) return r;
    const fx: FxBasis = { currency: o.currency, rateToUsd: r.rateToUsd, effectiveFrom: r.effectiveFrom, source: r.source || "Governed exchange-rate table (no source note recorded)", rule: o.rule ?? DEFAULT_ROUNDING };
    draft = convertContent(draft, fx);
  }
  return { ok: true, draft };
}
