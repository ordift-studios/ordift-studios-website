// Ordift Partnerships & Collaborations V1 (2026-09-07) — the
// transparent 100-point strategic assessment. Pure, zero-import.
//
// CRITICAL: this score is informational only. Its return type has no
// "approved" field, and nothing in this codebase's authorization path
// (see valueEconomics.ts's resolveConcessionApprovalRequirement, which
// depends only on the concession band, never on this score) reads a
// strategic score to grant approval. A 100 does not authorize free
// work — human authorization through the real approval-band capability
// check remains mandatory regardless of this number.

export type StrategicScoreFactors = {
  targetClientAlignment: number; // 0-20
  brandReputationAlignment: number; // 0-15
  portfolioCreativeValue: number; // 0-15
  measurableDistribution: number; // 0-15
  revenueLeadPotential: number; // 0-15
  marketEntryRelationshipValue: number; // 0-10
  longTermStrategicValue: number; // 0-10
};

export type StrategicRiskDeductions = {
  broadExclusivity: number; // 0-20
  unclearUsageIp: number; // 0-20
  highUnreimbursedDirectCost: number; // 0-20
  reputationBrandRisk: number; // 0-25
  unrealisticDeliverablesTimeline: number; // 0-15
  poorCounterpartyHistory: number; // 0-20
};

const FACTOR_MAX: Record<keyof StrategicScoreFactors, number> = {
  targetClientAlignment: 20,
  brandReputationAlignment: 15,
  portfolioCreativeValue: 15,
  measurableDistribution: 15,
  revenueLeadPotential: 15,
  marketEntryRelationshipValue: 10,
  longTermStrategicValue: 10,
};

const RISK_MAX: Record<keyof StrategicRiskDeductions, number> = {
  broadExclusivity: 20,
  unclearUsageIp: 20,
  highUnreimbursedDirectCost: 20,
  reputationBrandRisk: 25,
  unrealisticDeliverablesTimeline: 15,
  poorCounterpartyHistory: 20,
};

export type StrategicScoreInterpretation = "strong_strategic_case" | "reasonable_case_review_economics" | "weak_convert_toward_paid" | "normally_decline";

export type StrategicScoreResult = {
  baseScore: number;
  riskDeductionTotal: number;
  finalScore: number;
  interpretation: StrategicScoreInterpretation;
  factors: StrategicScoreFactors;
  riskDeductions: StrategicRiskDeductions;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpretScore(finalScore: number): StrategicScoreInterpretation {
  if (finalScore >= 75) return "strong_strategic_case";
  if (finalScore >= 60) return "reasonable_case_review_economics";
  if (finalScore >= 45) return "weak_convert_toward_paid";
  return "normally_decline";
}

export function computeStrategicScore(rawFactors: Partial<StrategicScoreFactors>, rawRiskDeductions: Partial<StrategicRiskDeductions>): StrategicScoreResult {
  const factors: StrategicScoreFactors = {
    targetClientAlignment: clamp(rawFactors.targetClientAlignment ?? 0, 0, FACTOR_MAX.targetClientAlignment),
    brandReputationAlignment: clamp(rawFactors.brandReputationAlignment ?? 0, 0, FACTOR_MAX.brandReputationAlignment),
    portfolioCreativeValue: clamp(rawFactors.portfolioCreativeValue ?? 0, 0, FACTOR_MAX.portfolioCreativeValue),
    measurableDistribution: clamp(rawFactors.measurableDistribution ?? 0, 0, FACTOR_MAX.measurableDistribution),
    revenueLeadPotential: clamp(rawFactors.revenueLeadPotential ?? 0, 0, FACTOR_MAX.revenueLeadPotential),
    marketEntryRelationshipValue: clamp(rawFactors.marketEntryRelationshipValue ?? 0, 0, FACTOR_MAX.marketEntryRelationshipValue),
    longTermStrategicValue: clamp(rawFactors.longTermStrategicValue ?? 0, 0, FACTOR_MAX.longTermStrategicValue),
  };
  const riskDeductions: StrategicRiskDeductions = {
    broadExclusivity: clamp(rawRiskDeductions.broadExclusivity ?? 0, 0, RISK_MAX.broadExclusivity),
    unclearUsageIp: clamp(rawRiskDeductions.unclearUsageIp ?? 0, 0, RISK_MAX.unclearUsageIp),
    highUnreimbursedDirectCost: clamp(rawRiskDeductions.highUnreimbursedDirectCost ?? 0, 0, RISK_MAX.highUnreimbursedDirectCost),
    reputationBrandRisk: clamp(rawRiskDeductions.reputationBrandRisk ?? 0, 0, RISK_MAX.reputationBrandRisk),
    unrealisticDeliverablesTimeline: clamp(rawRiskDeductions.unrealisticDeliverablesTimeline ?? 0, 0, RISK_MAX.unrealisticDeliverablesTimeline),
    poorCounterpartyHistory: clamp(rawRiskDeductions.poorCounterpartyHistory ?? 0, 0, RISK_MAX.poorCounterpartyHistory),
  };

  const baseScore = clamp(Object.values(factors).reduce((sum, v) => sum + v, 0), 0, 100);
  const riskDeductionTotal = Object.values(riskDeductions).reduce((sum, v) => sum + v, 0);
  const finalScore = clamp(baseScore - riskDeductionTotal, 0, 100);

  return { baseScore, riskDeductionTotal, finalScore, interpretation: interpretScore(finalScore), factors, riskDeductions };
}
