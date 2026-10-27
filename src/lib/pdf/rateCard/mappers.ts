// Pure mappers from the EXISTING selling-rate shapes to rate card items. They read selling prices and the factual deliverables stored beside them — nothing else — and never invent
// wording: an item's descriptive text stays empty until the Founder supplies approved wording.
import type { PersonalSessionRate } from "@/lib/pricing/personalSessionEstimate";
import { EVENT_TIER_LABELS, WEDDING_TIER_LABELS, type ServiceMode, type WeddingEventCategory, type WeddingEventTierDeliverable, type WeddingEventTierRate } from "@/lib/pricing/weddingEventEstimate";
import type { RateCardItem, RateCardSection } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hours = (h: number) => (h === 0.5 ? "30-minute" : Number.isInteger(h) ? `${h}-hour` : `${h}-hour`);

export function personalSessionSection(rates: PersonalSessionRate[]): RateCardSection {
  const items: RateCardItem[] = [...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => ({
    key: `ps-${r.durationHours}h`, name: `${hours(r.durationHours)} session`, description: "",
    inclusions: [
      r.professionallyEditedImages > 0 ? `${plural(r.professionallyEditedImages, "professionally edited image")}` : "",
      r.signatureRetouchedImages > 0 ? `${plural(r.signatureRetouchedImages, "signature retouched image")}` : "",
    ].filter(Boolean),
    price: { kind: "fixed", amount: r.priceUsd, unit: "per session" }, source: "selling_rates",
  }));
  return { key: "personal_sessions", title: "Personal sessions", structure: "fixed", items };
}

const MODE_LABEL: Record<ServiceMode, string> = { photography: "Photography", film: "Film", photography_film: "Photography and film" };

export function weddingEventSection(category: WeddingEventCategory, mode: ServiceMode, rates: WeddingEventTierRate[], deliverables: WeddingEventTierDeliverable[]): RateCardSection {
  const labels = (category === "wedding" ? WEDDING_TIER_LABELS : EVENT_TIER_LABELS) as Record<string, string>;
  const items: RateCardItem[] = rates.filter((r) => r.serviceMode === mode).map((r) => {
    const d = deliverables.find((x) => x.tierSlug === r.tierSlug && x.serviceMode === mode);
    const inc: string[] = [];
    if (d) {
      inc.push(`${plural(d.coverageHours, "hour")} of coverage${d.eventDays > 1 ? ` over ${d.eventDays} days` : ""}`);
      if (d.photographers > 0) inc.push(plural(d.photographers, "photographer"));
      if (d.filmmakers > 0) inc.push(plural(d.filmmakers, "filmmaker"));
      if (d.professionallyEditedImagesMin > 0) inc.push(`${d.professionallyEditedImagesMin}+ professionally edited images`);
      if (d.signatureRetouchedImages > 0) inc.push(plural(d.signatureRetouchedImages, "signature retouched image"));
      if (d.highlightFilmMinMinutes != null && d.highlightFilmMaxMinutes != null) inc.push(`Highlight film, ${d.highlightFilmMinMinutes}–${d.highlightFilmMaxMinutes} minutes`);
      if (d.includesDocumentary) inc.push("Documentary edit");
      if (d.onlineGallery) inc.push("Online gallery");
      if (d.planningConsultation) inc.push("Planning consultation");
      if (d.prioritySneakPeek) inc.push("Priority sneak peek");
    }
    return { key: `${category}-${mode}-${r.tierSlug}`, name: labels[r.tierSlug] ?? r.tierSlug, description: "", inclusions: inc, price: { kind: "fixed" as const, amount: r.priceUsd, unit: "per booking" }, source: "selling_rates" as const };
  });
  return { key: `${category}_${mode}`, title: `${category === "wedding" ? "Weddings" : "Events"} — ${MODE_LABEL[mode]}`, structure: "fixed", items };
}
