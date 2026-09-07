// Ordift Graphic Design Pricing V1 (2026-09-07) — pure calculation
// logic and shared types only. Zero imports — safe to import from a
// Client Component, same established pattern as every other pricing
// family's *_estimate.ts. Production market drives base pricing; it is
// never inferred from nationality, residence, IP, or geolocation.
//
// BASE DELIVERABLE + SCOPE/QUANTITY + COMPLEXITY + ADDITIONS +
// PRIORITY/RUSH = ESTIMATED GRAPHIC DESIGN INVESTMENT. "Applicable
// design fee" (the base deliverable, scaled for extra pages/slides,
// with the complexity factor applied) is the single shared basis for
// every percentage-based addition below (additional revision, editable
// source file, priority/urgent) — they are independent additions on
// top of it, not compounded on each other.

export type GraphicDesignDeliverableSlug =
  | "flyer_poster"
  | "digital_ad"
  | "social_single"
  | "social_set_5"
  | "social_set_10"
  | "presentation"
  | "brochure";

export type GraphicDesignComplexity = "standard" | "enhanced" | "bespoke";
export type GraphicDesignTurnaround = "standard" | "priority" | "urgent" | "same_day";

export type GraphicDesignDeliverableRate = { marketId: string; deliverableSlug: GraphicDesignDeliverableSlug; priceUsd: number };
export type GraphicDesignComplexityFactor = { complexity: GraphicDesignComplexity; factor: number };

export type GraphicDesignAddonSlug =
  | "additional_brochure_page"
  | "additional_presentation_slide"
  | "additional_revision_minimum"
  | "editable_source_file_minimum";

export type GraphicDesignPercentageSlug = "priority" | "urgent" | "additional_revision" | "editable_source_file";

export type GraphicDesignLineItem = { label: string; amountUsd: number };

export type GraphicDesignEstimateResult =
  | {
      ok: true;
      baseDeliverableUsd: number;
      scaledSubtotalUsd: number; // base + additional pages/slides, before complexity
      applicableDesignFeeUsd: number; // scaledSubtotal x complexity factor — the shared basis below
      additionalRevisionUsd: number;
      editableSourceFileUsd: number;
      priorityAmountUsd: number;
      urgentAmountUsd: number;
      estimatedTotalUsd: number;
      requiresCreativeReview: boolean;
      creativeReviewReasons: string[];
      lineItems: GraphicDesignLineItem[];
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateGraphicDesignEstimate(params: {
  deliverableSlug: GraphicDesignDeliverableSlug;
  deliverableRates: GraphicDesignDeliverableRate[];
  complexity: GraphicDesignComplexity;
  complexityFactors: GraphicDesignComplexityFactor[];
  additionalPages?: number; // brochure only — quantity beyond the included 8
  additionalSlides?: number; // presentation only — quantity beyond the included 10
  addonRates: Partial<Record<GraphicDesignAddonSlug, number>>;
  additionalRevisionRounds?: number; // beyond the 2 included per project
  radicalReConceptRequested?: boolean;
  editableSourceFileRequested?: boolean;
  turnaround?: GraphicDesignTurnaround;
  percentages: Partial<Record<GraphicDesignPercentageSlug, number>>;
}): GraphicDesignEstimateResult {
  const rate = params.deliverableRates.find((r) => r.deliverableSlug === params.deliverableSlug);
  if (!rate) {
    return { ok: false, requiresCustomQuote: true, reason: "Pricing for this deliverable isn't published for the selected market yet." };
  }

  const lineItems: GraphicDesignLineItem[] = [];
  let scaledSubtotal = rate.priceUsd;

  if (params.deliverableSlug === "brochure" && (params.additionalPages ?? 0) > 0) {
    const additionalPageRate = params.addonRates.additional_brochure_page;
    if (additionalPageRate === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Additional brochure page pricing isn't published for this market yet." };
    }
    const amount = roundMoney((params.additionalPages ?? 0) * additionalPageRate);
    scaledSubtotal = roundMoney(scaledSubtotal + amount);
    lineItems.push({ label: `Additional pages × ${params.additionalPages}`, amountUsd: amount });
  }

  if (params.deliverableSlug === "presentation" && (params.additionalSlides ?? 0) > 0) {
    const additionalSlideRate = params.addonRates.additional_presentation_slide;
    if (additionalSlideRate === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Additional presentation slide pricing isn't published for this market yet." };
    }
    const amount = roundMoney((params.additionalSlides ?? 0) * additionalSlideRate);
    scaledSubtotal = roundMoney(scaledSubtotal + amount);
    lineItems.push({ label: `Additional slides × ${params.additionalSlides}`, amountUsd: amount });
  }

  const complexityFactor = params.complexityFactors.find((c) => c.complexity === params.complexity);
  if (!complexityFactor) {
    return { ok: false, requiresCustomQuote: true, reason: "Complexity pricing isn't published yet." };
  }
  const applicableDesignFeeUsd = roundMoney(scaledSubtotal * complexityFactor.factor);

  const creativeReviewReasons: string[] = [];
  if (params.complexity === "bespoke") {
    creativeReviewReasons.push("Bespoke / Art-Directed work may require Creative Review before a final price is confirmed.");
  }
  if (params.radicalReConceptRequested) {
    creativeReviewReasons.push("A completely new creative direction after approval is a re-scope, not a revision — this requires reassessment rather than automatic pricing.");
  }

  // Additional revision rounds (beyond the 2 included) — each round is
  // independently +15% of the applicable design fee, subject to the
  // market minimum.
  const additionalRevisionRounds = params.additionalRevisionRounds ?? 0;
  let additionalRevisionUsd = 0;
  if (additionalRevisionRounds > 0) {
    const pct = params.percentages.additional_revision;
    const minimum = params.addonRates.additional_revision_minimum;
    if (pct === undefined || minimum === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Additional revision pricing isn't published for this market yet." };
    }
    const perRound = Math.max(roundMoney(applicableDesignFeeUsd * (pct / 100)), minimum);
    additionalRevisionUsd = roundMoney(additionalRevisionRounds * perRound);
    lineItems.push({ label: `Additional revision round × ${additionalRevisionRounds}`, amountUsd: additionalRevisionUsd });
  }

  let editableSourceFileUsd = 0;
  if (params.editableSourceFileRequested) {
    const pct = params.percentages.editable_source_file;
    const minimum = params.addonRates.editable_source_file_minimum;
    if (pct === undefined || minimum === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Editable Source File pricing isn't published for this market yet." };
    }
    editableSourceFileUsd = Math.max(roundMoney(applicableDesignFeeUsd * (pct / 100)), minimum);
    lineItems.push({ label: "Editable Source File (available by request)", amountUsd: editableSourceFileUsd });
  }

  const turnaround = params.turnaround ?? "standard";
  if (turnaround === "same_day") {
    return { ok: false, requiresCustomQuote: true, reason: "Same-day / emergency turnaround always requires Custom Confirmation — subject to availability." };
  }
  let priorityAmountUsd = 0;
  let urgentAmountUsd = 0;
  if (turnaround === "priority") {
    const pct = params.percentages.priority;
    if (pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Priority turnaround pricing isn't published yet." };
    priorityAmountUsd = roundMoney(applicableDesignFeeUsd * (pct / 100));
    lineItems.push({ label: `Priority Turnaround (+${pct}%)`, amountUsd: priorityAmountUsd });
  } else if (turnaround === "urgent") {
    const pct = params.percentages.urgent;
    if (pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Urgent turnaround pricing isn't published yet." };
    urgentAmountUsd = roundMoney(applicableDesignFeeUsd * (pct / 100));
    lineItems.push({ label: `Urgent Turnaround — under 48h (+${pct}%, subject to availability)`, amountUsd: urgentAmountUsd });
  }

  const estimatedTotalUsd = roundMoney(applicableDesignFeeUsd + additionalRevisionUsd + editableSourceFileUsd + priorityAmountUsd + urgentAmountUsd);

  return {
    ok: true,
    baseDeliverableUsd: rate.priceUsd,
    scaledSubtotalUsd: scaledSubtotal,
    applicableDesignFeeUsd,
    additionalRevisionUsd,
    editableSourceFileUsd,
    priorityAmountUsd,
    urgentAmountUsd,
    estimatedTotalUsd,
    requiresCreativeReview: creativeReviewReasons.length > 0,
    creativeReviewReasons,
    lineItems,
  };
}
