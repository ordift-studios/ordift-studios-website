import { describe, expect, it } from "vitest";
import {
  calculateWeddingEstimate,
  calculateEventEstimate,
  calculateRawFileGuidance,
  formatTierUpgradeMessage,
  type WeddingEventTierRate,
  type WeddingEventTierDeliverable,
  type WeddingEventPriorityDeliveryRate,
  type ServiceMode,
  type AddonSlug,
} from "./weddingEventEstimate";

// Ordift Weddings & Events Pricing V1 (2026-09-06) — calculateWeddingEstimate()
// / calculateEventEstimate() are pure (take already-fetched rates rather
// than querying themselves), so the actual pricing decision logic is
// directly unit-testable without a live Supabase session — same
// established pure/impure split as the Personal and Corporate
// calculators. Market/category/tier/mode are always explicit inputs;
// none of these tests exercise any nationality/IP/geolocation/religion/
// culture signal because the function accepts none.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;
const MODES: ServiceMode[] = ["photography", "film", "photography_film"];

// ---- Approved locked rate matrices, exactly as authorized ----

const WEDDING_RATES: Record<ServiceMode, Record<string, [number, number, number, number]>> = {
  photography: {
    ghana: [400, 750, 1150, 1650],
    qatar: [850, 1500, 2250, 3200],
    uk_western_europe: [1100, 1850, 2650, 3750],
    north_america: [1250, 2100, 3000, 4250],
    asia_pacific: [950, 1650, 2400, 3400],
    other_international_custom: [900, 1550, 2300, 3300],
  },
  film: {
    ghana: [450, 850, 1300, 1850],
    qatar: [950, 1700, 2500, 3550],
    uk_western_europe: [1200, 2000, 2900, 4100],
    north_america: [1350, 2300, 3300, 4650],
    asia_pacific: [1050, 1800, 2650, 3750],
    other_international_custom: [1000, 1700, 2500, 3600],
  },
  photography_film: {
    ghana: [750, 1400, 2100, 3000],
    qatar: [1600, 2850, 4250, 6000],
    uk_western_europe: [2000, 3400, 5000, 7000],
    north_america: [2250, 3900, 5700, 8000],
    asia_pacific: [1750, 3000, 4500, 6300],
    other_international_custom: [1650, 2850, 4300, 6100],
  },
};

// Photography/Film/Photography+Film x six markets x six coverage
// levels (Focused/Half Day/Full Day/Extended approved and price-
// locked by Part 4; Full Event/Round-the-Clock are the new 12h/24h
// tiers added by Part 5/6 — see RATE_CARD_MEDIUM_PRICING.md for the
// full computation).
const EVENT_RATES: Record<ServiceMode, Record<string, [number, number, number, number, number, number]>> = {
  photography: {
    ghana: [175, 325, 575, 850, 1075, 2360],
    qatar: [350, 650, 1100, 1600, 2010, 4345],
    uk_western_europe: [450, 800, 1350, 1950, 2440, 5245],
    north_america: [500, 900, 1550, 2250, 2825, 6095],
    asia_pacific: [400, 725, 1200, 1750, 2200, 4770],
    other_international_custom: [375, 675, 1150, 1650, 2060, 4395],
  },
  film: {
    ghana: [225, 400, 700, 1050, 1335, 2970],
    qatar: [450, 800, 1350, 2000, 2535, 5575],
    uk_western_europe: [550, 950, 1650, 2400, 3015, 6520],
    north_america: [625, 1100, 1900, 2750, 3445, 7420],
    asia_pacific: [500, 850, 1450, 2100, 2635, 5675],
    other_international_custom: [475, 825, 1400, 2000, 2490, 5295],
  },
  photography_film: {
    ghana: [350, 625, 1100, 1600, 2010, 4345],
    qatar: [700, 1250, 2150, 3150, 3970, 8645],
    uk_western_europe: [850, 1500, 2600, 3800, 4785, 10395],
    north_america: [975, 1750, 3000, 4350, 5455, 11765],
    asia_pacific: [775, 1350, 2300, 3350, 4210, 9120],
    other_international_custom: [725, 1300, 2200, 3200, 4020, 8695],
  },
};

const WEDDING_TIERS = ["chapter", "narrative", "chronicle", "archive"] as const;
const EVENT_TIERS = ["focused", "half_day", "full_day", "extended", "full_event", "round_the_clock"] as const;

function buildTierRates(category: "wedding" | "event", rateTable: Record<ServiceMode, Record<string, readonly number[]>>, market: string): WeddingEventTierRate[] {
  const tiers = category === "wedding" ? WEDDING_TIERS : EVENT_TIERS;
  const rates: WeddingEventTierRate[] = [];
  for (const mode of MODES) {
    tiers.forEach((tier, i) => {
      rates.push({ marketId: market, category, serviceMode: mode, tierSlug: tier, priceUsd: rateTable[mode][market][i] });
    });
  }
  return rates;
}

// Medium-split deliverables (2026-09-28) — three rows per tier
// (photography / film / photography_film), matching migration 0139
// exactly. photography_film rows are the original approved figures;
// photography-only rows reuse their photo-side figures with
// filmmakers/film-length zeroed/nulled; film-only rows reuse their
// film-side figures with photographer/image-count figures zeroed.
const WEDDING_DELIVERABLES: WeddingEventTierDeliverable[] = [
  { category: "wedding", tierSlug: "chapter", serviceMode: "photography_film", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 150, signatureRetouchedImages: 10, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 4, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: false },
  { category: "wedding", tierSlug: "chapter", serviceMode: "photography", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 150, signatureRetouchedImages: 10, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: false },
  { category: "wedding", tierSlug: "chapter", serviceMode: "film", eventDays: 1, coverageHours: 4, photographers: 0, filmmakers: 1, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 4, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: false },
  { category: "wedding", tierSlug: "narrative", serviceMode: "photography_film", eventDays: 1, coverageHours: 8, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 350, signatureRetouchedImages: 20, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "narrative", serviceMode: "photography", eventDays: 1, coverageHours: 8, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 350, signatureRetouchedImages: 20, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "narrative", serviceMode: "film", eventDays: 1, coverageHours: 8, photographers: 0, filmmakers: 1, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "chronicle", serviceMode: "photography_film", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 550, signatureRetouchedImages: 30, highlightFilmMinMinutes: 8, highlightFilmMaxMinutes: 12, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "chronicle", serviceMode: "photography", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 0, professionallyEditedImagesMin: 550, signatureRetouchedImages: 30, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "chronicle", serviceMode: "film", eventDays: 1, coverageHours: 12, photographers: 0, filmmakers: 2, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 8, highlightFilmMaxMinutes: 12, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "archive", serviceMode: "photography_film", eventDays: 2, coverageHours: 16, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 750, signatureRetouchedImages: 40, highlightFilmMinMinutes: 10, highlightFilmMaxMinutes: 15, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "archive", serviceMode: "photography", eventDays: 2, coverageHours: 16, photographers: 2, filmmakers: 0, professionallyEditedImagesMin: 750, signatureRetouchedImages: 40, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "archive", serviceMode: "film", eventDays: 2, coverageHours: 16, photographers: 0, filmmakers: 2, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 10, highlightFilmMaxMinutes: 15, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
];

const EVENT_DELIVERABLES: WeddingEventTierDeliverable[] = [
  { category: "event", tierSlug: "focused", serviceMode: "photography_film", eventDays: 1, coverageHours: 1, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 75, signatureRetouchedImages: 5, highlightFilmMinMinutes: 1, highlightFilmMaxMinutes: 2, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "focused", serviceMode: "photography", eventDays: 1, coverageHours: 1, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 75, signatureRetouchedImages: 5, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "focused", serviceMode: "film", eventDays: 1, coverageHours: 1, photographers: 0, filmmakers: 1, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 1, highlightFilmMaxMinutes: 2, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "half_day", serviceMode: "photography_film", eventDays: 1, coverageHours: 2, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 150, signatureRetouchedImages: 8, highlightFilmMinMinutes: 2, highlightFilmMaxMinutes: 3, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "half_day", serviceMode: "photography", eventDays: 1, coverageHours: 2, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 150, signatureRetouchedImages: 8, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "half_day", serviceMode: "film", eventDays: 1, coverageHours: 2, photographers: 0, filmmakers: 1, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 2, highlightFilmMaxMinutes: 3, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_day", serviceMode: "photography_film", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 300, signatureRetouchedImages: 12, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 5, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_day", serviceMode: "photography", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 300, signatureRetouchedImages: 12, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_day", serviceMode: "film", eventDays: 1, coverageHours: 4, photographers: 0, filmmakers: 1, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 5, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "extended", serviceMode: "photography_film", eventDays: 1, coverageHours: 8, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 450, signatureRetouchedImages: 18, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "extended", serviceMode: "photography", eventDays: 1, coverageHours: 8, photographers: 2, filmmakers: 0, professionallyEditedImagesMin: 450, signatureRetouchedImages: 18, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "extended", serviceMode: "film", eventDays: 1, coverageHours: 8, photographers: 0, filmmakers: 2, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_event", serviceMode: "photography_film", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 650, signatureRetouchedImages: 25, highlightFilmMinMinutes: 8, highlightFilmMaxMinutes: 12, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_event", serviceMode: "photography", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 0, professionallyEditedImagesMin: 650, signatureRetouchedImages: 25, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_event", serviceMode: "film", eventDays: 1, coverageHours: 12, photographers: 0, filmmakers: 2, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 8, highlightFilmMaxMinutes: 12, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "round_the_clock", serviceMode: "photography_film", eventDays: 2, coverageHours: 24, photographers: 3, filmmakers: 3, professionallyEditedImagesMin: 1100, signatureRetouchedImages: 40, highlightFilmMinMinutes: 15, highlightFilmMaxMinutes: 20, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "event", tierSlug: "round_the_clock", serviceMode: "photography", eventDays: 2, coverageHours: 24, photographers: 3, filmmakers: 0, professionallyEditedImagesMin: 1100, signatureRetouchedImages: 40, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "event", tierSlug: "round_the_clock", serviceMode: "film", eventDays: 2, coverageHours: 24, photographers: 0, filmmakers: 3, professionallyEditedImagesMin: 0, signatureRetouchedImages: 0, highlightFilmMinMinutes: 15, highlightFilmMaxMinutes: 20, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
];

const WEDDING_PRIORITY: WeddingEventPriorityDeliveryRate[] = [
  { category: "wedding", tierSlug: "chapter", multiplierPercentage: 35 },
  { category: "wedding", tierSlug: "narrative", multiplierPercentage: 35 },
  { category: "wedding", tierSlug: "chronicle", multiplierPercentage: 30 },
  { category: "wedding", tierSlug: "archive", multiplierPercentage: 30 },
];
const EVENT_PRIORITY: WeddingEventPriorityDeliveryRate[] = [
  { category: "event", tierSlug: "focused", multiplierPercentage: 35 },
  { category: "event", tierSlug: "half_day", multiplierPercentage: 35 },
  { category: "event", tierSlug: "full_day", multiplierPercentage: 30 },
  { category: "event", tierSlug: "extended", multiplierPercentage: 30 },
  { category: "event", tierSlug: "full_event", multiplierPercentage: 28 },
  { category: "event", tierSlug: "round_the_clock", multiplierPercentage: 25 },
];

// Revised (Part 7, Founder-redesigned architecture) — a first pass
// raised these rates to strictly clear the steepest EXISTING adjacent
// marginal tier-price rate (Focused -> Half Day); the Founder rejected
// that as too aggressive for genuine overtime pricing and asked for
// the ladder to be protected structurally instead (see
// checkTierUpgrade()/EVENT_TIER_ORDER/WEDDING_TIER_ORDER in
// weddingEventEstimate.ts and the "package-upgrade" describe blocks
// below). With that protection in place, these rates are a moderate
// +30% over the previous rate in every market/mode — see
// RATE_CARD_MEDIUM_PRICING.md §3 for the full A/B/C/D working.
const ADDITIONAL_HOUR_RATES: Record<ServiceMode, Record<string, number>> = {
  photography: { ghana: 115, qatar: 230, uk_western_europe: 295, north_america: 325, asia_pacific: 260, other_international_custom: 245 },
  film: { ghana: 130, qatar: 260, uk_western_europe: 325, north_america: 360, asia_pacific: 295, other_international_custom: 275 },
  photography_film: { ghana: 210, qatar: 415, uk_western_europe: 520, north_america: 585, asia_pacific: 470, other_international_custom: 440 },
};
const ADDITIONAL_PHOTOGRAPHER_DAY: Record<string, number> = { ghana: 200, qatar: 400, uk_western_europe: 500, north_america: 600, asia_pacific: 450, other_international_custom: 425 };
const ADDITIONAL_FILMMAKER_DAY: Record<string, number> = { ghana: 225, qatar: 450, uk_western_europe: 550, north_america: 650, asia_pacific: 500, other_international_custom: 475 };
const PRE_WEDDING: Record<string, number> = { ghana: 200, qatar: 350, uk_western_europe: 500, north_america: 550, asia_pacific: 450, other_international_custom: 425 };
const DRONE: Record<string, number> = { ghana: 150, qatar: 275, uk_western_europe: 350, north_america: 400, asia_pacific: 325, other_international_custom: 300 };
const SAME_DAY_PHOTO: Record<string, number> = { ghana: 150, qatar: 300, uk_western_europe: 375, north_america: 450, asia_pacific: 325, other_international_custom: 325 };
const SAME_DAY_FILM: Record<string, number> = { ghana: 300, qatar: 600, uk_western_europe: 750, north_america: 900, asia_pacific: 650, other_international_custom: 650 };
const DOCUMENTARY_MIN: Record<string, number> = { ghana: 150, qatar: 300, uk_western_europe: 400, north_america: 450, asia_pacific: 350, other_international_custom: 350 };
const LIVESTREAM_BASIC: Record<string, number> = { ghana: 400, qatar: 750, uk_western_europe: 950, north_america: 1100, asia_pacific: 850, other_international_custom: 800 };
const LIVESTREAM_STANDARD: Record<string, number> = { ghana: 750, qatar: 1400, uk_western_europe: 1750, north_america: 2000, asia_pacific: 1550, other_international_custom: 1500 };
const RAW_PHOTO_MIN: Record<string, number> = { ghana: 200, qatar: 350, uk_western_europe: 450, north_america: 500, asia_pacific: 400, other_international_custom: 400 };
const RAW_VIDEO_MIN: Record<string, number> = { ghana: 300, qatar: 500, uk_western_europe: 650, north_america: 750, asia_pacific: 600, other_international_custom: 600 };

function fullAddonRates(market: string): Partial<Record<AddonSlug, number>> {
  return {
    additional_photo_hour: ADDITIONAL_HOUR_RATES.photography[market],
    additional_film_hour: ADDITIONAL_HOUR_RATES.film[market],
    additional_photofilm_hour: ADDITIONAL_HOUR_RATES.photography_film[market],
    additional_photographer_day: ADDITIONAL_PHOTOGRAPHER_DAY[market],
    additional_filmmaker_day: ADDITIONAL_FILMMAKER_DAY[market],
    pre_wedding_session: PRE_WEDDING[market],
    drone: DRONE[market],
    same_day_photo_pack: SAME_DAY_PHOTO[market],
    same_day_highlight_film: SAME_DAY_FILM[market],
    documentary_recording_minimum: DOCUMENTARY_MIN[market],
    livestream_single_basic: LIVESTREAM_BASIC[market],
    livestream_multicam_standard: LIVESTREAM_STANDARD[market],
    raw_photo_guidance_minimum: RAW_PHOTO_MIN[market],
    raw_video_guidance_minimum: RAW_VIDEO_MIN[market],
    keepsake_album: 125,
    signature_album: 200,
    archive_album: 325,
    companion_album: 85,
    frame_small: 50,
    frame_medium: 75,
    frame_large: 110,
    frame_statement: 150,
    presentation_drive: 35,
  };
}

// ============================================================
// WEDDING — all six markets, four collections, three service modes
// ============================================================
describe("calculateWeddingEstimate — locked rates, all markets/collections/modes", () => {
  for (const market of MARKETS) {
    for (const mode of MODES) {
      WEDDING_TIERS.forEach((tier, i) => {
        it(`${market} — ${mode} — ${tier}`, () => {
          const result = calculateWeddingEstimate({
            serviceMode: mode,
            tierSlug: tier,
            tierRates: buildTierRates("wedding", WEDDING_RATES, market),
            tierDeliverables: WEDDING_DELIVERABLES,
            priorityDeliveryRates: WEDDING_PRIORITY,
            addonRates: fullAddonRates(market),
          });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.baseTierPriceUsd).toBe(WEDDING_RATES[mode][market][i]);
          expect(result.totalPriceUsd).toBe(WEDDING_RATES[mode][market][i]);
        });
      });
    }
  }
});

describe("calculateWeddingEstimate — deliverables", () => {
  it("Chapter: 150+ edited, 10 retouched, no documentary included", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography_film", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.professionallyEditedImagesMin).toBe(150);
    expect(result.deliverables?.signatureRetouchedImages).toBe(10);
    expect(result.deliverables?.includesDocumentary).toBe(false);
  });
  it("Chronicle: includes documentary, 30 retouched, 2 photographers/filmmakers", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography_film", tierSlug: "chronicle", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.includesDocumentary).toBe(true);
    expect(result.deliverables?.photographers).toBe(2);
  });
  it("Archive: 2 event days, 16 coverage hours, includes documentary", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography_film", tierSlug: "archive", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.eventDays).toBe(2);
    expect(result.deliverables?.coverageHours).toBe(16);
    expect(result.deliverables?.includesDocumentary).toBe(true);
  });
});

describe("calculateWeddingEstimate — deliverables are medium-aware (Part 9 audit — same class of defect as Events)", () => {
  it("Chapter/Photography: no filmmaker, no highlight film advertised", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.filmmakers).toBe(0);
    expect(result.deliverables?.highlightFilmMinMinutes).toBeNull();
  });
  it("Chapter/Film: no photographer, no edited-image count advertised", () => {
    const result = calculateWeddingEstimate({ serviceMode: "film", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.photographers).toBe(0);
    expect(result.deliverables?.professionallyEditedImagesMin).toBe(0);
  });
  it("Chronicle/Photography (documentary NOT included — it is a film-side deliverable) vs Chronicle/Film (documentary included)", () => {
    const photo = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chronicle", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    const film = calculateWeddingEstimate({ serviceMode: "film", tierSlug: "chronicle", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(photo.ok && photo.deliverables?.includesDocumentary).toBe(false);
    expect(film.ok && film.deliverables?.includesDocumentary).toBe(true);
  });
  it("market isolation: Wedding Chapter/Photography resolves independently per market (Qatar vs Ghana)", () => {
    const qatar = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "qatar"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("qatar") });
    const ghana = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(qatar.ok && qatar.baseTierPriceUsd).toBe(850);
    expect(ghana.ok && ghana.baseTierPriceUsd).toBe(400);
  });
});

describe("calculateWeddingEstimate — Priority Delivery percentages", () => {
  it("Chapter and Narrative are +35%", () => {
    for (const tier of ["chapter", "narrative"] as const) {
      const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: tier, tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana"), priorityDeliveryRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.priorityDeliveryPercentage).toBe(35);
    }
  });
  it("Chronicle and Archive are +30%", () => {
    for (const tier of ["chronicle", "archive"] as const) {
      const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: tier, tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana"), priorityDeliveryRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.priorityDeliveryPercentage).toBe(30);
    }
  });
  it("is not applied unless requested", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priorityDeliveryRequested).toBe(false);
    expect(result.priorityDeliveryAmountUsd).toBe(0);
  });
  it("applies to the eligible subtotal (base + add-ons), computed correctly with no rounding drift", () => {
    const result = calculateWeddingEstimate({
      serviceMode: "photography",
      tierSlug: "chapter",
      tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"),
      tierDeliverables: WEDDING_DELIVERABLES,
      priorityDeliveryRates: WEDDING_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      droneRequested: true,
      priorityDeliveryRequested: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const eligible = 400 + 150; // chapter base + drone
    expect(result.eligibleSubtotalUsd).toBe(eligible);
    expect(result.priorityDeliveryAmountUsd).toBe(Math.round(eligible * 0.35 * 100) / 100);
  });
});

describe("calculateWeddingEstimate — additional hours use the rate matching the selected service mode", () => {
  for (const market of MARKETS) {
    for (const mode of MODES) {
      it(`${market} — ${mode}`, () => {
        const result = calculateWeddingEstimate({ serviceMode: mode, tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, market), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates(market), additionalHours: 2 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const expectedRate = ADDITIONAL_HOUR_RATES[mode][market];
        expect(result.lineItems.find((l) => l.label.includes("Additional coverage"))?.amountUsd).toBe(2 * expectedRate);
      });
    }
  }
});

describe("calculateWeddingEstimate — additional crew", () => {
  for (const market of MARKETS) {
    it(`${market} — additional photographer and filmmaker`, () => {
      const result = calculateWeddingEstimate({
        serviceMode: "photography_film",
        tierSlug: "chapter",
        tierRates: buildTierRates("wedding", WEDDING_RATES, market),
        tierDeliverables: WEDDING_DELIVERABLES,
        priorityDeliveryRates: WEDDING_PRIORITY,
        addonRates: fullAddonRates(market),
        additionalPhotographerDays: 1,
        additionalFilmmakerDays: 1,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label.includes("photographer"))?.amountUsd).toBe(ADDITIONAL_PHOTOGRAPHER_DAY[market]);
      expect(result.lineItems.find((l) => l.label.includes("filmmaker"))?.amountUsd).toBe(ADDITIONAL_FILMMAKER_DAY[market]);
    });
  }
});

describe("calculateWeddingEstimate — Pre-Wedding Session (wedding-only add-on)", () => {
  for (const market of MARKETS) {
    it(`${market}`, () => {
      const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, market), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates(market), preWeddingSessionRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label === "Pre-Wedding Session")?.amountUsd).toBe(PRE_WEDDING[market]);
    });
  }
});

describe("calculateWeddingEstimate — Drone", () => {
  for (const market of MARKETS) {
    it(`${market}`, () => {
      const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, market), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates(market), droneRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label.startsWith("Drone"))?.amountUsd).toBe(DRONE[market]);
    });
  }
});

describe("calculateWeddingEstimate — Same-Day Content", () => {
  for (const market of MARKETS) {
    it(`${market} — photo pack and highlight film`, () => {
      const result = calculateWeddingEstimate({
        serviceMode: "photography_film",
        tierSlug: "chapter",
        tierRates: buildTierRates("wedding", WEDDING_RATES, market),
        tierDeliverables: WEDDING_DELIVERABLES,
        priorityDeliveryRates: WEDDING_PRIORITY,
        addonRates: fullAddonRates(market),
        sameDayPhotoPackRequested: true,
        sameDayHighlightFilmRequested: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label.startsWith("Same-Day Photo"))?.amountUsd).toBe(SAME_DAY_PHOTO[market]);
      expect(result.lineItems.find((l) => l.label.startsWith("Same-Day Highlight"))?.amountUsd).toBe(SAME_DAY_FILM[market]);
    });
  }
});

describe("calculateWeddingEstimate — Full Event/Documentary Recording", () => {
  it("Chapter (not included): charges 20% of the Film rate, or the minimum, whichever is greater", () => {
    const result = calculateWeddingEstimate({
      serviceMode: "photography_film",
      tierSlug: "chapter",
      tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"),
      tierDeliverables: WEDDING_DELIVERABLES,
      priorityDeliveryRates: WEDDING_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      documentaryPercentage: 20,
      documentaryRecordingRequested: true,
      filmTierRateForDocumentaryUsd: 450, // Ghana wedding film chapter rate
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 20% of 450 = 90, below the Ghana minimum of 150 -> minimum applies
    expect(result.lineItems.find((l) => l.label.includes("Documentary"))?.amountUsd).toBe(150);
    expect(result.documentaryAlreadyIncluded).toBe(false);
  });
  it("Chronicle (already included): never double-charged, no-op with a flag", () => {
    const result = calculateWeddingEstimate({
      serviceMode: "photography_film",
      tierSlug: "chronicle",
      tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"),
      tierDeliverables: WEDDING_DELIVERABLES,
      priorityDeliveryRates: WEDDING_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      documentaryPercentage: 20,
      documentaryRecordingRequested: true,
      filmTierRateForDocumentaryUsd: 1300,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documentaryAlreadyIncluded).toBe(true);
    expect(result.lineItems.find((l) => l.label.includes("Documentary"))).toBeUndefined();
  });
  it("uses the higher of the percentage-based fee and the market minimum", () => {
    // Archive film rate 1850 x 20% = 370, above the Ghana minimum (150)
    const result = calculateWeddingEstimate({
      serviceMode: "photography",
      tierSlug: "chapter",
      tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"),
      tierDeliverables: WEDDING_DELIVERABLES,
      priorityDeliveryRates: WEDDING_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      documentaryPercentage: 20,
      documentaryRecordingRequested: true,
      filmTierRateForDocumentaryUsd: 1850,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems.find((l) => l.label.includes("Documentary"))?.amountUsd).toBe(370);
  });
});

describe("calculateWeddingEstimate — Albums, Frames & Presentation Drive", () => {
  it("charges quantity x rate for each selected product", () => {
    const result = calculateWeddingEstimate({
      serviceMode: "photography",
      tierSlug: "chapter",
      tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"),
      tierDeliverables: WEDDING_DELIVERABLES,
      priorityDeliveryRates: WEDDING_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      albumQuantities: { keepsake_album: 2, signature_album: 1 },
      frameQuantities: { frame_small: 3 },
      presentationDriveQuantity: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems.find((l) => l.label.startsWith("Keepsake"))?.amountUsd).toBe(250); // 2 x 125
    expect(result.lineItems.find((l) => l.label.startsWith("Signature Album"))?.amountUsd).toBe(200);
    expect(result.lineItems.find((l) => l.label.startsWith("Small"))?.amountUsd).toBe(150); // 3 x 50
    expect(result.lineItems.find((l) => l.label.startsWith("Presentation"))?.amountUsd).toBe(70); // 2 x 35
  });
});

describe("calculateWeddingEstimate — Custom Proposal routing", () => {
  it("an unpublished rate for the market/mode/tier routes to a custom quote", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: [], tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: {} });
    expect(result.ok).toBe(false);
  });
  it("missing deliverables routes to a custom quote", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: [], priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// EVENTS — all six markets, four coverage levels, three service modes
// ============================================================
describe("calculateEventEstimate — locked rates, all markets/coverage levels/modes", () => {
  for (const market of MARKETS) {
    for (const mode of MODES) {
      EVENT_TIERS.forEach((tier, i) => {
        it(`${market} — ${mode} — ${tier}`, () => {
          const result = calculateEventEstimate({
            serviceMode: mode,
            tierSlug: tier,
            tierRates: buildTierRates("event", EVENT_RATES, market),
            tierDeliverables: EVENT_DELIVERABLES,
            priorityDeliveryRates: EVENT_PRIORITY,
            addonRates: fullAddonRates(market),
          });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.baseTierPriceUsd).toBe(EVENT_RATES[mode][market][i]);
          expect(result.totalPriceUsd).toBe(EVENT_RATES[mode][market][i]);
        });
      });
    }
  }
});

// ============================================================
// Part 1/2/9/10/14 QA — medium-aware resolution, no stale state when
// switching medium, and isolation between markets. These directly
// exercise the fixed root cause: the resolved rate/deliverable must
// depend on the FULL combination (category + market + medium + tier),
// and editing/reading one combination must never leak into another.
// ============================================================
describe("calculateEventEstimate — deliverables are medium-aware (Part 2)", () => {
  it("Focused/Photography: photography-only deliverables, never advertises a film deliverable", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "qatar"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.photographers).toBe(1);
    expect(result.deliverables?.filmmakers).toBe(0);
    expect(result.deliverables?.highlightFilmMinMinutes).toBeNull();
    expect(result.deliverables?.includesDocumentary).toBe(false);
  });
  it("Focused/Film: film-only deliverables, never advertises a photographer/photo-count deliverable", () => {
    const result = calculateEventEstimate({ serviceMode: "film", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "qatar"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.filmmakers).toBe(1);
    expect(result.deliverables?.photographers).toBe(0);
    expect(result.deliverables?.professionallyEditedImagesMin).toBe(0);
    expect(result.deliverables?.signatureRetouchedImages).toBe(0);
    expect(result.deliverables?.highlightFilmMinMinutes).toBe(1);
  });
  it("Focused/Photography+Film: combined deliverables, strictly more comprehensive than either standalone medium", () => {
    const result = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "qatar"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliverables?.photographers).toBeGreaterThan(0);
    expect(result.deliverables?.filmmakers).toBeGreaterThan(0);
    expect(result.deliverables?.professionallyEditedImagesMin).toBeGreaterThan(0);
    expect(result.deliverables?.highlightFilmMinMinutes).not.toBeNull();
  });
  it("Round-the-Clock: Documentary is bundled for Film/Photography+Film, never fabricated for Photography-only", () => {
    const combined = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: "round_the_clock", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    const film = calculateEventEstimate({ serviceMode: "film", tierSlug: "round_the_clock", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    const photo = calculateEventEstimate({ serviceMode: "photography", tierSlug: "round_the_clock", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(combined.ok && combined.deliverables?.includesDocumentary).toBe(true);
    expect(film.ok && film.deliverables?.includesDocumentary).toBe(true);
    expect(photo.ok && photo.deliverables?.includesDocumentary).toBe(false);
  });
});

describe("calculateEventEstimate — no stale state switching Photography -> Film -> Photography+Film -> Photography (Part 1/14)", () => {
  it("repeated mode switches against the SAME shared rates/deliverables always resolve the currently-selected mode, never a previously-selected one", () => {
    const tierRates = buildTierRates("event", EVENT_RATES, "uk_western_europe");
    const sequence: ServiceMode[] = ["photography", "film", "photography_film", "photography"];
    for (const mode of sequence) {
      const result = calculateEventEstimate({ serviceMode: mode, tierSlug: "full_day", tierRates, tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("uk_western_europe") });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.baseTierPriceUsd).toBe(EVENT_RATES[mode].uk_western_europe[2]); // full_day is index 2
      expect(result.deliverables?.serviceMode).toBe(mode);
    }
  });
});

describe("calculateEventEstimate — market isolation (Part 10)", () => {
  it("the same category/medium/tier resolves independently per market — Qatar/GCC never shares its rate with Ghana/West Africa", () => {
    const qatarRates = buildTierRates("event", EVENT_RATES, "qatar");
    const ghanaRates = buildTierRates("event", EVENT_RATES, "ghana");
    const qatar = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: qatarRates, tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar") });
    const ghana = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: ghanaRates, tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(qatar.ok && qatar.baseTierPriceUsd).toBe(350);
    expect(ghana.ok && ghana.baseTierPriceUsd).toBe(175);
    expect(qatar.ok && qatar.baseTierPriceUsd).not.toBe(ghana.ok && ghana.baseTierPriceUsd);
  });
});

describe("calculateEventEstimate — Full Event (12h) and Round-the-Clock (24h) tiers (Part 5/6/12)", () => {
  it("coverage hours are 12 and 24 respectively, in every market/mode", () => {
    for (const market of MARKETS) {
      for (const mode of MODES) {
        const fullEvent = calculateEventEstimate({ serviceMode: mode, tierSlug: "full_event", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market) });
        const roundTheClock = calculateEventEstimate({ serviceMode: mode, tierSlug: "round_the_clock", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market) });
        expect(fullEvent.ok && fullEvent.deliverables?.coverageHours).toBe(12);
        expect(roundTheClock.ok && roundTheClock.deliverables?.coverageHours).toBe(24);
      }
    }
  });
  it("deliverable counts increase monotonically across all six coverage levels (genuine progression, Part 12)", () => {
    const rates = buildTierRates("event", EVENT_RATES, "ghana");
    const editedCounts = EVENT_TIERS.map((tier) => {
      const result = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: tier, tierRates: rates, tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
      return result.ok ? result.deliverables?.professionallyEditedImagesMin ?? 0 : 0;
    });
    for (let i = 1; i < editedCounts.length; i++) {
      expect(editedCounts[i]).toBeGreaterThan(editedCounts[i - 1]);
    }
  });
  it("Full Event/Round-the-Clock prices are strictly higher than Extended, in every market/mode (approved 4 tiers unchanged, new tiers extend the ladder upward)", () => {
    for (const market of MARKETS) {
      for (const mode of MODES) {
        const extended = EVENT_RATES[mode][market][3];
        const fullEvent = EVENT_RATES[mode][market][4];
        const roundTheClock = EVENT_RATES[mode][market][5];
        expect(fullEvent).toBeGreaterThan(extended);
        expect(roundTheClock).toBeGreaterThan(fullEvent);
      }
    }
  });
});

// ============================================================
// Package-upgrade architecture (Part 7, Founder-redesigned) — replaces
// the rejected "price the exploit away" approach. Ladder protection
// now lives in checkTierUpgrade()/EVENT_TIER_ORDER/WEDDING_TIER_ORDER,
// not in the Additional-Hour rate. These tests exercise the five
// worked examples from the approved proposal, plus genericity across
// every market/mode, plus the bypass for genuine day-of overtime.
// ============================================================
describe("calculateEventEstimate — package-upgrade recommendation (Part 1/7 approved architecture)", () => {
  it("Focused (1h) + 1 planned extra hour -> recommends Half Day, not Focused + hourly add-on", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresTierUpgrade).toBe(true);
    if (!result.requiresTierUpgrade) return;
    expect(result.recommendedTierSlug).toBe("half_day");
    expect(result.plannedTotalHours).toBe(2);
    expect(result.recommendedCoverageHours).toBe(2);
    expect(result.reason).not.toMatch(/exploit|loophole|undercut/i);
  });
  it("Half Day (2h) + 2 planned extra hours -> recommends Full Day", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "half_day", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresTierUpgrade).toBe(true);
    if (!result.requiresTierUpgrade) return;
    expect(result.recommendedTierSlug).toBe("full_day");
    expect(result.plannedTotalHours).toBe(4);
  });
  it("Full Day (4h) + 1 extra hour -> stays an ordinary add-on (5h, short of Extended's 8h)", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "full_day", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems.find((l) => l.label.includes("Additional coverage"))?.amountUsd).toBe(115); // moderate Ghana photo-hour rate
  });
  it("Extended (8h) + 2 extra hours -> stays an ordinary add-on (10h, short of Full Event's 12h)", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "extended", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems.find((l) => l.label.includes("Additional coverage"))?.amountUsd).toBe(2 * 115);
  });
  it("genuine overtime after booking/event commencement: bypassTierUpgradeCheck charges the standard overtime rate instead of forcing a package change", () => {
    // Same inputs as the Focused+1h example above, which would otherwise trigger an upgrade —
    // bypass models an already-confirmed Extended-tier booking that simply ran over on the day.
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 1, bypassTierUpgradeCheck: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseTierPriceUsd).toBe(175);
    expect(result.lineItems.find((l) => l.label.includes("Additional coverage"))?.amountUsd).toBe(115);
  });
  it("picks the HIGHEST qualifying tier, never an undershoot (Focused + 7h reaches Extended, not Half Day)", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 7 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresTierUpgrade).toBe(true);
    if (!result.requiresTierUpgrade) return;
    expect(result.recommendedTierSlug).toBe("extended");
  });
  it("at the top tier (Round-the-Clock), there is no higher tier to recommend — extra hours are always an ordinary add-on", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "round_the_clock", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 10 });
    expect(result.ok).toBe(true);
  });
  it("the recommendation holds across every market and mode (Focused + 1h always reaches Half Day)", () => {
    for (const market of MARKETS) {
      for (const mode of MODES) {
        const result = calculateEventEstimate({ serviceMode: mode, tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market), additionalHours: 1 });
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.requiresTierUpgrade).toBe(true);
        if (!result.requiresTierUpgrade) continue;
        expect(result.recommendedTierSlug).toBe("half_day");
      }
    }
  });
  it("formatTierUpgradeMessage() produces positive, service-oriented copy naming the correct tier and its deliverables, never internal anti-exploit terminology", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresTierUpgrade).toBe(true);
    if (!result.requiresTierUpgrade) return;
    const message = formatTierUpgradeMessage(result);
    expect(message).toContain("Package upgrade recommended");
    expect(message).toContain("Half Day");
    expect(message).not.toMatch(/exploit|loophole|arbitrage|undercut/i);
  });
});

describe("calculateWeddingEstimate — package-upgrade recommendation applies to Wedding too (same shared architecture)", () => {
  it("Chapter (4h) + 4 planned extra hours -> recommends Narrative (8h)", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 4 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresTierUpgrade).toBe(true);
    if (!result.requiresTierUpgrade) return;
    expect(result.recommendedTierSlug).toBe("narrative");
    expect(result.plannedTotalHours).toBe(8);
  });
  it("Chapter (4h) + 2 planned extra hours stays an ordinary add-on (6h, short of Narrative's 8h)", () => {
    const result = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana"), additionalHours: 2 });
    expect(result.ok).toBe(true);
  });
});

describe("calculateEventEstimate — Priority Delivery percentages", () => {
  it("Focused and Half Day are +35%", () => {
    for (const tier of ["focused", "half_day"] as const) {
      const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: tier, tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), priorityDeliveryRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.priorityDeliveryPercentage).toBe(35);
    }
  });
  it("Full Day and Extended are +30%", () => {
    for (const tier of ["full_day", "extended"] as const) {
      const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: tier, tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), priorityDeliveryRequested: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.priorityDeliveryPercentage).toBe(30);
    }
  });
});

describe("calculateEventEstimate — Corporate/Organisational Scope (+20%, opt-in only)", () => {
  it("is NOT applied merely by default — no automatic uplift based on client identity", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "half_day", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corporateScopeApplied).toBe(false);
    expect(result.corporateScopeAmountUsd).toBe(0);
    expect(result.totalPriceUsd).toBe(result.baseTierPriceUsd);
  });
  it("is applied only when explicitly requested, as 20% of the base+addons subtotal", () => {
    const result = calculateEventEstimate({
      serviceMode: "photography",
      tierSlug: "half_day",
      tierRates: buildTierRates("event", EVENT_RATES, "ghana"),
      tierDeliverables: EVENT_DELIVERABLES,
      priorityDeliveryRates: EVENT_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      corporateOrganisationalScopeRequested: true,
      corporateOrganisationalScopePercentage: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corporateScopeRequested).toBe(true);
    expect(result.corporateScopeApplied).toBe(true);
    expect(result.corporateScopeAmountUsd).toBe(Math.round(325 * 0.2 * 100) / 100);
  });
  it("requesting it with no published percentage requires a custom quote, not a silent no-op", () => {
    const result = calculateEventEstimate({
      serviceMode: "photography",
      tierSlug: "half_day",
      tierRates: buildTierRates("event", EVENT_RATES, "ghana"),
      tierDeliverables: EVENT_DELIVERABLES,
      priorityDeliveryRates: EVENT_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      corporateOrganisationalScopeRequested: true,
      corporateOrganisationalScopePercentage: null,
    });
    expect(result.ok).toBe(false);
  });
  it("Priority Delivery applies after the Corporate scope adjustment (compounds on the expanded subtotal)", () => {
    const result = calculateEventEstimate({
      serviceMode: "photography",
      tierSlug: "half_day",
      tierRates: buildTierRates("event", EVENT_RATES, "ghana"),
      tierDeliverables: EVENT_DELIVERABLES,
      priorityDeliveryRates: EVENT_PRIORITY,
      addonRates: fullAddonRates("ghana"),
      corporateOrganisationalScopeRequested: true,
      corporateOrganisationalScopePercentage: 20,
      priorityDeliveryRequested: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scopeAmount = Math.round(325 * 0.2 * 100) / 100;
    const eligible = Math.round((325 + scopeAmount) * 100) / 100;
    expect(result.eligibleSubtotalUsd).toBe(eligible);
    expect(result.priorityDeliveryAmountUsd).toBe(Math.round(eligible * 0.35 * 100) / 100);
  });
});

describe("calculateEventEstimate — Livestreaming", () => {
  for (const market of MARKETS) {
    it(`${market} — Single-Stream Basic`, () => {
      const result = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: "full_day", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market), livestreamTier: "single_basic" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label.includes("Single-Stream"))?.amountUsd).toBe(LIVESTREAM_BASIC[market]);
    });
    it(`${market} — Multi-Camera Standard`, () => {
      const result = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: "full_day", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market), livestreamTier: "multicam_standard" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lineItems.find((l) => l.label.includes("Multi-Camera"))?.amountUsd).toBe(LIVESTREAM_STANDARD[market]);
    });
  }
  it("Advanced/Hybrid always routes to a Custom Proposal, in every market", () => {
    for (const market of MARKETS) {
      const result = calculateEventEstimate({ serviceMode: "photography_film", tierSlug: "full_day", tierRates: buildTierRates("event", EVENT_RATES, market), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates(market), livestreamTier: "advanced_hybrid" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.requiresCustomQuote).toBe(true);
    }
  });
});

describe("calculateEventEstimate — additional hours / same-day / documentary / Custom routing (event parity with wedding)", () => {
  it("additional hours use the mode-matching rate", () => {
    // full_day (4h) + 3 planned extra hours = 7h, short of Extended's 8h — a
    // genuine partial extension, not a package-upgrade trigger (see the
    // dedicated "package-upgrade recommendation" describe block below).
    const result = calculateEventEstimate({ serviceMode: "film", tierSlug: "full_day", tierRates: buildTierRates("event", EVENT_RATES, "qatar"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar"), additionalHours: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems[0].amountUsd).toBe(3 * 260); // qatar film hour rate (moderate, Part 7 redesign)
  });
  it("Same-Day Content is available for events too", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana"), sameDayPhotoPackRequested: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems.find((l) => l.label.startsWith("Same-Day Photo"))?.amountUsd).toBe(150);
  });
  it("an unpublished coverage level routes to a Custom Proposal", () => {
    const result = calculateEventEstimate({ serviceMode: "photography", tierSlug: "full_day", tierRates: [], tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: {} });
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// RAW / SOURCE FILE — ADMIN GUIDANCE ONLY
// ============================================================
describe("calculateRawFileGuidance", () => {
  it("photography: 25% of service value or the market minimum, whichever is greater", () => {
    const result = calculateRawFileGuidance({ serviceMode: "photography", serviceValueUsd: 1000, rawPhotoGuidancePercentage: 25, rawVideoGuidancePercentage: 35, rawPhotoMinimumUsd: 200, rawVideoMinimumUsd: 300 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("photo");
    expect(result.suggestedAmountUsd).toBe(250); // 25% of 1000
  });
  it("photography: minimum wins when 25% of a small service value is below it", () => {
    const result = calculateRawFileGuidance({ serviceMode: "photography", serviceValueUsd: 400, rawPhotoGuidancePercentage: 25, rawVideoGuidancePercentage: 35, rawPhotoMinimumUsd: 200, rawVideoMinimumUsd: 300 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestedAmountUsd).toBe(200); // 25% of 400 = 100, below the 200 minimum
  });
  it("film: 35% of service value or the market minimum, whichever is greater", () => {
    const result = calculateRawFileGuidance({ serviceMode: "film", serviceValueUsd: 1000, rawPhotoGuidancePercentage: 25, rawVideoGuidancePercentage: 35, rawPhotoMinimumUsd: 200, rawVideoMinimumUsd: 300 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("video");
    expect(result.suggestedAmountUsd).toBe(350);
  });
  it("combined Photography+Film mode always requires manual assessment — never an invented blended formula", () => {
    const result = calculateRawFileGuidance({ serviceMode: "photography_film", serviceValueUsd: 1000, rawPhotoGuidancePercentage: 25, rawVideoGuidancePercentage: 35, rawPhotoMinimumUsd: 200, rawVideoMinimumUsd: 300 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.requiresManualAssessment).toBe(true);
  });
  it("missing percentage/minimum requires manual assessment rather than a $0 guess", () => {
    const result = calculateRawFileGuidance({ serviceMode: "photography", serviceValueUsd: 1000, rawPhotoGuidancePercentage: null, rawVideoGuidancePercentage: 35, rawPhotoMinimumUsd: 200, rawVideoMinimumUsd: 300 });
    expect(result.ok).toBe(false);
  });
});

describe("calculateWeddingEstimate / calculateEventEstimate — no customer-nationality pricing signal", () => {
  it("neither function accepts any nationality/IP/geolocation/religion/culture parameter", () => {
    const wedding = calculateWeddingEstimate({ serviceMode: "photography", tierSlug: "chapter", tierRates: buildTierRates("wedding", WEDDING_RATES, "ghana"), tierDeliverables: WEDDING_DELIVERABLES, priorityDeliveryRates: WEDDING_PRIORITY, addonRates: fullAddonRates("ghana") });
    const event = calculateEventEstimate({ serviceMode: "photography", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "ghana"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("ghana") });
    expect(wedding.ok).toBe(true);
    expect(event.ok).toBe(true);
  });
});
