// Ordift Commercial / Advertising Pricing V1 (2026-09-07) — pure
// calculation logic and shared types only. Zero imports — safe to
// import from a Client Component, same established pattern as every
// other pricing family's *_estimate.ts. Production market and usage
// territory are deliberately different concepts here: market drives
// only the Creative Fee/Catalogue/Review-threshold lookups; usage
// territory is a separate, explicit client selection, never inferred
// from the shoot location, nationality, IP, or geolocation.
//
// Unlike the other pricing families' ok:true/ok:false union result,
// this calculator always returns one typed result (per the approved
// spec): a Custom Proposal condition sets customProposalRequired=true
// with a human-readable reason in customReasons, while still surfacing
// whatever indicative figures are safely computable — it never pretends
// a Custom condition can be silently priced through instead.

export type CommercialServiceMode = "photography" | "film" | "photography_film";
export type CommercialScopeSlug = "focused" | "full_day" | "extended";

export type CommercialCreativeFeeRate = {
  marketId: string;
  serviceMode: CommercialServiceMode;
  scopeSlug: CommercialScopeSlug;
  priceUsd: number;
};

export type CatalogueComplexity = "clean" | "premium";
export type CatalogueVolumeTierSlug = "1-10" | "11-25" | "26-50" | "51-100";

export type CommercialCatalogueVolumeFactor = { tierSlug: CatalogueVolumeTierSlug; minQuantity: number; maxQuantity: number; factor: number };
export type CommercialCatalogueComplexityFactor = { complexity: CatalogueComplexity; factor: number };

export type CommercialPostProductionItemSlug =
  | "additional_finished_image"
  | "advanced_retouch"
  | "high_end_retouch"
  | "creative_composite"
  | "cutdown_15s"
  | "cutdown_30s"
  | "alternate_edit_60s"
  | "vertical_adaptation"
  | "aspect_ratio_adaptation"
  | "caption_master"
  | "motion_graphics_basic"
  | "revision_round";

export type CommercialPostProductionRate = { itemSlug: CommercialPostProductionItemSlug; priceUsd: number; isFromPrice: boolean };

export type CommercialUsageFactorSlug =
  | "internal_trade_presentation"
  | "website_organic_social"
  | "pr_editorial_earned_media"
  | "paid_digital_advertising"
  | "print_advertising"
  | "paid_digital_print_campaign"
  | "packaging_pos"
  | "ooh_billboard"
  | "broadcast_streaming_advertising"
  | "integrated_multimedia_campaign";

export type CommercialDurationFactorSlug = "3_months" | "6_months" | "12_months" | "24_months" | "36_months" | "5_years";
export type CommercialTerritoryFactorSlug = "local_city" | "national" | "regional_multicountry" | "international" | "worldwide";
export type CommercialExclusivitySlug = "non_exclusive" | "category_exclusive" | "full_exclusive";

export type CommercialLicensingFactors = {
  usage: Partial<Record<CommercialUsageFactorSlug, number>>;
  duration: Partial<Record<CommercialDurationFactorSlug, number>>;
  territory: Partial<Record<CommercialTerritoryFactorSlug, number>>;
  exclusivity: Partial<Record<CommercialExclusivitySlug, number>>;
};

export type CommercialReviewThreshold = { reviewUsd: number; mandatoryUsd: number };
export type CommercialReviewState = "normal" | "commercial_review" | "custom_proposal_required";

export type CommercialLineItem = { label: string; amountUsd: number };

export type CommercialEstimateResult = {
  creativeFeeUsd: number | null;
  catalogueFeeUsd: number | null;
  productionSubtotalUsd: number;
  talentFeeUsd: number;
  talentUsageFeeUsd: number;
  postProductionSubtotalUsd: number;
  usageLicenceUsd: number | null;
  priorityAmountUsd: number;
  estimatedTotalUsd: number;
  reviewState: CommercialReviewState;
  customProposalRequired: boolean;
  customReasons: string[];
  lineItems: CommercialLineItem[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Full-exclusivity safeguard (approved but abstractly worded as
// "subject to Custom Proposal safeguards" / "trigger Custom where the
// campaign scope is sufficiently broad/complex") — operationalized here
// as: full exclusivity combined with an international/worldwide
// territory, a broadcast/OOH/integrated-multimedia usage, or a 36-month+
// duration. This always errs toward requiring review, never toward
// under-quoting a broad rights grant.
const BROAD_USAGE_SLUGS: CommercialUsageFactorSlug[] = ["ooh_billboard", "broadcast_streaming_advertising", "integrated_multimedia_campaign"];
const BROAD_TERRITORY_SLUGS: CommercialTerritoryFactorSlug[] = ["international", "worldwide"];
const BROAD_DURATION_SLUGS: CommercialDurationFactorSlug[] = ["36_months", "5_years"];

export function calculateCommercialProductionEstimate(params: {
  serviceMode: CommercialServiceMode;
  scopeSlug: CommercialScopeSlug;
  creativeFeeRates: CommercialCreativeFeeRate[];
  postProductionRates: CommercialPostProductionRate[];
  postProductionSelections?: Partial<Record<CommercialPostProductionItemSlug, number>>;
  advancedVfxRequested?: boolean;
  priorityRequested?: boolean;
  priorityPercentage?: number | null;
  productionBudgetUsd?: number;
  talentFeeUsd?: number;
  talentUsageFeeUsd?: number;
  usageSlug?: CommercialUsageFactorSlug;
  durationSlug?: CommercialDurationFactorSlug | "perpetual";
  territorySlug?: CommercialTerritoryFactorSlug;
  exclusivitySlug?: CommercialExclusivitySlug;
  copyrightAssignmentRequested?: boolean;
  licensingFactors: CommercialLicensingFactors;
  licensingFloorPercentage?: number | null;
  requiresBespokeAssessment?: boolean;
  reviewThreshold?: CommercialReviewThreshold | null;
}): CommercialEstimateResult {
  const customReasons: string[] = [];
  const lineItems: CommercialLineItem[] = [];

  // ---- Creative Fee ----
  const rate = params.creativeFeeRates.find((r) => r.serviceMode === params.serviceMode && r.scopeSlug === params.scopeSlug);
  const creativeFeeUsd = rate ? rate.priceUsd : null;
  if (!rate) customReasons.push("Creative fee pricing isn't published for this market/service/scope yet — a Custom Production Proposal is required.");

  // ---- Production / Talent (Admin/known amounts — never auto-priced) ----
  const productionSubtotalUsd = roundMoney(params.productionBudgetUsd ?? 0);
  const talentFeeUsd = roundMoney(params.talentFeeUsd ?? 0);
  const talentUsageFeeUsd = roundMoney(params.talentUsageFeeUsd ?? 0);
  if (productionSubtotalUsd > 0) lineItems.push({ label: "Production", amountUsd: productionSubtotalUsd });
  if (talentFeeUsd > 0) lineItems.push({ label: "Talent Fee", amountUsd: talentFeeUsd });
  if (talentUsageFeeUsd > 0) lineItems.push({ label: "Talent Usage Fee", amountUsd: talentUsageFeeUsd });

  // ---- Post-production ----
  let postProductionSubtotalUsd = 0;
  for (const [slug, quantity] of Object.entries(params.postProductionSelections ?? {}) as [CommercialPostProductionItemSlug, number][]) {
    if (!quantity) continue;
    const item = params.postProductionRates.find((r) => r.itemSlug === slug);
    if (!item) {
      customReasons.push(`Pricing for ${slug.replace(/_/g, " ")} isn't published yet — a Custom Proposal is required.`);
      continue;
    }
    const amount = roundMoney(quantity * item.priceUsd);
    postProductionSubtotalUsd = roundMoney(postProductionSubtotalUsd + amount);
    lineItems.push({ label: `${slug.replace(/_/g, " ")}${item.isFromPrice ? " (from)" : ""} × ${quantity}`, amountUsd: amount });
    if (item.isFromPrice) customReasons.push(`${slug.replace(/_/g, " ")} is quoted from an indicative minimum — final complexity may require a Custom Proposal.`);
  }
  if (params.advancedVfxRequested) {
    customReasons.push("Advanced Motion Graphics / VFX always requires a Custom Proposal.");
  }

  // ---- Priority — applies ONLY to the eligible post-production subtotal ----
  const priorityRequested = params.priorityRequested ?? false;
  let priorityAmountUsd = 0;
  if (priorityRequested) {
    if (params.priorityPercentage == null) {
      customReasons.push("Commercial Priority Post-Production pricing isn't published yet.");
    } else {
      priorityAmountUsd = roundMoney(postProductionSubtotalUsd * (params.priorityPercentage / 100));
      if (priorityAmountUsd > 0) lineItems.push({ label: `Priority Post-Production (+${params.priorityPercentage}%)`, amountUsd: priorityAmountUsd });
    }
  }

  // ---- Licensing ----
  let usageLicenceUsd: number | null = null;
  if (params.copyrightAssignmentRequested) {
    customReasons.push("Copyright assignment / outright ownership always requires a Custom Proposal.");
  } else if (params.durationSlug === "perpetual") {
    customReasons.push("Perpetual usage rights always require a Custom Proposal.");
  } else if (creativeFeeUsd !== null && params.usageSlug && params.durationSlug && params.territorySlug && params.exclusivitySlug) {
    const usageFactor = params.licensingFactors.usage[params.usageSlug];
    const durationFactor = params.licensingFactors.duration[params.durationSlug];
    const territoryFactor = params.licensingFactors.territory[params.territorySlug];
    const exclusivityFactor = params.licensingFactors.exclusivity[params.exclusivitySlug];
    if (usageFactor != null && durationFactor != null && territoryFactor != null && exclusivityFactor != null) {
      const rawUsageLicence = creativeFeeUsd * usageFactor * durationFactor * territoryFactor * exclusivityFactor;
      const floorPercentage = params.licensingFloorPercentage ?? 15;
      const licensingFloor = creativeFeeUsd * (floorPercentage / 100);
      usageLicenceUsd = roundMoney(Math.max(rawUsageLicence, licensingFloor));
      lineItems.push({ label: "Ordift Usage Licence", amountUsd: usageLicenceUsd });

      if (
        params.exclusivitySlug === "full_exclusive" &&
        (BROAD_TERRITORY_SLUGS.includes(params.territorySlug) || BROAD_USAGE_SLUGS.includes(params.usageSlug) || BROAD_DURATION_SLUGS.includes(params.durationSlug))
      ) {
        customReasons.push("Full exclusivity combined with a broad territory, usage, or duration requires Custom Proposal safeguard review.");
      }
    }
  }

  if (params.requiresBespokeAssessment) {
    customReasons.push("Flagged as requiring bespoke Commercial Production assessment.");
  }

  const estimatedTotalUsd = roundMoney(
    (creativeFeeUsd ?? 0) + productionSubtotalUsd + talentFeeUsd + talentUsageFeeUsd + postProductionSubtotalUsd + (usageLicenceUsd ?? 0) + priorityAmountUsd
  );

  const customProposalRequired = customReasons.length > 0;
  let reviewState: CommercialReviewState = "normal";
  if (customProposalRequired) {
    reviewState = "custom_proposal_required";
  } else if (params.reviewThreshold) {
    if (estimatedTotalUsd >= params.reviewThreshold.mandatoryUsd) {
      reviewState = "custom_proposal_required";
      customReasons.push("This indicative estimate meets or exceeds the market's Mandatory Proposal threshold.");
    } else if (estimatedTotalUsd >= params.reviewThreshold.reviewUsd) {
      reviewState = "commercial_review";
    }
  }

  return {
    creativeFeeUsd,
    catalogueFeeUsd: null,
    productionSubtotalUsd,
    talentFeeUsd,
    talentUsageFeeUsd,
    postProductionSubtotalUsd,
    usageLicenceUsd,
    priorityAmountUsd,
    estimatedTotalUsd,
    reviewState,
    customProposalRequired: reviewState === "custom_proposal_required" || customProposalRequired,
    customReasons,
    lineItems,
  };
}

// ============================================================
// PRODUCT / E-COMMERCE CATALOGUE ENGINE — its own self-contained
// per-image volume formula, deliberately NOT the day-rate/licensing
// calculator above. Styled/Creative Product is not a valid catalogue
// complexity at all — callers must route that case to
// calculateCommercialProductionEstimate() instead of calling this.
// ============================================================
export function calculateCatalogueEstimate(params: {
  quantity: number;
  complexity: CatalogueComplexity;
  baseRateUsd: number | null;
  minimumBookingUsd: number | null;
  volumeFactors: CommercialCatalogueVolumeFactor[];
  complexityFactors: CommercialCatalogueComplexityFactor[];
  reviewThreshold?: CommercialReviewThreshold | null;
}): CommercialEstimateResult {
  const customReasons: string[] = [];
  const lineItems: CommercialLineItem[] = [];

  if (params.quantity < 1) {
    customReasons.push("Enter at least 1 image.");
  }
  if (params.quantity >= 101) {
    customReasons.push("101+ images requires a Custom Volume Proposal — pricing isn't automatic at this scale.");
  }

  const volumeTier = params.volumeFactors.find((t) => params.quantity >= t.minQuantity && params.quantity <= t.maxQuantity);
  const complexityFactor = params.complexityFactors.find((c) => c.complexity === params.complexity);

  let catalogueFeeUsd: number | null = null;
  if (params.quantity >= 1 && params.quantity < 101) {
    if (params.baseRateUsd == null || params.minimumBookingUsd == null || !volumeTier || !complexityFactor) {
      customReasons.push("Catalogue pricing isn't fully published for this market/complexity yet.");
    } else {
      const subtotal = roundMoney(params.quantity * params.baseRateUsd * complexityFactor.factor * volumeTier.factor);
      catalogueFeeUsd = roundMoney(Math.max(subtotal, params.minimumBookingUsd));
      lineItems.push({ label: `Catalogue production × ${params.quantity} image${params.quantity === 1 ? "" : "s"}`, amountUsd: catalogueFeeUsd });
    }
  }

  const estimatedTotalUsd = catalogueFeeUsd ?? 0;
  const customProposalRequired = customReasons.length > 0;
  let reviewState: CommercialReviewState = "normal";
  if (customProposalRequired) {
    reviewState = "custom_proposal_required";
  } else if (params.reviewThreshold) {
    if (estimatedTotalUsd >= params.reviewThreshold.mandatoryUsd) {
      reviewState = "custom_proposal_required";
    } else if (estimatedTotalUsd >= params.reviewThreshold.reviewUsd) {
      reviewState = "commercial_review";
    }
  }

  return {
    creativeFeeUsd: null,
    catalogueFeeUsd,
    productionSubtotalUsd: 0,
    talentFeeUsd: 0,
    talentUsageFeeUsd: 0,
    postProductionSubtotalUsd: 0,
    usageLicenceUsd: null,
    priorityAmountUsd: 0,
    estimatedTotalUsd,
    reviewState,
    customProposalRequired: reviewState === "custom_proposal_required" || customProposalRequired,
    customReasons,
    lineItems,
  };
}
