// Ordift Pricing Engine V1 (2026-09-06) — pure calculation logic and
// shared types only. Deliberately has ZERO imports of any kind — no
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
// the rates/subject-category data explicitly handed to it.

export type PricingMarket = { id: string; slug: string; name: string };

export type PersonalSessionRate = {
  marketId: string;
  durationHours: number;
  priceUsd: number;
  signatureRetouchedImages: number;
  professionallyEditedImages: number;
};

export type SubjectCategory = {
  id: string;
  slug: string;
  name: string;
  minSubjects: number;
  maxSubjects: number | null;
  supplementUsd: number | null;
  active: boolean;
  requiresCustomQuote: boolean;
};

export type SessionEstimateResult =
  | {
      ok: true;
      priceUsd: number;
      signatureRetouchedImages: number;
      professionallyEditedImages: number;
      currencyCode: "USD";
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

// Never extrapolates beyond the 4 approved duration tiers, never
// invents a subject-category supplement, and never computes a price
// for a service category other than personal_portrait — corporate/
// wedding/commercial pricing must go through their own (currently
// unbuilt) engines, never this one.
export function calculatePersonalSessionEstimate(params: {
  rates: PersonalSessionRate[];
  durationHours: number;
  subjectCategory: SubjectCategory | null;
}): SessionEstimateResult {
  if (!params.subjectCategory) {
    return { ok: false, requiresCustomQuote: true, reason: "Select a subject/group type." };
  }
  if (params.subjectCategory.requiresCustomQuote || params.subjectCategory.supplementUsd === null) {
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

  return {
    ok: true,
    priceUsd: rate.priceUsd + params.subjectCategory.supplementUsd,
    signatureRetouchedImages: rate.signatureRetouchedImages,
    professionallyEditedImages: rate.professionallyEditedImages,
    currencyCode: "USD",
  };
}
