// Ordift Pricing Engine V1 / V1.1 (2026-09-06) — pure calculation logic
// and shared types only. Deliberately has ZERO imports of any kind — no
// Supabase client, no server-only module — so this file is safe to
// import from a Client Component (PersonalSessionEstimator.tsx) without
// pulling server-only code (createAdminClient, next/headers, etc.) into
// the browser bundle. personalSessionPricing.ts (the DB-reading/writing
// server module) imports and re-exports from here rather than
// duplicating these types/this function.
//
// Market is determined ONLY by an explicit, user-selected "where will
// the shoot/production take place" choice — never by customer
// nationality, residence, IP address, or browser geolocation. This
// function has no such parameter to misuse; it only ever operates on
// the rates/subject-category/retouch-rate data explicitly handed to
// it. The same function works unchanged for any current or future
// market — nothing here is Ghana/Qatar-specific.

export type PricingMarket = { id: string; slug: string; name: string };

export type PersonalSessionRate = {
  marketId: string;
  durationHours: number;
  priceUsd: number;
  signatureRetouchedImages: number;
  professionallyEditedImages: number;
};

// V1.1 — priceMultiplier replaces V1's additive supplementUsd, per the
// approved business rule change (rate × multiplier, not rate + a fixed
// amount). null = no approved rate yet for this category (e.g. Large
// Group) — always routes to a custom quote, never an invented value.
export type SubjectCategory = {
  id: string;
  slug: string;
  name: string;
  minSubjects: number;
  maxSubjects: number | null;
  priceMultiplier: number | null;
  active: boolean;
  requiresCustomQuote: boolean;
};

export type SessionEstimateResult =
  | {
      ok: true;
      sessionPriceUsd: number;
      additionalRetouchImages: number;
      additionalRetouchRatePerImage: number | null;
      additionalRetouchAmountUsd: number;
      totalPriceUsd: number;
      signatureRetouchedImages: number;
      professionallyEditedImages: number;
      currencyCode: "USD";
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Never extrapolates beyond the 4 approved duration tiers, never
// invents a subject-category multiplier, never prices an additional
// Professionally Edited Image (not approved — only Signature Retouched
// Images have an additional-image rate), and never computes a price
// for a service category other than personal_portrait — corporate/
// wedding/commercial pricing must go through their own (currently
// unbuilt) engines, never this one.
export function calculatePersonalSessionEstimate(params: {
  rates: PersonalSessionRate[];
  durationHours: number;
  subjectCategory: SubjectCategory | null;
  additionalRetouchImages?: number;
  additionalRetouchRatePerImage?: number | null;
}): SessionEstimateResult {
  const additionalRetouchImages = params.additionalRetouchImages ?? 0;
  const additionalRetouchRatePerImage = params.additionalRetouchRatePerImage ?? null;

  if (!params.subjectCategory) {
    return { ok: false, requiresCustomQuote: true, reason: "Select a subject/group type." };
  }
  if (params.subjectCategory.requiresCustomQuote || params.subjectCategory.priceMultiplier === null) {
    return {
      ok: false,
      requiresCustomQuote: true,
      reason: `${params.subjectCategory.name} sessions are custom-quoted — pricing for this group size hasn't been published yet.`,
    };
  }

  const rate = params.rates.find((r) => r.durationHours === params.durationHours);
  if (!rate) {
    return {
      ok: false,
      requiresCustomQuote: true,
      reason:
        params.durationHours > 4
          ? "Sessions longer than 4 hours require a custom proposal rather than a multiplied hourly rate."
          : "This duration isn't available for the selected market yet.",
    };
  }

  if (additionalRetouchImages > 0 && additionalRetouchRatePerImage === null) {
    return {
      ok: false,
      requiresCustomQuote: true,
      reason: "Additional Signature Retouched Image pricing isn't published for this market yet.",
    };
  }

  const sessionPriceUsd = roundMoney(rate.priceUsd * params.subjectCategory.priceMultiplier);
  const additionalRetouchAmountUsd = roundMoney(additionalRetouchImages * (additionalRetouchRatePerImage ?? 0));

  return {
    ok: true,
    sessionPriceUsd,
    additionalRetouchImages,
    additionalRetouchRatePerImage,
    additionalRetouchAmountUsd,
    totalPriceUsd: roundMoney(sessionPriceUsd + additionalRetouchAmountUsd),
    signatureRetouchedImages: rate.signatureRetouchedImages,
    professionallyEditedImages: rate.professionallyEditedImages,
    currencyCode: "USD",
  };
}
