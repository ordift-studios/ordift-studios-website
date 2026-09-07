// Ordift Production Services Pricing V1 (2026-09-07) — pure
// calculation logic and shared types only. Zero imports — safe to
// import from a Client Component, same established pattern as every
// other pricing family's *_estimate.ts. Production market drives base
// pricing; it is never inferred from nationality, residence, IP, or
// geolocation.
//
// CORE ARCHITECTURE — this calculator ONLY ever computes Ordift's own
// management/coordination fee. It never computes, estimates, or
// guesses an external supplier cost — those remain "To Be Quoted"
// until a real production_supplier_quotes row exists (see
// productionSupplierQuotes.ts), so there is no field here that could
// ever render an unknown cost as $0/free/included.
//
// NO DOUBLE CHARGING (structural, not just a documented rule): the
// single entry point, calculateProductionServicesEstimate(), takes an
// `engagementType` that is one of two MUTUALLY EXCLUSIVE branches:
//   - "full_production_management": computes the Production Management
//     fee (MAX(marketMinimum, eligibleManagedExternalCost x 15%)) plus
//     planning/overtime. It has NO code path that also adds standalone
//     location/equipment/crew coordination fees — those functions are
//     simply never called in this branch, because a project under full
//     Production Management already has crew/equipment/location
//     coordination folded into that one fee.
//   - "standalone_coordination": computes ONLY the specific standalone
//     coordination fees the client actually asked for (location,
//     equipment, crew — each independently optional) plus planning. It
//     has NO management fee at all.
// A caller cannot accidentally produce both a management fee AND a
// standalone coordination fee on the same estimate — the type system
// and the branching both make that combination unrepresentable, not
// merely discouraged.

export type ProductionServicesRateSlug = "management_minimum" | "half_day_planning" | "full_day_planning" | "location_coordination" | "equipment_coordination_minimum" | "crew_coordination_minimum";
export type ProductionServicesPercentageSlug = "management_fee" | "equipment_coordination" | "crew_coordination" | "management_overtime";

export type ProductionServicesRate = { marketId: string; rateSlug: ProductionServicesRateSlug; priceUsd: number };

export type ProductionPlanningTier = "none" | "half_day" | "full_day";

export type ProductionScaleSignal =
  | "regulated_activity" // drone, pyrotechnics, weapons/replica props, cranes, special rigs, underwater, animals, children, stunts, restricted locations, hazardous environments
  | "international_logistics" // cross-border travel/permits/customs
  | "many_locations_or_days"
  | "complex_crew_or_equipment_scope";

export const PRODUCTION_SCALE_SIGNAL_REASONS: Record<ProductionScaleSignal, string> = {
  regulated_activity: "High-risk or regulated production activity (drone, pyrotechnics, weapons/replica props, cranes, special rigs, underwater, animals, children, stunts, restricted locations, or hazardous environments) always requires Production Review and the necessary legal/safety/regulatory approvals — never auto-priced.",
  international_logistics: "International production logistics (cross-border travel, permits, customs) typically requires Production Review before a reliable budget can be prepared.",
  many_locations_or_days: "A large number of locations or production days typically requires Production Review to scope accurately.",
  complex_crew_or_equipment_scope: "A complex or highly specialised crew/equipment scope typically requires Production Review before a reliable budget can be prepared.",
};

export type ProductionServicesLineItem = { label: string; amountUsd: number };

export type ProductionServicesEstimateResult =
  | {
      ok: true;
      engagementType: "full_production_management" | "standalone_coordination";
      lineItems: ProductionServicesLineItem[];
      ordiftFeeSubtotalUsd: number; // Ordift's own fee only — never an external supplier cost
      requiresProductionReview: boolean;
      productionReviewReasons: string[];
    }
  | { ok: false; requiresCustomQuote: true; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function findRate(rates: ProductionServicesRate[], slug: ProductionServicesRateSlug): number | undefined {
  return rates.find((r) => r.rateSlug === slug)?.priceUsd;
}

// The one formula shared by Production Management and every standalone
// coordination fee: MAX(market minimum, cost x percentage). Exported on
// its own because it is independently testable and independently
// reused by four different call sites below.
export function applyMinimumOrPercentage(costUsd: number, percentage: number, marketMinimumUsd: number): { feeUsd: number; basis: "minimum" | "percentage" } {
  const percentageAmount = roundMoney(costUsd * (percentage / 100));
  return percentageAmount > marketMinimumUsd ? { feeUsd: percentageAmount, basis: "percentage" } : { feeUsd: marketMinimumUsd, basis: "minimum" };
}

function planningLineItem(tier: ProductionPlanningTier, rates: ProductionServicesRate[]): { lineItem: ProductionServicesLineItem | null; error: string | null } {
  if (tier === "none") return { lineItem: null, error: null };
  const slug: ProductionServicesRateSlug = tier === "half_day" ? "half_day_planning" : "full_day_planning";
  const price = findRate(rates, slug);
  if (price === undefined) return { lineItem: null, error: "Planning pricing isn't published for this market yet." };
  return { lineItem: { label: tier === "half_day" ? "Half-Day Planning" : "Full-Day Planning", amountUsd: price }, error: null };
}

export function calculateProductionServicesEstimate(
  params:
    | {
        engagementType: "full_production_management";
        rates: ProductionServicesRate[];
        percentages: Partial<Record<ProductionServicesPercentageSlug, number>>;
        eligibleManagedExternalCostUsd: number; // approved crew + equipment + studio/location + specialist supplier costs already under this management scope
        planningTier?: ProductionPlanningTier;
        managementOvertimeRequested?: boolean;
        scaleSignals?: ProductionScaleSignal[];
      }
    | {
        engagementType: "standalone_coordination";
        rates: ProductionServicesRate[];
        percentages: Partial<Record<ProductionServicesPercentageSlug, number>>;
        standaloneLocationCount?: number; // per confirmed externally sourced location/studio
        standaloneEquipmentRentalCostUsd?: number; // approved external equipment rental cost
        standaloneCrewCostUsd?: number; // approved crew cost
        planningTier?: ProductionPlanningTier;
        scaleSignals?: ProductionScaleSignal[];
      }
): ProductionServicesEstimateResult {
  const lineItems: ProductionServicesLineItem[] = [];
  const creativeReviewReasons = (params.scaleSignals ?? []).map((s) => PRODUCTION_SCALE_SIGNAL_REASONS[s]);

  const { lineItem: planningLine, error: planningError } = planningLineItem(params.planningTier ?? "none", params.rates);
  if (planningError) return { ok: false, requiresCustomQuote: true, reason: planningError };
  if (planningLine) lineItems.push(planningLine);

  if (params.engagementType === "full_production_management") {
    const marketMinimum = findRate(params.rates, "management_minimum");
    const pct = params.percentages.management_fee;
    if (marketMinimum === undefined || pct === undefined) {
      return { ok: false, requiresCustomQuote: true, reason: "Production Management pricing isn't published for this market yet." };
    }
    const { feeUsd } = applyMinimumOrPercentage(params.eligibleManagedExternalCostUsd, pct, marketMinimum);
    lineItems.push({ label: "Production Management Fee", amountUsd: feeUsd });

    if (params.managementOvertimeRequested) {
      const overtimePct = params.percentages.management_overtime;
      if (overtimePct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Production Management overtime pricing isn't published yet." };
      const overtimeUsd = roundMoney(feeUsd * (overtimePct / 100));
      lineItems.push({ label: `Ordift Management Overtime (+${overtimePct}%)`, amountUsd: overtimeUsd });
    }

    const ordiftFeeSubtotalUsd = roundMoney(lineItems.reduce((sum, item) => sum + item.amountUsd, 0));
    return { ok: true, engagementType: "full_production_management", lineItems, ordiftFeeSubtotalUsd, requiresProductionReview: creativeReviewReasons.length > 0, productionReviewReasons: creativeReviewReasons };
  }

  // standalone_coordination — location, equipment, and crew coordination
  // are each independently optional, and NONE of them is a Production
  // Management fee. This branch never reads eligibleManagedExternalCostUsd
  // or the management_fee/management_overtime percentages at all.
  const locationCount = params.standaloneLocationCount ?? 0;
  if (locationCount > 0) {
    const rate = findRate(params.rates, "location_coordination");
    if (rate === undefined) return { ok: false, requiresCustomQuote: true, reason: "Location Coordination pricing isn't published for this market yet." };
    lineItems.push({ label: `Location/Studio Coordination × ${locationCount}`, amountUsd: roundMoney(rate * locationCount) });
  }

  if (params.standaloneEquipmentRentalCostUsd !== undefined && params.standaloneEquipmentRentalCostUsd > 0) {
    const marketMinimum = findRate(params.rates, "equipment_coordination_minimum");
    const pct = params.percentages.equipment_coordination;
    if (marketMinimum === undefined || pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Equipment Coordination pricing isn't published for this market yet." };
    const { feeUsd } = applyMinimumOrPercentage(params.standaloneEquipmentRentalCostUsd, pct, marketMinimum);
    lineItems.push({ label: "Equipment Coordination", amountUsd: feeUsd });
  }

  if (params.standaloneCrewCostUsd !== undefined && params.standaloneCrewCostUsd > 0) {
    const marketMinimum = findRate(params.rates, "crew_coordination_minimum");
    const pct = params.percentages.crew_coordination;
    if (marketMinimum === undefined || pct === undefined) return { ok: false, requiresCustomQuote: true, reason: "Crew Coordination pricing isn't published for this market yet." };
    const { feeUsd } = applyMinimumOrPercentage(params.standaloneCrewCostUsd, pct, marketMinimum);
    lineItems.push({ label: "Crew Coordination", amountUsd: feeUsd });
  }

  const ordiftFeeSubtotalUsd = roundMoney(lineItems.reduce((sum, item) => sum + item.amountUsd, 0));
  return { ok: true, engagementType: "standalone_coordination", lineItems, ordiftFeeSubtotalUsd, requiresProductionReview: creativeReviewReasons.length > 0, productionReviewReasons: creativeReviewReasons };
}
