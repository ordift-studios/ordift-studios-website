// Ordift Content Creation Pricing V1 (2026-09-07) — pure calculation
// logic and shared types only. Zero imports — safe to import from a
// Client Component, same established pattern as every other pricing
// family's *_estimate.ts. Production market drives base pricing; it is
// never inferred from nationality, residence, IP, or geolocation.
//
// ARCHITECTURE (documented interpretation of the approved spec, same
// non-compounding philosophy already accepted for Graphic Design V1):
//   - Every package (single/3-pack/5-pack short-form video, Half/Full
//     Content Day, Event Content 4h, Personal Brand 2h) is a flat,
//     deliberately-non-multiplicative market rate looked up directly —
//     never derived by multiplying a smaller unit's rate by quantity.
//   - "Applicable production fee" = the package rate PLUS any quantity-
//     scaled additions that are more of the same deliverable
//     (additional video/photos/hour/aspect-ratio/captioned master).
//     This combined base is the single shared basis for Additional
//     Revision (+15%, floored at the market minimum) and Priority
//     (+30%) — each computed independently off it and summed, not
//     compounded on each other, exactly mirroring graphicDesignEstimate.ts.
//   - Same/Next-Day Social Edit is its own flat per-video add-on and is
//     deliberately added AFTER (not inside) the applicable-fee base —
//     it is already itself a rush-turnaround charge, so folding it into
//     the base Priority/Revision percentages would double-surcharge
//     rush work, which the spec explicitly warns against ("Do not
//     automatically surcharge production, talent, travel or licensing
//     merely because post-production is expedited").
//   - Retainers are priced as a flat, already-discounted (90% of the
//     applicable Content Day rate) monthly lookup with NO add-ons,
//     revisions, or priority composed on top in this phase — the spec
//     explicitly forbids stacking another automatic bundle discount and
//     gives no approved overage-pricing formula, so retainer overage is
//     always a reassessment/Custom Quote conversation, never priced
//     automatically here.

export type ContentCreationPackageSlug =
  | "short_form_single"
  | "short_form_pack_3"
  | "short_form_pack_5"
  | "content_day_half"
  | "content_day_full"
  | "event_content_4h"
  | "personal_brand_2h";

export type ContentCreationRetainerSlug = "retainer_essential" | "retainer_growth" | "retainer_momentum";

export type ContentCreationAddonSlug =
  | "additional_short_form_video"
  | "additional_10_edited_photos"
  | "additional_content_capture_hour"
  | "same_next_day_edit_per_video"
  | "additional_aspect_ratio_adaptation"
  | "captioned_subtitled_master"
  | "additional_revision_minimum";

export type ContentCreationPercentageSlug = "priority" | "additional_revision";

export type ContentCreationTurnaround = "standard" | "priority" | "emergency_custom";

export type ContentCreationPackageRate = { marketId: string; packageSlug: ContentCreationPackageSlug; priceUsd: number };
export type ContentCreationRetainerRate = { marketId: string; retainerSlug: ContentCreationRetainerSlug; priceUsd: number };

export type ContentCreationLineItem = { label: string; amountUsd: number };

export type ContentCreationEstimateResult =
  | {
      ok: true;
      basePackageUsd: number;
      scalingAdditionsUsd: number; // additional videos/photos/hours/aspect-ratio/captioned-master
      applicableProductionFeeUsd: number; // basePackage + scalingAdditions — shared basis for revision % and priority %
      additionalRevisionUsd: number;
      priorityAmountUsd: number;
      sameNextDayEditUsd: number; // flat, added after the % basis — see module doc comment
      estimatedTotalUsd: number;
      lineItems: ContentCreationLineItem[];
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

export type ContentCreationRetainerEstimateResult = { ok: true; monthlyFeeUsd: number } | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateContentCreationEstimate(params: {
  packageSlug: ContentCreationPackageSlug;
  packageRates: ContentCreationPackageRate[];
  addonRates: Partial<Record<ContentCreationAddonSlug, number>>;
  additionalVideos?: number;
  additionalPhotoSets?: number; // units of 10 edited social photos
  additionalCaptureHours?: number;
  aspectRatioAdaptationCount?: number;
  captionedMasterCount?: number;
  sameNextDayEditVideoCount?: number;
  additionalRevisionRounds?: number; // beyond the 2 included per project
  turnaround?: ContentCreationTurnaround;
  percentages: Partial<Record<ContentCreationPercentageSlug, number>>;
}): ContentCreationEstimateResult {
  const rate = params.packageRates.find((r) => r.packageSlug === params.packageSlug);
  if (!rate) {
    return { ok: false, requiresCustomQuote: true, reason: "Pricing for this package isn't published for the selected market yet." };
  }

  const lineItems: ContentCreationLineItem[] = [];
  let scalingAdditionsUsd = 0;

  const addScaledAddon = (quantity: number | undefined, slug: ContentCreationAddonSlug, label: (qty: number) => string) => {
    const qty = quantity ?? 0;
    if (qty <= 0) return;
    const unitRate = params.addonRates[slug];
    if (unitRate === undefined) {
      return { error: `Pricing for "${label(qty)}" isn't published for this market yet.` };
    }
    const amount = roundMoney(qty * unitRate);
    scalingAdditionsUsd = roundMoney(scalingAdditionsUsd + amount);
    lineItems.push({ label: label(qty), amountUsd: amount });
    return undefined;
  };

  const scalingSteps: { quantity: number | undefined; slug: ContentCreationAddonSlug; label: (qty: number) => string }[] = [
    { quantity: params.additionalVideos, slug: "additional_short_form_video", label: (q) => `Additional short-form video × ${q}` },
    { quantity: params.additionalPhotoSets, slug: "additional_10_edited_photos", label: (q) => `Additional 10 edited social photos × ${q}` },
    { quantity: params.additionalCaptureHours, slug: "additional_content_capture_hour", label: (q) => `Additional content-capture hour × ${q}` },
    { quantity: params.aspectRatioAdaptationCount, slug: "additional_aspect_ratio_adaptation", label: (q) => `Additional aspect-ratio / platform adaptation × ${q}` },
    { quantity: params.captionedMasterCount, slug: "captioned_subtitled_master", label: (q) => `Captioned / subtitled master × ${q}` },
  ];
  for (const step of scalingSteps) {
    const result = addScaledAddon(step.quantity, step.slug, step.label);
    if (result?.error) return { ok: false, requiresCustomQuote: true, reason: result.error };
  }

  const applicableProductionFeeUsd = roundMoney(rate.priceUsd + scalingAdditionsUsd);

  // Additional revision rounds (beyond the 2 included) — each round is
  // independently +15% of the applicable production fee, subject to
  // the market minimum. Never applied to supplier/talent/travel costs,
  // which this calculator never models in the first place.
  const additionalRevisionRounds = params.additionalRevisionRounds ?? 0;
  let additionalRevisionUsd = 0;
  if (additionalRevisionRounds > 0) {
    const pct = params.percentages.additional_revision;
    const minimum = params.addonRates.additional_revision_minimum;
    if (pct === undefined || minimum === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Additional revision pricing isn't published for this market yet." };
    }
    const perRound = Math.max(roundMoney(applicableProductionFeeUsd * (pct / 100)), minimum);
    additionalRevisionUsd = roundMoney(additionalRevisionRounds * perRound);
    lineItems.push({ label: `Additional revision round × ${additionalRevisionRounds}`, amountUsd: additionalRevisionUsd });
  }

  const turnaround = params.turnaround ?? "standard";
  if (turnaround === "emergency_custom") {
    return { ok: false, requiresCustomQuote: true, reason: "Exceptional emergency turnaround always requires Custom Confirmation — subject to availability." };
  }
  let priorityAmountUsd = 0;
  if (turnaround === "priority") {
    const pct = params.percentages.priority;
    if (pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Priority turnaround pricing isn't published yet." };
    priorityAmountUsd = roundMoney(applicableProductionFeeUsd * (pct / 100));
    lineItems.push({ label: `Priority Post-Production (+${pct}%)`, amountUsd: priorityAmountUsd });
  }

  // Same/Next-Day Social Edit — flat per-video, added after the %
  // basis above (see module doc comment: it is already a rush charge).
  let sameNextDayEditUsd = 0;
  const sameNextDayCount = params.sameNextDayEditVideoCount ?? 0;
  if (sameNextDayCount > 0) {
    const unitRate = params.addonRates.same_next_day_edit_per_video;
    if (unitRate === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Same/Next-Day Social Edit pricing isn't published for this market yet." };
    }
    sameNextDayEditUsd = roundMoney(sameNextDayCount * unitRate);
    lineItems.push({ label: `Same/Next-Day Social Edit × ${sameNextDayCount}`, amountUsd: sameNextDayEditUsd });
  }

  const estimatedTotalUsd = roundMoney(applicableProductionFeeUsd + additionalRevisionUsd + priorityAmountUsd + sameNextDayEditUsd);

  return {
    ok: true,
    basePackageUsd: rate.priceUsd,
    scalingAdditionsUsd,
    applicableProductionFeeUsd,
    additionalRevisionUsd,
    priorityAmountUsd,
    sameNextDayEditUsd,
    estimatedTotalUsd,
    lineItems,
  };
}

export function calculateContentCreationRetainerEstimate(params: {
  retainerSlug: ContentCreationRetainerSlug;
  retainerRates: ContentCreationRetainerRate[];
}): ContentCreationRetainerEstimateResult {
  const rate = params.retainerRates.find((r) => r.retainerSlug === params.retainerSlug);
  if (!rate) {
    return { ok: false, requiresCustomQuote: true, reason: "Pricing for this retainer isn't published for the selected market yet." };
  }
  return { ok: true, monthlyFeeUsd: rate.priceUsd };
}
