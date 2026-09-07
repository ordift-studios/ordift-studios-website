import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { computeStrategicScore, type StrategicScoreFactors, type StrategicRiskDeductions, type StrategicScoreResult } from "./strategicScore";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — strategic
// score records. APPEND-ONLY, informational only — there is
// deliberately NO approval function anywhere in this file, matching
// the underlying table's lack of an approval_status column: the score
// never authorizes anything.

export type PartnershipStrategicAssessment = StrategicScoreResult & { id: string; opportunityId: string; notes: string | null; createdAt: string };

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
}

const SELECT = "id, opportunity_id, target_client_alignment, brand_reputation_alignment, portfolio_creative_value, measurable_distribution, revenue_lead_potential, market_entry_relationship_value, long_term_strategic_value, broad_exclusivity, unclear_usage_ip, high_unreimbursed_direct_cost, reputation_brand_risk, unrealistic_deliverables_timeline, poor_counterparty_history, base_score, risk_deduction_total, final_score, interpretation, notes, created_at";

function mapRow(r: Record<string, unknown>): PartnershipStrategicAssessment {
  return {
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    factors: {
      targetClientAlignment: r.target_client_alignment as number,
      brandReputationAlignment: r.brand_reputation_alignment as number,
      portfolioCreativeValue: r.portfolio_creative_value as number,
      measurableDistribution: r.measurable_distribution as number,
      revenueLeadPotential: r.revenue_lead_potential as number,
      marketEntryRelationshipValue: r.market_entry_relationship_value as number,
      longTermStrategicValue: r.long_term_strategic_value as number,
    },
    riskDeductions: {
      broadExclusivity: r.broad_exclusivity as number,
      unclearUsageIp: r.unclear_usage_ip as number,
      highUnreimbursedDirectCost: r.high_unreimbursed_direct_cost as number,
      reputationBrandRisk: r.reputation_brand_risk as number,
      unrealisticDeliverablesTimeline: r.unrealistic_deliverables_timeline as number,
      poorCounterpartyHistory: r.poor_counterparty_history as number,
    },
    baseScore: r.base_score as number,
    riskDeductionTotal: r.risk_deduction_total as number,
    finalScore: r.final_score as number,
    interpretation: r.interpretation as StrategicScoreResult["interpretation"],
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

export async function getLatestStrategicAssessment(actorUserId: string, opportunityId: string): Promise<PartnershipStrategicAssessment | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_strategic_assessments").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[partnerships] failed to load latest strategic assessment", error.message);
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function createStrategicAssessment(params: { opportunityId: string; factors: Partial<StrategicScoreFactors>; riskDeductions: Partial<StrategicRiskDeductions>; notes?: string | null; actorUserId: string }): Promise<{ ok: true; id: string; result: StrategicScoreResult } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership assessments." };

  const result = computeStrategicScore(params.factors, params.riskDeductions);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partnership_strategic_assessments")
    .insert({
      opportunity_id: params.opportunityId,
      target_client_alignment: result.factors.targetClientAlignment,
      brand_reputation_alignment: result.factors.brandReputationAlignment,
      portfolio_creative_value: result.factors.portfolioCreativeValue,
      measurable_distribution: result.factors.measurableDistribution,
      revenue_lead_potential: result.factors.revenueLeadPotential,
      market_entry_relationship_value: result.factors.marketEntryRelationshipValue,
      long_term_strategic_value: result.factors.longTermStrategicValue,
      broad_exclusivity: result.riskDeductions.broadExclusivity,
      unclear_usage_ip: result.riskDeductions.unclearUsageIp,
      high_unreimbursed_direct_cost: result.riskDeductions.highUnreimbursedDirectCost,
      reputation_brand_risk: result.riskDeductions.reputationBrandRisk,
      unrealistic_deliverables_timeline: result.riskDeductions.unrealisticDeliverablesTimeline,
      poor_counterparty_history: result.riskDeductions.poorCounterpartyHistory,
      base_score: result.baseScore,
      risk_deduction_total: result.riskDeductionTotal,
      final_score: result.finalScore,
      interpretation: result.interpretation,
      notes: params.notes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create strategic assessment", error?.message);
    return { ok: false, error: "Failed to save the strategic assessment." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.strategic_assessment.created", entityType: "partnership_strategic_assessment", entityId: data.id, metadata: { opportunityId: params.opportunityId, finalScore: result.finalScore, interpretation: result.interpretation } });
  return { ok: true, id: data.id, result };
}
