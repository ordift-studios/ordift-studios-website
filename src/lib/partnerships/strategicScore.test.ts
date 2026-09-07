import { describe, expect, it } from "vitest";
import { computeStrategicScore } from "./strategicScore";

describe("computeStrategicScore", () => {
  it("sums factors up to the 100-point base maximum", () => {
    const r = computeStrategicScore(
      { targetClientAlignment: 20, brandReputationAlignment: 15, portfolioCreativeValue: 15, measurableDistribution: 15, revenueLeadPotential: 15, marketEntryRelationshipValue: 10, longTermStrategicValue: 10 },
      {}
    );
    expect(r.baseScore).toBe(100);
    expect(r.riskDeductionTotal).toBe(0);
    expect(r.finalScore).toBe(100);
    expect(r.interpretation).toBe("strong_strategic_case");
  });

  it("clamps each factor to its own maximum even if an over-large value is passed", () => {
    const r = computeStrategicScore({ targetClientAlignment: 999 }, {});
    expect(r.factors.targetClientAlignment).toBe(20);
  });

  it("clamps each risk deduction to its own maximum", () => {
    const r = computeStrategicScore({}, { reputationBrandRisk: 999 });
    expect(r.riskDeductions.reputationBrandRisk).toBe(25);
  });

  it("never produces a negative final score", () => {
    const r = computeStrategicScore({ targetClientAlignment: 20 }, { reputationBrandRisk: 25, unclearUsageIp: 20, broadExclusivity: 20, highUnreimbursedDirectCost: 20, unrealisticDeliverablesTimeline: 15, poorCounterpartyHistory: 20 });
    expect(r.finalScore).toBe(0);
    expect(r.interpretation).toBe("normally_decline");
  });

  it("interpretation bands: 75+/60-74/45-59/<45", () => {
    expect(computeStrategicScore({ targetClientAlignment: 20, brandReputationAlignment: 15, portfolioCreativeValue: 15, measurableDistribution: 15, revenueLeadPotential: 10 }, {}).interpretation).toBe("strong_strategic_case"); // 75
    expect(computeStrategicScore({ targetClientAlignment: 20, brandReputationAlignment: 15, portfolioCreativeValue: 15, measurableDistribution: 10 }, {}).interpretation).toBe("reasonable_case_review_economics"); // 60
    expect(computeStrategicScore({ targetClientAlignment: 20, brandReputationAlignment: 15, portfolioCreativeValue: 10 }, {}).interpretation).toBe("weak_convert_toward_paid"); // 45
    expect(computeStrategicScore({ targetClientAlignment: 20, brandReputationAlignment: 10 }, {}).interpretation).toBe("normally_decline"); // 30
  });

  it("AT.7 — a perfect score carries no approval field of any kind; nothing here can auto-approve a collaboration", () => {
    const r = computeStrategicScore(
      { targetClientAlignment: 20, brandReputationAlignment: 15, portfolioCreativeValue: 15, measurableDistribution: 15, revenueLeadPotential: 15, marketEntryRelationshipValue: 10, longTermStrategicValue: 10 },
      {}
    );
    expect(r.finalScore).toBe(100);
    expect(r).not.toHaveProperty("approved");
    expect(r).not.toHaveProperty("authorized");
    expect(r).not.toHaveProperty("autoApprove");
  });
});
