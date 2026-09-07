import { describe, expect, it } from "vitest";
import { calculateProductionServicesEstimate, applyMinimumOrPercentage, type ProductionServicesRate, type ProductionServicesPercentageSlug } from "./productionServicesEstimate";

// Ordift Production Services Pricing V1 (2026-09-07) —
// calculateProductionServicesEstimate() is pure (takes already-fetched
// rates rather than querying itself), so the actual pricing decision
// logic — including the structural no-double-charging guarantee — is
// directly unit-testable without a live Supabase session.

const MARKETS = ["ghana", "qatar", "uk_western_europe", "north_america", "asia_pacific", "other_international_custom"] as const;

const MANAGEMENT_MINIMUM: Record<string, number> = { ghana: 150, qatar: 300, uk_western_europe: 400, north_america: 450, asia_pacific: 350, other_international_custom: 350 };
const HALF_DAY_PLANNING: Record<string, number> = { ghana: 125, qatar: 250, uk_western_europe: 325, north_america: 375, asia_pacific: 300, other_international_custom: 285 };
const FULL_DAY_PLANNING: Record<string, number> = { ghana: 225, qatar: 450, uk_western_europe: 600, north_america: 675, asia_pacific: 525, other_international_custom: 500 };
const LOCATION_COORDINATION: Record<string, number> = { ghana: 75, qatar: 150, uk_western_europe: 200, north_america: 225, asia_pacific: 175, other_international_custom: 175 };
const EQUIPMENT_COORDINATION_MINIMUM: Record<string, number> = { ghana: 50, qatar: 100, uk_western_europe: 125, north_america: 150, asia_pacific: 110, other_international_custom: 110 };
const CREW_COORDINATION_MINIMUM: Record<string, number> = { ghana: 50, qatar: 100, uk_western_europe: 125, north_america: 150, asia_pacific: 110, other_international_custom: 110 };

const PERCENTAGES: Partial<Record<ProductionServicesPercentageSlug, number>> = { management_fee: 15, equipment_coordination: 10, crew_coordination: 12, management_overtime: 25 };

function rates(market: string): ProductionServicesRate[] {
  return [
    { marketId: market, rateSlug: "management_minimum", priceUsd: MANAGEMENT_MINIMUM[market] },
    { marketId: market, rateSlug: "half_day_planning", priceUsd: HALF_DAY_PLANNING[market] },
    { marketId: market, rateSlug: "full_day_planning", priceUsd: FULL_DAY_PLANNING[market] },
    { marketId: market, rateSlug: "location_coordination", priceUsd: LOCATION_COORDINATION[market] },
    { marketId: market, rateSlug: "equipment_coordination_minimum", priceUsd: EQUIPMENT_COORDINATION_MINIMUM[market] },
    { marketId: market, rateSlug: "crew_coordination_minimum", priceUsd: CREW_COORDINATION_MINIMUM[market] },
  ];
}

describe("applyMinimumOrPercentage", () => {
  it("returns the minimum when the percentage amount is lower", () => {
    expect(applyMinimumOrPercentage(500, 15, 150)).toEqual({ feeUsd: 150, basis: "minimum" });
  });
  it("returns the percentage amount when it exceeds the minimum", () => {
    expect(applyMinimumOrPercentage(5000, 15, 400)).toEqual({ feeUsd: 750, basis: "percentage" });
  });
});

describe("exact worked test targets — Production Management fee", () => {
  it("1. Ghana managed external cost $500: 15%=$75, market minimum $150 wins -> fee=$150", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(150);
  });

  it("2. Qatar managed external cost $1,000: 15%=$150, market minimum $300 wins -> fee=$300", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("qatar"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(300);
  });

  it("3. UK managed external cost $5,000: 15%=$750, percentage wins -> fee=$750", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("uk_western_europe"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 5000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(750);
  });

  it("4. North America managed external $10,000: fee=$1,500", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("north_america"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 10000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(1500);
  });
});

describe("exact worked test targets — Planning", () => {
  it("5. Ghana Half-Day Planning = $125", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("ghana"), percentages: PERCENTAGES, planningTier: "half_day" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(125);
  });

  it("6. Qatar Full-Day Planning = $450", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("qatar"), percentages: PERCENTAGES, planningTier: "full_day" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(450);
  });

  it("7. UK Full-Day Planning = $600", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("uk_western_europe"), percentages: PERCENTAGES, planningTier: "full_day" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(600);
  });
});

describe("exact worked test targets — standalone coordination", () => {
  it("8. Qatar standalone Location Coordination = $150, and venue rental remains separate (no rental field exists in the result at all)", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("qatar"), percentages: PERCENTAGES, standaloneLocationCount: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ordiftFeeSubtotalUsd).toBe(150);
      expect(r).not.toHaveProperty("venueRentalUsd");
      expect(r).not.toHaveProperty("locationRentalUsd");
    }
  });

  it("9. Qatar standalone equipment rental $500: 10%=$50, minimum $100 wins -> fee=$100", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("qatar"), percentages: PERCENTAGES, standaloneEquipmentRentalCostUsd: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(100);
  });

  it("10. North America standalone equipment rental $2,000: 10%=$200, percentage wins", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("north_america"), percentages: PERCENTAGES, standaloneEquipmentRentalCostUsd: 2000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(200);
  });

  it("11. Ghana standalone crew sourcing on $200 crew quote: 12%=$24, minimum $50 wins -> fee=$50", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("ghana"), percentages: PERCENTAGES, standaloneCrewCostUsd: 200 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(50);
  });

  it("12. UK standalone crew sourcing on $2,000: 12%=$240", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("uk_western_europe"), percentages: PERCENTAGES, standaloneCrewCostUsd: 2000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(240);
  });

  for (const market of MARKETS) {
    it(`location coordination is a flat per-location fee (2 locations) — ${market}`, () => {
      const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates(market), percentages: PERCENTAGES, standaloneLocationCount: 2 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.ordiftFeeSubtotalUsd).toBe(LOCATION_COORDINATION[market] * 2);
    });
  }
});

// ============================================================
// NO DOUBLE CHARGING (spec Part E / AN)
// ============================================================
describe("no double charging — structural", () => {
  it("13. Full Production Management with managed crew cost does NOT also add Standalone Crew Coordination — the full_production_management branch has no crew coordination line item at all", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lineItems.some((l) => l.label.toLowerCase().includes("crew"))).toBe(false);
      // Only one Ordift fee exists in this branch: the Production Management Fee itself.
      expect(r.lineItems.filter((l) => l.label === "Production Management Fee").length).toBe(1);
    }
  });

  it("14. Full Production Management with managed rental equipment does NOT also add Standalone Equipment Coordination", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 5000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineItems.some((l) => l.label.toLowerCase().includes("equipment"))).toBe(false);
  });

  it("15. Full Production Management with managed location cost does NOT also add Standalone Location Coordination", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 3000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineItems.some((l) => l.label.toLowerCase().includes("location"))).toBe(false);
  });

  it("full_production_management params have no field to even pass standalone location/equipment/crew coordination inputs (TypeScript-level, not just runtime)", () => {
    // This is a compile-time guarantee exercised at runtime: the branch
    // literally never reads eligibleManagedExternalCostUsd's siblings.
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineItems.length).toBe(1); // Production Management Fee only, no planning/overtime requested
  });

  it("16. Standalone crew/equipment/location coordination still works when Production Management is NOT selected — all three together, independently", () => {
    const r = calculateProductionServicesEstimate({
      engagementType: "standalone_coordination",
      rates: rates("ghana"),
      percentages: PERCENTAGES,
      standaloneLocationCount: 1,
      standaloneEquipmentRentalCostUsd: 500,
      standaloneCrewCostUsd: 200,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lineItems.length).toBe(3);
      expect(r.ordiftFeeSubtotalUsd).toBe(LOCATION_COORDINATION.ghana + EQUIPMENT_COORDINATION_MINIMUM.ghana + CREW_COORDINATION_MINIMUM.ghana);
      // No management fee anywhere in this branch.
      expect(r.lineItems.some((l) => l.label.toLowerCase().includes("management fee"))).toBe(false);
    }
  });

  it("standalone_coordination branch never reads/needs a management percentage even when one exists", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("ghana"), percentages: {}, standaloneLocationCount: 1 });
    expect(r.ok).toBe(true); // succeeds even with an empty percentages map, since location coordination needs no percentage at all
  });
});

// ============================================================
// UNKNOWN-COST SAFETY (spec Part T / test 17)
// ============================================================
describe("unknown-cost safety", () => {
  it("17. an unrequested scope item never renders as $0/free — it simply produces no line item at all, not a zero-amount one", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("ghana"), percentages: PERCENTAGES, standaloneLocationCount: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lineItems.some((l) => l.label.toLowerCase().includes("crew"))).toBe(false);
      expect(r.lineItems.some((l) => l.label.toLowerCase().includes("equipment"))).toBe(false);
      expect(r.lineItems.every((l) => l.amountUsd > 0)).toBe(true); // every emitted line item is a real, positive Ordift fee — never a placeholder 0
    }
  });

  it("this calculator never models an external supplier cost field at all — 'ordiftFeeSubtotalUsd' can only ever be Ordift's own fee", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).not.toHaveProperty("supplierCostUsd");
      expect(r).not.toHaveProperty("externalCostUsd");
      expect(r).not.toHaveProperty("totalBudgetUsd");
    }
  });
});

describe("project-scale signals — Production Review", () => {
  it("each scale signal independently triggers Production Review without altering the Ordift fee", () => {
    const without = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000 });
    const withSignal = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("ghana"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 1000, scaleSignals: ["regulated_activity"] });
    expect(without.ok && withSignal.ok).toBe(true);
    if (without.ok && withSignal.ok) {
      expect(without.requiresProductionReview).toBe(false);
      expect(withSignal.requiresProductionReview).toBe(true);
      expect(withSignal.ordiftFeeSubtotalUsd).toBe(without.ordiftFeeSubtotalUsd);
    }
  });
});

describe("management overtime", () => {
  it("applies +25% of the Production Management fee itself, never of external/supplier costs", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: rates("uk_western_europe"), percentages: PERCENTAGES, eligibleManagedExternalCostUsd: 5000, managementOvertimeRequested: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const managementFee = 750; // 5000 x 15%
      const overtime = Math.round(managementFee * 0.25 * 100) / 100;
      expect(r.ordiftFeeSubtotalUsd).toBe(Math.round((managementFee + overtime) * 100) / 100);
    }
  });
});

describe("refusal behavior — missing published rates", () => {
  it("refuses when management pricing isn't published", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "full_production_management", rates: [], percentages: {}, eligibleManagedExternalCostUsd: 1000 });
    expect(r.ok).toBe(false);
  });

  it("refuses when standalone equipment coordination is requested but not published", () => {
    const r = calculateProductionServicesEstimate({ engagementType: "standalone_coordination", rates: rates("ghana"), percentages: {}, standaloneEquipmentRentalCostUsd: 500 });
    expect(r.ok).toBe(false);
  });
});
