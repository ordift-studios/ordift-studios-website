// Ordift Branding & Creative Strategy Pricing V1 (2026-09-07) — pure
// calculation logic and shared types only. Zero imports — safe to
// import from a Client Component, same established pattern as every
// other pricing family's *_estimate.ts. Production market drives base
// pricing; it is never inferred from nationality, residence, IP, or
// geolocation.
//
// ARCHITECTURE: Branding has no per-unit quantity scaling (no
// additional pages/slides/videos the way Graphic Design or Content
// Creation do) — each of the six priced tiers is a single flat market
// rate, and that rate IS the "applicable fee" additional revision and
// priority percentages are computed against, independently and summed
// rather than compounded, exactly mirroring the established pattern
// from graphicDesignEstimate.ts and contentCreationEstimate.ts.
// Strategy + Complete Identity is its OWN locked package rate — never
// Brand Foundations' rate plus Complete Identity's rate added together
// (this is enforced simply by never computing it any other way: it is
// looked up directly like every other tier).
//
// PROJECT SCALE / REVIEW SAFEGUARDS: even a tier with a locked base
// price can still materially exceed normal SME/project assumptions
// (many stakeholder groups, multiple business units, many markets, a
// regulated/high-risk industry, extensive research, numerous
// applications, complex brand architecture, or multilingual
// complexity). Any of those flags always adds a Creative Review reason
// ALONGSIDE still computing the indicative tier price — the same
// non-blocking pattern already accepted for Graphic Design's Bespoke
// complexity — so a client always sees an honest number, never a
// silent full-price commitment to what might really be an enterprise
// engagement.
//
// Custom / Enterprise Brand Programme has NO tier row in this type at
// all — it is never priced automatically, exactly like Graphic
// Design's Packaging/Custom categories.

export type BrandingTierSlug = "logo_development" | "brand_foundations" | "essential_identity" | "complete_identity" | "strategy_complete_identity" | "strategic_rebrand";

export type BrandingTurnaround = "standard" | "priority" | "custom_confirmation";
export type BrandingPercentageSlug = "priority" | "additional_revision";

export type BrandingTierRate = { marketId: string; tierSlug: BrandingTierSlug; priceUsd: number };

// Project-scale signals — never priced, never stored/versioned (no
// database row backs any of these): each is purely a Creative Review
// trigger, the same role radicalReConceptRequested plays for Graphic
// Design.
export type BrandingScaleSignal =
  | "many_stakeholder_groups"
  | "multiple_business_units"
  | "many_markets"
  | "regulated_high_risk_industry"
  | "extensive_research_required"
  | "numerous_applications_required"
  | "complex_brand_architecture"
  | "multilingual_complexity";

export const BRANDING_SCALE_SIGNAL_REASONS: Record<BrandingScaleSignal, string> = {
  many_stakeholder_groups: "Many stakeholder groups typically require deeper alignment work than a standard SME engagement.",
  multiple_business_units: "Multiple business units/subsidiaries typically require brand-architecture work beyond a single-entity package.",
  many_markets: "Operating across many markets/territories may require research and localisation beyond a standard SME engagement.",
  regulated_high_risk_industry: "Regulated or high-risk industries often carry compliance/legal considerations beyond a standard engagement.",
  extensive_research_required: "Extensive research beyond standard discovery typically requires its own scoped research phase.",
  numerous_applications_required: "A large number of brand applications beyond the standard package typically requires additional scoping.",
  complex_brand_architecture: "Complex brand architecture (house-of-brands, endorsed, or sub-brand systems) is an Enterprise/Custom concern.",
  multilingual_complexity: "Multilingual/bilingual identity development (for example Arabic/English) is not simple text translation and has no automatic multiplier in V1.",
};

export type BrandingLineItem = { label: string; amountUsd: number };

export type BrandingEstimateResult =
  | {
      ok: true;
      baseTierUsd: number;
      additionalRevisionUsd: number;
      priorityAmountUsd: number;
      estimatedTotalUsd: number;
      requiresCreativeReview: boolean;
      creativeReviewReasons: string[];
      lineItems: BrandingLineItem[];
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateBrandingEstimate(params: {
  tierSlug: BrandingTierSlug;
  tierRates: BrandingTierRate[];
  additionalRevisionRounds?: number;
  revisionMinimumUsd?: number;
  scaleSignals?: BrandingScaleSignal[];
  turnaround?: BrandingTurnaround;
  percentages: Partial<Record<BrandingPercentageSlug, number>>;
}): BrandingEstimateResult {
  const rate = params.tierRates.find((r) => r.tierSlug === params.tierSlug);
  if (!rate) {
    return { ok: false, requiresCustomQuote: true, reason: "Pricing for this service level isn't published for the selected market yet." };
  }

  const baseTierUsd = rate.priceUsd;
  const lineItems: BrandingLineItem[] = [];

  const creativeReviewReasons = (params.scaleSignals ?? []).map((signal) => BRANDING_SCALE_SIGNAL_REASONS[signal]);

  // Additional revision rounds (beyond the 2 included) — each round is
  // independently +15% of the base tier fee, subject to the market
  // minimum. Never applied to third-party/legal/supplier costs, which
  // this calculator never models in the first place.
  const additionalRevisionRounds = params.additionalRevisionRounds ?? 0;
  let additionalRevisionUsd = 0;
  if (additionalRevisionRounds > 0) {
    const pct = params.percentages.additional_revision;
    if (pct === undefined || params.revisionMinimumUsd === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Additional revision pricing isn't published for this market yet." };
    }
    const perRound = Math.max(roundMoney(baseTierUsd * (pct / 100)), params.revisionMinimumUsd);
    additionalRevisionUsd = roundMoney(additionalRevisionRounds * perRound);
    lineItems.push({ label: `Additional revision round × ${additionalRevisionRounds}`, amountUsd: additionalRevisionUsd });
  }

  const turnaround = params.turnaround ?? "standard";
  if (turnaround === "custom_confirmation") {
    return { ok: false, requiresCustomQuote: true, reason: "An extremely compressed/unsafe timeline always requires Custom Confirmation — Ordift does not market Branding as an emergency commodity." };
  }
  let priorityAmountUsd = 0;
  if (turnaround === "priority") {
    const pct = params.percentages.priority;
    if (pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Priority scheduling pricing isn't published yet." };
    priorityAmountUsd = roundMoney(baseTierUsd * (pct / 100));
    lineItems.push({ label: `Priority Scheduling (+${pct}%, subject to availability)`, amountUsd: priorityAmountUsd });
  }

  const estimatedTotalUsd = roundMoney(baseTierUsd + additionalRevisionUsd + priorityAmountUsd);

  return {
    ok: true,
    baseTierUsd,
    additionalRevisionUsd,
    priorityAmountUsd,
    estimatedTotalUsd,
    requiresCreativeReview: creativeReviewReasons.length > 0,
    creativeReviewReasons,
    lineItems,
  };
}
