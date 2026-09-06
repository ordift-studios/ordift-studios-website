// Ordift Corporate & Headshots Pricing V1 (2026-09-06) — pure
// calculation logic and shared types only. Deliberately has ZERO
// imports of any kind — safe to import from a Client Component without
// pulling server-only code into the browser bundle, same established
// pattern as personalSessionEstimate.ts. Market is determined ONLY by
// an explicit, user-selected "where will the shoot take place" choice
// — never by customer nationality, residence, IP address, or browser
// geolocation. This is its own pricing engine, deliberately NOT modeled
// on the Personal Portrait subject/group multiplier system.

export type CorporateProductSlug = "individual_headshot" | "executive_portrait" | "team_headshots";

export type CorporateHeadshotRate = {
  marketId: string;
  productSlug: "individual_headshot" | "executive_portrait";
  priceUsd: number;
  signatureRetouchedImages: number;
};

export type CorporateTeamTierRate = {
  marketId: string;
  tierSlug: string;
  minPeople: number;
  maxPeople: number;
  pricePerPersonUsd: number;
};

export type CorporateEstimateResult =
  | {
      ok: true;
      basePriceUsd: number;
      teamSubtotalUsd: number | null;
      minimumApplied: boolean;
      signatureRetouchedImages: number;
      additionalRetouchImages: number;
      additionalRetouchRatePerImage: number | null;
      additionalRetouchAmountUsd: number;
      priorityDeliveryRequested: boolean;
      priorityDeliveryPercentage: number | null;
      priorityDeliveryAmountUsd: number;
      totalPriceUsd: number;
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Corporate Priority Delivery correction (2026-09-06, approved) — the
// percentage now varies by product/team-tier instead of a single
// global figure. This resolver is the single place that maps a
// product (+ team tier, where applicable) to the scope key used to
// look up the correct percentage; both the server module and the
// public client component call it so the mapping can never drift
// between them. It does not change calculateCorporateEstimate()'s own
// signature or formula below — callers resolve the percentage to pass
// in via this helper first.
export type CorporatePriorityDeliveryScopeSlug = "individual_headshot" | "executive_portrait" | "team_2_5" | "team_6_10" | "team_11_25" | "team_26_50";

const TEAM_TIER_TO_SCOPE: Record<string, CorporatePriorityDeliveryScopeSlug> = {
  "2-5": "team_2_5",
  "6-10": "team_6_10",
  "11-25": "team_11_25",
  "26-50": "team_26_50",
};

export function resolveCorporatePriorityDeliveryScope(
  product: CorporateProductSlug,
  teamTierRates: CorporateTeamTierRate[],
  numberOfPeople?: number
): CorporatePriorityDeliveryScopeSlug | null {
  if (product === "individual_headshot") return "individual_headshot";
  if (product === "executive_portrait") return "executive_portrait";
  const people = numberOfPeople ?? 0;
  const tier = teamTierRates.find((t) => people >= t.minPeople && people <= t.maxPeople);
  return tier ? (TEAM_TIER_TO_SCOPE[tier.tierSlug] ?? null) : null;
}

// Never auto-prices 51+ employees, never reuses the Personal Portrait
// retouch rate, never silently applies Priority Delivery (it must be
// explicitly requested), and never invents a minimum-booking or
// per-tier value that hasn't been supplied.
export function calculateCorporateEstimate(params: {
  product: CorporateProductSlug;
  headshotRates: CorporateHeadshotRate[];
  teamTierRates: CorporateTeamTierRate[];
  minimumBookingUsd: number | null;
  numberOfPeople?: number;
  additionalRetouchImages?: number;
  additionalRetouchRatePerImage?: number | null;
  priorityDeliveryRequested?: boolean;
  priorityDeliveryPercentage?: number | null;
}): CorporateEstimateResult {
  const additionalRetouchImages = params.additionalRetouchImages ?? 0;
  const additionalRetouchRatePerImage = params.additionalRetouchRatePerImage ?? null;
  const priorityDeliveryRequested = params.priorityDeliveryRequested ?? false;
  const priorityDeliveryPercentage = params.priorityDeliveryPercentage ?? null;

  let basePriceUsd: number;
  let teamSubtotalUsd: number | null = null;
  let minimumApplied = false;
  let signatureRetouchedImages: number;

  if (params.product === "individual_headshot" || params.product === "executive_portrait") {
    const rate = params.headshotRates.find((r) => r.productSlug === params.product);
    if (!rate) {
      return { ok: false, requiresCustomQuote: true, reason: "Pricing for this product isn't published for the selected market yet." };
    }
    basePriceUsd = rate.priceUsd;
    signatureRetouchedImages = rate.signatureRetouchedImages;
  } else {
    const numberOfPeople = params.numberOfPeople ?? 0;
    if (numberOfPeople < 2) {
      return {
        ok: false,
        requiresCustomQuote: true,
        reason: "Team Headshots require at least 2 people — for one person, choose Professional Headshot or Executive Portrait instead.",
      };
    }
    if (numberOfPeople >= 51) {
      return { ok: false, requiresCustomQuote: true, reason: "51+ employees requires a Custom Corporate Proposal — pricing isn't automatic at this scale." };
    }
    const tier = params.teamTierRates.find((t) => numberOfPeople >= t.minPeople && numberOfPeople <= t.maxPeople);
    if (!tier || params.minimumBookingUsd === null) {
      return { ok: false, requiresCustomQuote: true, reason: "Team Headshots pricing isn't published for this market yet." };
    }
    teamSubtotalUsd = roundMoney(numberOfPeople * tier.pricePerPersonUsd);
    basePriceUsd = Math.max(teamSubtotalUsd, params.minimumBookingUsd);
    minimumApplied = teamSubtotalUsd < params.minimumBookingUsd;
    signatureRetouchedImages = numberOfPeople * 1;
  }

  if (additionalRetouchImages > 0 && additionalRetouchRatePerImage === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Additional Signature Retouch pricing isn't published for this market yet." };
  }
  const additionalRetouchAmountUsd = roundMoney(additionalRetouchImages * (additionalRetouchRatePerImage ?? 0));

  const eligibleSubtotalUsd = basePriceUsd + additionalRetouchAmountUsd;

  if (priorityDeliveryRequested && priorityDeliveryPercentage === null) {
    return { ok: false, requiresCustomQuote: true, reason: "Priority Delivery pricing isn't published yet." };
  }
  const priorityDeliveryAmountUsd = priorityDeliveryRequested ? roundMoney(eligibleSubtotalUsd * ((priorityDeliveryPercentage ?? 0) / 100)) : 0;

  return {
    ok: true,
    basePriceUsd,
    teamSubtotalUsd,
    minimumApplied,
    signatureRetouchedImages,
    additionalRetouchImages,
    additionalRetouchRatePerImage,
    additionalRetouchAmountUsd,
    priorityDeliveryRequested,
    priorityDeliveryPercentage,
    priorityDeliveryAmountUsd,
    totalPriceUsd: roundMoney(eligibleSubtotalUsd + priorityDeliveryAmountUsd),
  };
}
