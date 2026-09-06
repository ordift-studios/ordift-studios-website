// Ordift Weddings & Events Pricing V1 (2026-09-06) — pure calculation
// logic and shared types only. Deliberately has ZERO imports of any
// kind — safe to import from a Client Component without pulling
// server-only code into the browser bundle, same established pattern
// as personalSessionEstimate.ts / corporateHeadshotEstimate.ts. Market
// is determined ONLY by an explicit, user-selected "where will the
// shoot take place" choice — never by customer nationality, residence,
// IP address, or browser geolocation. Wedding/Event pricing is scoped
// by PRODUCTION SCOPE (functions/hours/days/crew/collection), never by
// religion, culture, or wedding-tradition labels.

export type WeddingEventCategory = "wedding" | "event";
export type ServiceMode = "photography" | "film" | "photography_film";
export type WeddingTierSlug = "chapter" | "narrative" | "chronicle" | "archive";
export type EventTierSlug = "focused" | "half_day" | "full_day" | "extended";
export type LivestreamTier = "single_basic" | "multicam_standard" | "advanced_hybrid";

export type AddonSlug =
  | "additional_photo_hour"
  | "additional_film_hour"
  | "additional_photofilm_hour"
  | "additional_photographer_day"
  | "additional_filmmaker_day"
  | "pre_wedding_session"
  | "drone"
  | "same_day_photo_pack"
  | "same_day_highlight_film"
  | "documentary_recording_minimum"
  | "livestream_single_basic"
  | "livestream_multicam_standard"
  | "raw_photo_guidance_minimum"
  | "raw_video_guidance_minimum"
  | "keepsake_album"
  | "signature_album"
  | "archive_album"
  | "companion_album"
  | "frame_small"
  | "frame_medium"
  | "frame_large"
  | "frame_statement"
  | "presentation_drive";

export type PercentageSlug = "corporate_organisational_scope" | "documentary_recording" | "raw_photo_guidance" | "raw_video_guidance";

export type WeddingEventTierRate = {
  marketId: string;
  category: WeddingEventCategory;
  serviceMode: ServiceMode;
  tierSlug: string;
  priceUsd: number;
};

export type WeddingEventTierDeliverable = {
  category: WeddingEventCategory;
  tierSlug: string;
  eventDays: number;
  coverageHours: number;
  photographers: number;
  filmmakers: number;
  professionallyEditedImagesMin: number;
  signatureRetouchedImages: number;
  highlightFilmMinMinutes: number | null;
  highlightFilmMaxMinutes: number | null;
  includesDocumentary: boolean;
  onlineGallery: boolean;
  planningConsultation: boolean;
  prioritySneakPeek: boolean;
};

export type WeddingEventPriorityDeliveryRate = {
  category: WeddingEventCategory;
  tierSlug: string;
  multiplierPercentage: number;
};

export type AlbumSlug = "keepsake_album" | "signature_album" | "archive_album" | "companion_album";
export type FrameSlug = "frame_small" | "frame_medium" | "frame_large" | "frame_statement";

export type WeddingEventLineItem = { label: string; amountUsd: number };

export type WeddingEventEstimateResult =
  | {
      ok: true;
      baseTierPriceUsd: number;
      lineItems: WeddingEventLineItem[];
      documentaryAlreadyIncluded: boolean;
      corporateScopeRequested: boolean;
      corporateScopeApplied: boolean;
      corporateScopeAmountUsd: number;
      eligibleSubtotalUsd: number;
      priorityDeliveryRequested: boolean;
      priorityDeliveryPercentage: number | null;
      priorityDeliveryAmountUsd: number;
      totalPriceUsd: number;
      deliverables: WeddingEventTierDeliverable | null;
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function additionalHourAddonSlug(serviceMode: ServiceMode): AddonSlug {
  if (serviceMode === "photography") return "additional_photo_hour";
  if (serviceMode === "film") return "additional_film_hour";
  return "additional_photofilm_hour";
}

type SharedAddonParams = {
  additionalHours?: number;
  additionalPhotographerDays?: number;
  additionalFilmmakerDays?: number;
  droneRequested?: boolean;
  sameDayPhotoPackRequested?: boolean;
  sameDayHighlightFilmRequested?: boolean;
  documentaryRecordingRequested?: boolean;
  filmTierRateForDocumentaryUsd?: number | null; // the market/tier's FILM-only rate, used as "Film base price" reference even when the client's own selection is photography_film — combined rates are not decomposable, see docs.
  albumQuantities?: Partial<Record<AlbumSlug, number>>;
  frameQuantities?: Partial<Record<FrameSlug, number>>;
  presentationDriveQuantity?: number;
  priorityDeliveryRequested?: boolean;
};

// Shared line-item + priority computation used by both the Wedding and
// Event calculators — the only difference between the two public
// entry points below is which category/tier vocabulary and which
// category-exclusive add-ons (Pre-Wedding Session for weddings;
// Livestream + Corporate/Organisational Scope for events) apply.
function computeSharedLineItems(params: {
  serviceMode: ServiceMode;
  addonRates: Partial<Record<AddonSlug, number>>;
  deliverable: WeddingEventTierDeliverable;
  documentaryPercentage: number | null;
} & SharedAddonParams): { ok: true; lineItems: WeddingEventLineItem[]; documentaryAlreadyIncluded: boolean } | { ok: false; requiresCustomQuote: true; reason: string } {
  const lineItems: WeddingEventLineItem[] = [];
  const addonRates = params.addonRates;

  const additionalHours = params.additionalHours ?? 0;
  if (additionalHours > 0) {
    const slug = additionalHourAddonSlug(params.serviceMode);
    const rate = addonRates[slug];
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Additional coverage hour pricing isn't published for this market/service yet." };
    lineItems.push({ label: `Additional coverage × ${additionalHours}h`, amountUsd: roundMoney(additionalHours * rate) });
  }

  const additionalPhotographerDays = params.additionalPhotographerDays ?? 0;
  if (additionalPhotographerDays > 0) {
    const rate = addonRates.additional_photographer_day;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Additional photographer pricing isn't published for this market yet." };
    lineItems.push({ label: `Additional photographer × ${additionalPhotographerDays} day(s)`, amountUsd: roundMoney(additionalPhotographerDays * rate) });
  }

  const additionalFilmmakerDays = params.additionalFilmmakerDays ?? 0;
  if (additionalFilmmakerDays > 0) {
    const rate = addonRates.additional_filmmaker_day;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Additional filmmaker pricing isn't published for this market yet." };
    lineItems.push({ label: `Additional filmmaker × ${additionalFilmmakerDays} day(s)`, amountUsd: roundMoney(additionalFilmmakerDays * rate) });
  }

  if (params.droneRequested) {
    const rate = addonRates.drone;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Drone coverage pricing isn't published for this market yet." };
    lineItems.push({ label: "Drone coverage (subject to law, permission, weather, safety and availability)", amountUsd: rate });
  }

  if (params.sameDayPhotoPackRequested) {
    const rate = addonRates.same_day_photo_pack;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Same-Day Photo Social Pack pricing isn't published for this market yet." };
    lineItems.push({ label: "Same-Day Photo Social Pack (subject to crew/editor availability)", amountUsd: rate });
  }

  if (params.sameDayHighlightFilmRequested) {
    const rate = addonRates.same_day_highlight_film;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Same-Day Highlight Film pricing isn't published for this market yet." };
    lineItems.push({ label: "Same-Day Highlight Film (subject to crew/editor availability)", amountUsd: rate });
  }

  let documentaryAlreadyIncluded = false;
  if (params.documentaryRecordingRequested) {
    if (params.deliverable.includesDocumentary) {
      documentaryAlreadyIncluded = true; // no-op: already part of this tier, never double-charged
    } else {
      const filmBase = params.filmTierRateForDocumentaryUsd;
      const minimum = addonRates.documentary_recording_minimum;
      if (filmBase == null || minimum === undefined || params.documentaryPercentage === null) {
        return { ok: false, requiresCustomQuote: true, reason: "Full Event/Documentary recording pricing isn't published for this market/tier yet." };
      }
      const amount = Math.max(roundMoney(filmBase * (params.documentaryPercentage / 100)), minimum);
      lineItems.push({ label: "Full Event/Documentary Recording", amountUsd: roundMoney(amount) });
    }
  }

  for (const [slug, quantity] of Object.entries(params.albumQuantities ?? {}) as [AlbumSlug, number][]) {
    if (!quantity) continue;
    const rate = addonRates[slug];
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: `Pricing for ${slug.replace(/_/g, " ")} isn't published for this market yet.` };
    lineItems.push({ label: `${ALBUM_LABELS[slug]} × ${quantity}`, amountUsd: roundMoney(quantity * rate) });
  }

  for (const [slug, quantity] of Object.entries(params.frameQuantities ?? {}) as [FrameSlug, number][]) {
    if (!quantity) continue;
    const rate = addonRates[slug];
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: `Pricing for ${slug.replace(/_/g, " ")} isn't published for this market yet.` };
    lineItems.push({ label: `${FRAME_LABELS[slug]} × ${quantity}`, amountUsd: roundMoney(quantity * rate) });
  }

  const presentationDriveQuantity = params.presentationDriveQuantity ?? 0;
  if (presentationDriveQuantity > 0) {
    const rate = addonRates.presentation_drive;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Presentation Drive pricing isn't published for this market yet." };
    lineItems.push({ label: `Presentation Drive × ${presentationDriveQuantity}`, amountUsd: roundMoney(presentationDriveQuantity * rate) });
  }

  return { ok: true, lineItems, documentaryAlreadyIncluded };
}

const ALBUM_LABELS: Record<AlbumSlug, string> = {
  keepsake_album: "Keepsake Album",
  signature_album: "Signature Album",
  archive_album: "Archive Album",
  companion_album: "Parent / Companion Album",
};
const FRAME_LABELS: Record<FrameSlug, string> = {
  frame_small: "Small / Desk Frame",
  frame_medium: "Medium Frame",
  frame_large: "Large Frame",
  frame_statement: "Statement Frame",
};

function findTierRate(rates: WeddingEventTierRate[], category: WeddingEventCategory, serviceMode: ServiceMode, tierSlug: string): number | null {
  const rate = rates.find((r) => r.category === category && r.serviceMode === serviceMode && r.tierSlug === tierSlug);
  return rate ? rate.priceUsd : null;
}

function findDeliverable(deliverables: WeddingEventTierDeliverable[], category: WeddingEventCategory, tierSlug: string): WeddingEventTierDeliverable | null {
  return deliverables.find((d) => d.category === category && d.tierSlug === tierSlug) ?? null;
}

function findPriorityPercentage(rates: WeddingEventPriorityDeliveryRate[], category: WeddingEventCategory, tierSlug: string): number | null {
  const rate = rates.find((r) => r.category === category && r.tierSlug === tierSlug);
  return rate ? rate.multiplierPercentage : null;
}

// ============================================================
// WEDDING CELEBRATIONS
// ============================================================
export function calculateWeddingEstimate(
  params: {
    serviceMode: ServiceMode;
    tierSlug: WeddingTierSlug;
    tierRates: WeddingEventTierRate[];
    tierDeliverables: WeddingEventTierDeliverable[];
    priorityDeliveryRates: WeddingEventPriorityDeliveryRate[];
    addonRates: Partial<Record<AddonSlug, number>>;
    documentaryPercentage?: number | null;
    preWeddingSessionRequested?: boolean;
  } & SharedAddonParams
): WeddingEventEstimateResult {
  const baseTierPriceUsd = findTierRate(params.tierRates, "wedding", params.serviceMode, params.tierSlug);
  if (baseTierPriceUsd === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Wedding pricing for this collection/service isn't published for the selected market yet." };
  }
  const deliverable = findDeliverable(params.tierDeliverables, "wedding", params.tierSlug);
  if (!deliverable) {
    return { ok: false, requiresCustomQuote: true, reason: "Wedding deliverables aren't published for this collection yet." };
  }

  const shared = computeSharedLineItems({
    ...params,
    deliverable,
    documentaryPercentage: params.documentaryPercentage ?? null,
  });
  if (!shared.ok) return shared;

  const lineItems = [...shared.lineItems];
  if (params.preWeddingSessionRequested) {
    const rate = params.addonRates.pre_wedding_session;
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Pre-Wedding Session pricing isn't published for this market yet." };
    lineItems.push({ label: "Pre-Wedding Session", amountUsd: rate });
  }

  const addonsTotal = lineItems.reduce((sum, item) => sum + item.amountUsd, 0);
  const eligibleSubtotalUsd = roundMoney(baseTierPriceUsd + addonsTotal);

  const priorityDeliveryRequested = params.priorityDeliveryRequested ?? false;
  const priorityDeliveryPercentage = findPriorityPercentage(params.priorityDeliveryRates, "wedding", params.tierSlug);
  if (priorityDeliveryRequested && priorityDeliveryPercentage === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Priority Delivery pricing isn't published for this collection yet." };
  }
  const priorityDeliveryAmountUsd = priorityDeliveryRequested ? roundMoney(eligibleSubtotalUsd * ((priorityDeliveryPercentage ?? 0) / 100)) : 0;

  return {
    ok: true,
    baseTierPriceUsd,
    lineItems,
    documentaryAlreadyIncluded: shared.documentaryAlreadyIncluded,
    corporateScopeRequested: false,
    corporateScopeApplied: false,
    corporateScopeAmountUsd: 0,
    eligibleSubtotalUsd,
    priorityDeliveryRequested,
    priorityDeliveryPercentage,
    priorityDeliveryAmountUsd,
    totalPriceUsd: roundMoney(eligibleSubtotalUsd + priorityDeliveryAmountUsd),
    deliverables: deliverable,
  };
}

// ============================================================
// EVENTS
// ============================================================
export function calculateEventEstimate(
  params: {
    serviceMode: ServiceMode;
    tierSlug: EventTierSlug;
    tierRates: WeddingEventTierRate[];
    tierDeliverables: WeddingEventTierDeliverable[];
    priorityDeliveryRates: WeddingEventPriorityDeliveryRate[];
    addonRates: Partial<Record<AddonSlug, number>>;
    documentaryPercentage?: number | null;
    livestreamTier?: LivestreamTier | null;
    corporateOrganisationalScopeRequested?: boolean;
    corporateOrganisationalScopePercentage?: number | null;
  } & SharedAddonParams
): WeddingEventEstimateResult {
  if (params.livestreamTier === "advanced_hybrid") {
    return { ok: false, requiresCustomQuote: true, reason: "Advanced / Hybrid Livestreaming always requires a Custom Proposal — subject to technical assessment, connectivity, platform requirements, venue conditions and production availability." };
  }

  const baseTierPriceUsd = findTierRate(params.tierRates, "event", params.serviceMode, params.tierSlug);
  if (baseTierPriceUsd === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Event pricing for this coverage level/service isn't published for the selected market yet." };
  }
  const deliverable = findDeliverable(params.tierDeliverables, "event", params.tierSlug);
  if (!deliverable) {
    return { ok: false, requiresCustomQuote: true, reason: "Event deliverables aren't published for this coverage level yet." };
  }

  const shared = computeSharedLineItems({
    ...params,
    deliverable,
    documentaryPercentage: params.documentaryPercentage ?? null,
  });
  if (!shared.ok) return shared;

  const lineItems = [...shared.lineItems];

  if (params.livestreamTier === "single_basic" || params.livestreamTier === "multicam_standard") {
    const slug: AddonSlug = params.livestreamTier === "single_basic" ? "livestream_single_basic" : "livestream_multicam_standard";
    const rate = params.addonRates[slug];
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Livestreaming pricing isn't published for this market yet." };
    lineItems.push({ label: params.livestreamTier === "single_basic" ? "Livestream — Single-Stream Basic" : "Livestream — Multi-Camera Standard", amountUsd: rate });
  }

  const baseAddonsSubtotal = roundMoney(baseTierPriceUsd + lineItems.reduce((sum, item) => sum + item.amountUsd, 0));

  const corporateScopeRequested = params.corporateOrganisationalScopeRequested ?? false;
  let corporateScopeApplied = false;
  let corporateScopeAmountUsd = 0;
  if (corporateScopeRequested) {
    if (params.corporateOrganisationalScopePercentage == null) {
      return { ok: false, requiresCustomQuote: true, reason: "Corporate/Organisational production scope pricing isn't published yet." };
    }
    corporateScopeApplied = true;
    corporateScopeAmountUsd = roundMoney(baseAddonsSubtotal * (params.corporateOrganisationalScopePercentage / 100));
  }

  const eligibleSubtotalUsd = roundMoney(baseAddonsSubtotal + corporateScopeAmountUsd);

  const priorityDeliveryRequested = params.priorityDeliveryRequested ?? false;
  const priorityDeliveryPercentage = findPriorityPercentage(params.priorityDeliveryRates, "event", params.tierSlug);
  if (priorityDeliveryRequested && priorityDeliveryPercentage === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Priority Delivery pricing isn't published for this coverage level yet." };
  }
  const priorityDeliveryAmountUsd = priorityDeliveryRequested ? roundMoney(eligibleSubtotalUsd * ((priorityDeliveryPercentage ?? 0) / 100)) : 0;

  return {
    ok: true,
    baseTierPriceUsd,
    lineItems,
    documentaryAlreadyIncluded: shared.documentaryAlreadyIncluded,
    corporateScopeRequested,
    corporateScopeApplied,
    corporateScopeAmountUsd,
    eligibleSubtotalUsd,
    priorityDeliveryRequested,
    priorityDeliveryPercentage,
    priorityDeliveryAmountUsd,
    totalPriceUsd: roundMoney(eligibleSubtotalUsd + priorityDeliveryAmountUsd),
    deliverables: deliverable,
  };
}

// ============================================================
// RAW / SOURCE FILE — ADMIN GUIDANCE ONLY. Never client-purchasable;
// never automatically transfers copyright; Admin can approve, increase,
// reduce, or refuse. Combined Photography+Film productions have no
// clean single attributable service value, so guidance is deliberately
// NOT computed for that mode — Admin must assess it manually instead
// of receiving an invented blended formula.
// ============================================================
export type RawFileGuidanceResult =
  | { ok: true; kind: "photo" | "video"; suggestedAmountUsd: number }
  | { ok: false; requiresManualAssessment: true; reason: string };

export function calculateRawFileGuidance(params: {
  serviceMode: ServiceMode;
  serviceValueUsd: number;
  rawPhotoGuidancePercentage: number | null;
  rawVideoGuidancePercentage: number | null;
  rawPhotoMinimumUsd: number | null;
  rawVideoMinimumUsd: number | null;
}): RawFileGuidanceResult {
  if (params.serviceMode === "photography_film") {
    return { ok: false, requiresManualAssessment: true, reason: "Combined Photography + Film productions don't have a single attributable service value — assess the appropriate Photo/Film split manually." };
  }
  if (params.serviceMode === "photography") {
    if (params.rawPhotoGuidancePercentage === null || params.rawPhotoMinimumUsd === null) {
      return { ok: false, requiresManualAssessment: true, reason: "RAW photo guidance percentage/minimum isn't published for this market yet." };
    }
    const suggested = Math.max(roundMoney(params.serviceValueUsd * (params.rawPhotoGuidancePercentage / 100)), params.rawPhotoMinimumUsd);
    return { ok: true, kind: "photo", suggestedAmountUsd: roundMoney(suggested) };
  }
  if (params.rawVideoGuidancePercentage === null || params.rawVideoMinimumUsd === null) {
    return { ok: false, requiresManualAssessment: true, reason: "RAW video guidance percentage/minimum isn't published for this market yet." };
  }
  const suggested = Math.max(roundMoney(params.serviceValueUsd * (params.rawVideoGuidancePercentage / 100)), params.rawVideoMinimumUsd);
  return { ok: true, kind: "video", suggestedAmountUsd: roundMoney(suggested) };
}
