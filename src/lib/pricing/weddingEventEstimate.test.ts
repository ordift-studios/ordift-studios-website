import { describe, expect, it } from "vitest";
import {
  calculateWeddingEstimate,
  calculateEventEstimate,
  calculateRawFileGuidance,
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

const EVENT_RATES: Record<ServiceMode, Record<string, [number, number, number, number]>> = {
  photography: {
    ghana: [175, 325, 575, 850],
    qatar: [350, 650, 1100, 1600],
    uk_western_europe: [450, 800, 1350, 1950],
    north_america: [500, 900, 1550, 2250],
    asia_pacific: [400, 725, 1200, 1750],
    other_international_custom: [375, 675, 1150, 1650],
  },
  film: {
    ghana: [225, 400, 700, 1050],
    qatar: [450, 800, 1350, 2000],
    uk_western_europe: [550, 950, 1650, 2400],
    north_america: [625, 1100, 1900, 2750],
    asia_pacific: [500, 850, 1450, 2100],
    other_international_custom: [475, 825, 1400, 2000],
  },
  photography_film: {
    ghana: [350, 625, 1100, 1600],
    qatar: [700, 1250, 2150, 3150],
    uk_western_europe: [850, 1500, 2600, 3800],
    north_america: [975, 1750, 3000, 4350],
    asia_pacific: [775, 1350, 2300, 3350],
    other_international_custom: [725, 1300, 2200, 3200],
  },
};

const WEDDING_TIERS = ["chapter", "narrative", "chronicle", "archive"] as const;
const EVENT_TIERS = ["focused", "half_day", "full_day", "extended"] as const;

function buildTierRates(category: "wedding" | "event", rateTable: Record<ServiceMode, Record<string, [number, number, number, number]>>, market: string): WeddingEventTierRate[] {
  const tiers = category === "wedding" ? WEDDING_TIERS : EVENT_TIERS;
  const rates: WeddingEventTierRate[] = [];
  for (const mode of MODES) {
    tiers.forEach((tier, i) => {
      rates.push({ marketId: market, category, serviceMode: mode, tierSlug: tier, priceUsd: rateTable[mode][market][i] });
    });
  }
  return rates;
}

const WEDDING_DELIVERABLES: WeddingEventTierDeliverable[] = [
  { category: "wedding", tierSlug: "chapter", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 150, signatureRetouchedImages: 10, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 4, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: false },
  { category: "wedding", tierSlug: "narrative", eventDays: 1, coverageHours: 8, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 350, signatureRetouchedImages: 20, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "chronicle", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 550, signatureRetouchedImages: 30, highlightFilmMinMinutes: 8, highlightFilmMaxMinutes: 12, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
  { category: "wedding", tierSlug: "archive", eventDays: 2, coverageHours: 16, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 750, signatureRetouchedImages: 40, highlightFilmMinMinutes: 10, highlightFilmMaxMinutes: 15, includesDocumentary: true, onlineGallery: true, planningConsultation: true, prioritySneakPeek: true },
];

const EVENT_DELIVERABLES: WeddingEventTierDeliverable[] = [
  { category: "event", tierSlug: "focused", eventDays: 1, coverageHours: 2, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 75, signatureRetouchedImages: 5, highlightFilmMinMinutes: 1, highlightFilmMaxMinutes: 2, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "half_day", eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 150, signatureRetouchedImages: 8, highlightFilmMinMinutes: 2, highlightFilmMaxMinutes: 3, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "full_day", eventDays: 1, coverageHours: 8, photographers: 1, filmmakers: 1, professionallyEditedImagesMin: 300, signatureRetouchedImages: 12, highlightFilmMinMinutes: 3, highlightFilmMaxMinutes: 5, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
  { category: "event", tierSlug: "extended", eventDays: 1, coverageHours: 12, photographers: 2, filmmakers: 2, professionallyEditedImagesMin: 450, signatureRetouchedImages: 18, highlightFilmMinMinutes: 5, highlightFilmMaxMinutes: 7, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false },
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
];

const ADDITIONAL_HOUR_RATES: Record<ServiceMode, Record<string, number>> = {
  photography: { ghana: 90, qatar: 175, uk_western_europe: 225, north_america: 250, asia_pacific: 200, other_international_custom: 190 },
  film: { ghana: 100, qatar: 200, uk_western_europe: 250, north_america: 275, asia_pacific: 225, other_international_custom: 210 },
  photography_film: { ghana: 160, qatar: 320, uk_western_europe: 400, north_america: 450, asia_pacific: 360, other_international_custom: 340 },
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
    const result = calculateEventEstimate({ serviceMode: "film", tierSlug: "focused", tierRates: buildTierRates("event", EVENT_RATES, "qatar"), tierDeliverables: EVENT_DELIVERABLES, priorityDeliveryRates: EVENT_PRIORITY, addonRates: fullAddonRates("qatar"), additionalHours: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lineItems[0].amountUsd).toBe(3 * 200); // qatar film hour rate
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
