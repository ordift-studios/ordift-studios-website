// SERVER-SIDE: builds a DRAFT rate card from the existing selling-rate tables through their existing read functions (which select selling fields only — there is no cost
// column in these tables). Read-only: this file writes nothing. The result is always a draft with empty descriptions and no conditions, so it cannot be approved as it stands.
import { getActivePersonalSessionRates, listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import { getActiveTierRates, getTierDeliverables } from "@/lib/pricing/weddingEventPricing";
import type { ServiceMode, WeddingEventCategory } from "@/lib/pricing/weddingEventEstimate";
import { personalSessionSection, weddingEventSection } from "./mappers";
import type { RateCardContent, RateCardSection } from "./types";

export async function buildDraftFromSellingRates(marketSlug: string, today: string): Promise<{ ok: true; draft: RateCardContent } | { ok: false; error: string }> {
  const market = (await listActivePricingMarkets()).find((m) => m.slug === marketSlug);
  if (!market) return { ok: false, error: "That market is not an active pricing market." };
  const sections: RateCardSection[] = [];
  const ps = personalSessionSection(await getActivePersonalSessionRates(marketSlug));
  if (ps.items.length) sections.push(ps);
  for (const category of ["wedding", "event"] as WeddingEventCategory[]) {
    const [rates, deliverables] = [await getActiveTierRates(category, marketSlug), await getTierDeliverables(category)];
    for (const mode of ["photography", "film", "photography_film"] as ServiceMode[]) {
      const s = weddingEventSection(category, mode, rates, deliverables);
      if (s.items.length) sections.push(s);
    }
  }
  return { ok: true, draft: { meta: { title: "Rate Card", editionLabel: "Draft", effectiveDate: today, marketSlug: market.slug, marketName: market.name, currency: "USD" }, coverImage: "", sections, conditions: [], contact: [] } };
}
