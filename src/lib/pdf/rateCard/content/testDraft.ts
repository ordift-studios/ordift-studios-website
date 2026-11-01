// TEST SUPPORT ONLY (imported by tests, never by the app): a draft for all 47 packages built through the real mappers from SYNTHETIC rows (every price is 1 and every count is a placeholder
// number). No real price or selling-rate row is stored here.
import { commercialSection, corporateSection, personalSessionSection, weddingEventSection } from "../mappers";
import type { RateCardContent } from "../types";
import type { ServiceMode, WeddingEventCategory } from "@/lib/pricing/weddingEventEstimate";

const MODES: ServiceMode[] = ["photography", "film", "photography_film"];
const TIERS: Record<WeddingEventCategory, string[]> = { wedding: ["chapter", "narrative", "chronicle", "archive"], event: ["focused", "half_day", "full_day", "extended", "full_event", "round_the_clock"] };

export function syntheticDraft(marketSlug = "ghana"): RateCardContent {
  const sections = [personalSessionSection([1, 2, 3, 4].map((h) => ({ marketId: "m", durationHours: h, priceUsd: 1, professionallyEditedImages: 10 * h, signatureRetouchedImages: 2 * h })))];
  for (const category of ["wedding", "event"] as const) {
    const rates = MODES.flatMap((serviceMode) => TIERS[category].map((tierSlug) => ({ marketId: "m", category, serviceMode, tierSlug, priceUsd: 1 })));
    const deliverables = MODES.flatMap((serviceMode) => TIERS[category].map((tierSlug, n) => ({
      category, tierSlug, serviceMode, eventDays: 1, coverageHours: tierSlug === "half_day" ? 2 : tierSlug === "full_day" ? 4 : 3 + n, photographers: serviceMode === "film" ? 0 : 1, filmmakers: serviceMode === "photography" ? 0 : 1,
      professionallyEditedImagesMin: serviceMode === "film" ? 0 : 100 + n, signatureRetouchedImages: serviceMode === "film" ? 0 : 5 + n, highlightFilmMinMinutes: serviceMode === "photography" ? null : 2, highlightFilmMaxMinutes: serviceMode === "photography" ? null : 3,
      includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false,
    })));
    for (const mode of MODES) sections.push(weddingEventSection(category, mode, rates, deliverables));
  }
  sections.push(corporateSection(
    [{ marketId: "m", productSlug: "individual_headshot", priceUsd: 1, signatureRetouchedImages: 2 }, { marketId: "m", productSlug: "executive_portrait", priceUsd: 2, signatureRetouchedImages: 5 }],
    [{ marketId: "m", tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 3 }, { marketId: "m", tierSlug: "26-50", minPeople: 26, maxPeople: 50, pricePerPersonUsd: 2 }], 7, 1, { individual_headshot: 9 }));
  sections.push(commercialSection(MODES.flatMap((serviceMode) => (["focused", "full_day", "extended"] as const).map((scopeSlug) => ({ marketId: "m", serviceMode, scopeSlug, priceUsd: 1 }))), 55, 500,
    [{ itemSlug: "advanced_retouch", priceUsd: 1, isFromPrice: false }, { itemSlug: "cutdown_15s", priceUsd: 1, isFromPrice: false }, { itemSlug: "revision_round", priceUsd: 1, isFromPrice: false }]));
  return {
    meta: { title: "Rate Card", editionLabel: "Draft", effectiveDate: "2026-11-01", marketSlug, marketName: marketSlug, currency: "USD", conversionPolicy: "none" }, coverImage: "", sections,
    conditions: [{ title: "Prices", text: "[PLACEHOLDER] terms" }], contact: [{ label: "Email", value: "[PLACEHOLDER] contact email" }],
  };
}
