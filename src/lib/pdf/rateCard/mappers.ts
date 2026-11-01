// Pure mappers from the EXISTING selling-rate shapes to rate card items. They read selling prices and the factual deliverables stored beside them — nothing else — and never invent
// wording: an item's descriptive text stays empty until the Founder supplies approved wording.
import type { PersonalSessionRate } from "@/lib/pricing/personalSessionEstimate";
import { EVENT_TIER_LABELS, WEDDING_TIER_LABELS, type ServiceMode, type WeddingEventCategory, type WeddingEventTierDeliverable, type WeddingEventTierRate } from "@/lib/pricing/weddingEventEstimate";
import { calculateCorporateEstimate, type CorporateHeadshotRate, type CorporateTeamTierRate } from "@/lib/pricing/corporateHeadshotEstimate";
import type { CommercialCreativeFeeRate, CommercialPostProductionRate, CommercialServiceMode } from "@/lib/pricing/commercialEstimate";
import { UNCLASSIFIED } from "./eligibility";
import type { Addon, RateCardItem, RateCardSection } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// ONE inclusive statement where both counts are recorded: "150+ professionally edited images, including 10 signature retouched images". The counts themselves are never changed. If a record ever had more
// signature images than edited images, "including" would be untrue, so the two counts are then listed separately.
function imageLines(edited: number, editedSuffix: string, signature: number): string[] {
  const sig = signature > 0 ? plural(signature, "signature retouched image") : "";
  const ed = edited > 0 ? `${edited}${editedSuffix} professionally edited ${edited === 1 && !editedSuffix ? "image" : "images"}` : "";
  if (ed && sig) return signature <= edited ? [`${ed}, including ${sig}`] : [ed, sig];
  return [ed, sig].filter(Boolean);
}
const hours = (h: number) => (h === 0.5 ? "30-minute" : Number.isInteger(h) ? `${h}-hour` : `${h}-hour`);

export function personalSessionSection(rates: PersonalSessionRate[]): RateCardSection {
  const items: RateCardItem[] = [...rates].sort((a, b) => a.durationHours - b.durationHours).map((r) => ({
    key: `ps-${r.durationHours}h`, name: `${hours(r.durationHours)} session`, description: "",
    inclusions: imageLines(r.professionallyEditedImages, "", r.signatureRetouchedImages),
    price: { kind: "fixed", amount: r.priceUsd, unit: "per session" }, source: "selling_rates", activities: ["photography"],
    specs: [`${hours(r.durationHours)} session`],
  }));
  return { key: "personal_sessions", title: "Personal sessions", structure: "fixed", items };
}

const ACTIVITIES: Record<ServiceMode, string[]> = { photography: ["photography"], film: ["videography"], photography_film: ["photography", "videography"] };
const MODE_LABEL: Record<ServiceMode, string> = { photography: "Photography", film: "Film", photography_film: "Photography and film" };

export function weddingEventSection(category: WeddingEventCategory, mode: ServiceMode, rates: WeddingEventTierRate[], deliverables: WeddingEventTierDeliverable[]): RateCardSection {
  const labels = (category === "wedding" ? WEDDING_TIER_LABELS : EVENT_TIER_LABELS) as Record<string, string>;
  const items: RateCardItem[] = rates.filter((r) => r.serviceMode === mode).sort((a, b) => a.priceUsd - b.priceUsd).map((r) => {
    const d = deliverables.find((x) => x.tierSlug === r.tierSlug && x.serviceMode === mode);
    const inc: string[] = [];
    let specs: string[] | undefined;
    if (d) {
      const coverage = `${plural(d.coverageHours, "hour")} of coverage${d.eventDays > 1 ? ` over ${d.eventDays} days` : ""}`;
      if (category === "event") specs = [coverage];          // events: the exact coverage hours are shown prominently (the package names, such as Half Day, are kept)
      else inc.push(coverage);
      if (d.photographers > 0) inc.push(plural(d.photographers, "photographer"));
      if (d.filmmakers > 0) inc.push(plural(d.filmmakers, "filmmaker"));
      inc.push(...imageLines(d.professionallyEditedImagesMin, "+", d.signatureRetouchedImages));
      if (d.highlightFilmMinMinutes != null && d.highlightFilmMaxMinutes != null) inc.push(`Highlight film, ${d.highlightFilmMinMinutes}–${d.highlightFilmMaxMinutes} minutes`);
      if (d.includesDocumentary) inc.push("Documentary edit");
      if (d.onlineGallery) inc.push("Online gallery");
      if (d.planningConsultation) inc.push("Planning consultation");
      if (d.prioritySneakPeek) inc.push("Priority sneak peek");
    }
    return { key: `${category}-${mode}-${r.tierSlug}`, name: labels[r.tierSlug] ?? r.tierSlug, description: "", ...(specs ? { specs } : {}), inclusions: inc, price: { kind: "fixed" as const, amount: r.priceUsd, unit: "per booking" }, source: "selling_rates" as const, activities: ACTIVITIES[mode] };
  });
  return { key: `${category}_${mode}`, title: `${category === "wedding" ? "Weddings" : "Events"} — ${MODE_LABEL[mode]}`, structure: "fixed", items };
}

// ---------------------------------------------------------------- corporate headshots
const CORPORATE_NAMES: Record<string, string> = { individual_headshot: "Individual headshot", executive_portrait: "Executive portrait" };
// Signature retouched images per person for Team Headshots, DERIVED from the existing quotation calculation (never restated here): the calculator is run at the smallest and the largest priced team
// size, and the figure is shown only when both give the same whole number per person. The calculation itself is not touched.
function teamSignaturePerPerson(tiers: CorporateTeamTierRate[], minimumUsd: number | null): number | null {
  if (minimumUsd === null) return null;
  const at = (people: number) => {
    const r = calculateCorporateEstimate({ product: "team_headshots", headshotRates: [], teamTierRates: tiers, minimumBookingUsd: minimumUsd, numberOfPeople: people });
    return r.ok && r.signatureRetouchedImages % people === 0 ? r.signatureRetouchedImages / people : null;
  };
  const low = at(Math.min(...tiers.map((t) => t.minPeople))); const high = at(Math.max(...tiers.map((t) => t.maxPeople)));
  return low !== null && low > 0 && low === high ? low : null;
}

export function corporateSection(products: CorporateHeadshotRate[], tiers: CorporateTeamTierRate[], minimumUsd: number | null, retouchPerImageUsd: number | null, priority: Partial<Record<string, number>>): RateCardSection {
  const items: RateCardItem[] = [...products].sort((a, b) => a.priceUsd - b.priceUsd).map((p) => ({
    key: `corp-${p.productSlug}`, name: CORPORATE_NAMES[p.productSlug] ?? p.productSlug, description: "",
    specs: p.signatureRetouchedImages > 0 ? [plural(p.signatureRetouchedImages, "signature retouched image")] : [], inclusions: [],
    price: { kind: "fixed", amount: p.priceUsd, unit: "per person" }, source: "selling_rates", activities: ["photography"],
  }));
  if (tiers.length) {
    const sorted = [...tiers].sort((a, b) => a.minPeople - b.minPeople);
    const perPerson = teamSignaturePerPerson(sorted, minimumUsd);
    items.push({
      key: "corp-team", name: "Team headshots", description: "", inclusions: perPerson ? [`${plural(perPerson, "signature retouched image")} per person`] : [],
      price: { kind: "from", amount: Math.min(...sorted.map((t) => t.pricePerPersonUsd)), unit: "per person" }, source: "selling_rates", activities: ["photography"],
      tiers: sorted.map((t) => ({ label: `${t.minPeople}–${t.maxPeople} people`, price: { kind: "fixed" as const, amount: t.pricePerPersonUsd, unit: "per person" } })),
    });
  }
  const addons: Addon[] = [];
  if (retouchPerImageUsd && retouchPerImageUsd > 0) addons.push({ name: "Additional retouched image", price: { kind: "fixed", amount: retouchPerImageUsd, unit: "per image" }, activities: ["photography"] });
  const PRIORITY_LABEL: Record<string, string> = { individual_headshot: "individual headshot", executive_portrait: "executive portrait", team_2_5: "team of 2–5", team_6_10: "team of 6–10", team_11_25: "team of 11–25", team_26_50: "team of 26–50" };
  const pr = Object.entries(priority).filter(([, v]) => typeof v === "number" && v > 0);
  if (pr.length) addons.push({ name: "Priority delivery", price: { kind: "on_request" }, note: `Adds to the booking total: ${pr.map(([k, v]) => `${v}% for an ${PRIORITY_LABEL[k] ?? k}`.replace("an team", "a team")).join("; ")}. Confirmed in the quotation.`, activities: ["photography"] });
  return {
    key: "corporate_headshots", title: "Corporate headshots", structure: "mixed", items, addons,
    minimum: minimumUsd && minimumUsd > 0 ? { label: "Minimum booking", price: { kind: "fixed", amount: minimumUsd } } : undefined,
  };
}

// ---------------------------------------------------------------- commercial and product photography
const SCOPE_LABEL: Record<string, string> = { focused: "Focused", full_day: "Full day", extended: "Extended" };
const MODE_ACTIVITIES: Record<CommercialServiceMode, string[]> = { photography: ["photography"], film: ["videography"], photography_film: ["photography", "videography"] };
const MODE_TITLE: Record<CommercialServiceMode, string> = { photography: "photography", film: "film", photography_film: "photography and film" };
const PHOTO_POST = new Set(["additional_finished_image", "advanced_retouch", "high_end_retouch", "creative_composite"]);
const VIDEO_POST = new Set(["cutdown_15s", "cutdown_30s", "alternate_edit_60s", "motion_graphics_basic"]);
const postName = (slug: string) => ({ cutdown_15s: "15-second cutdown", cutdown_30s: "30-second cutdown", alternate_edit_60s: "Alternate edit, 60 seconds" } as Record<string, string>)[slug]
  ?? slug.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

export function commercialSection(fees: CommercialCreativeFeeRate[], catalogueBaseUsd: number | null, catalogueMinimumUsd: number | null, post: CommercialPostProductionRate[]): RateCardSection {
  const order = ["focused", "full_day", "extended"];
  const items: RateCardItem[] = [...fees].sort((a, b) => a.serviceMode.localeCompare(b.serviceMode) || order.indexOf(a.scopeSlug) - order.indexOf(b.scopeSlug)).map((f) => ({
    key: `com-${f.serviceMode}-${f.scopeSlug}`, name: `${SCOPE_LABEL[f.scopeSlug] ?? f.scopeSlug} production — ${MODE_TITLE[f.serviceMode]}`, description: "", inclusions: [],
    price: { kind: "from" as const, amount: f.priceUsd, unit: "per project" }, source: "selling_rates" as const, activities: MODE_ACTIVITIES[f.serviceMode],
  }));
  // Catalogue: the base rate and the minimum are stated as recorded ("Standard base rate", never "the lowest price": quantity and complexity change the final price). The approved sentence on how
  // final pricing is set comes from the wording registry. Nothing about quantity or complexity factors is restated here.
  const catalogueLines = [`Standard base rate: USD ${catalogueBaseUsd} per image`, ...(catalogueMinimumUsd && catalogueMinimumUsd > 0 ? [`Minimum booking: USD ${catalogueMinimumUsd}`] : [])];
  if (catalogueBaseUsd && catalogueBaseUsd > 0) items.push({ key: "com-catalogue", name: "Product and catalogue photography", description: "", inclusions: catalogueLines, price: { kind: "from", amount: catalogueBaseUsd, unit: "per image" }, source: "selling_rates", activities: ["photography"] });
  const addons: Addon[] = [...post].sort((a, b) => a.priceUsd - b.priceUsd).map((r) => ({
    name: postName(r.itemSlug), price: r.isFromPrice ? { kind: "from" as const, amount: r.priceUsd } : { kind: "fixed" as const, amount: r.priceUsd },
    activities: PHOTO_POST.has(r.itemSlug) ? ["photography"] : VIDEO_POST.has(r.itemSlug) ? ["videography"] : [UNCLASSIFIED],
  }));
  return {
    key: "commercial", title: "Commercial and product photography", structure: "from", items, addons,
    minimum: catalogueMinimumUsd && catalogueMinimumUsd > 0 ? { label: "Minimum for product and catalogue work", price: { kind: "fixed", amount: catalogueMinimumUsd } } : undefined,
  };
}
