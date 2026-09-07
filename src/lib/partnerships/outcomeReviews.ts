import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — post-
// completion outcome review, distinguishing PROMISED partner value
// from ACTUALLY RECEIVED value. Never rewrites the original approved
// partnership_value_assessments row — this is always a new, additional
// record.

export type PartnershipContributionLine = { description: string; expectedValueUsd?: number };
export type WouldCollaborateAgain = "yes" | "conditional" | "no";

export type PartnershipOutcomeReview = {
  id: string;
  opportunityId: string;
  originalNcvAmount: number | null;
  approvedRcvAmount: number | null;
  cashConsiderationAmount: number | null;
  actualOrdiftDirectCost: number | null;
  partnerContributionPromised: PartnershipContributionLine[];
  partnerContributionActuallyReceived: PartnershipContributionLine[];
  cashActuallyReceivedAmount: number | null;
  leadsGeneratedCount: number | null;
  attributableBookingsCount: number | null;
  attributableRevenueAmount: number | null;
  reachDistributionResult: string | null;
  portfolioValueOutcome: string | null;
  relationshipOutcome: string | null;
  notes: string | null;
  wouldCollaborateAgain: WouldCollaborateAgain | null;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
}

const SELECT = "id, opportunity_id, original_ncv_amount, approved_rcv_amount, cash_consideration_amount, actual_ordift_direct_cost, partner_contribution_promised, partner_contribution_actually_received, cash_actually_received_amount, leads_generated_count, attributable_bookings_count, attributable_revenue_amount, reach_distribution_result, portfolio_value_outcome, relationship_outcome, notes, would_collaborate_again, created_at";

function mapRow(r: Record<string, unknown>): PartnershipOutcomeReview {
  return {
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    originalNcvAmount: r.original_ncv_amount === null ? null : Number(r.original_ncv_amount),
    approvedRcvAmount: r.approved_rcv_amount === null ? null : Number(r.approved_rcv_amount),
    cashConsiderationAmount: r.cash_consideration_amount === null ? null : Number(r.cash_consideration_amount),
    actualOrdiftDirectCost: r.actual_ordift_direct_cost === null ? null : Number(r.actual_ordift_direct_cost),
    partnerContributionPromised: (r.partner_contribution_promised as PartnershipContributionLine[]) ?? [],
    partnerContributionActuallyReceived: (r.partner_contribution_actually_received as PartnershipContributionLine[]) ?? [],
    cashActuallyReceivedAmount: r.cash_actually_received_amount === null ? null : Number(r.cash_actually_received_amount),
    leadsGeneratedCount: r.leads_generated_count as number | null,
    attributableBookingsCount: r.attributable_bookings_count as number | null,
    attributableRevenueAmount: r.attributable_revenue_amount === null ? null : Number(r.attributable_revenue_amount),
    reachDistributionResult: r.reach_distribution_result as string | null,
    portfolioValueOutcome: r.portfolio_value_outcome as string | null,
    relationshipOutcome: r.relationship_outcome as string | null,
    notes: r.notes as string | null,
    wouldCollaborateAgain: r.would_collaborate_again as WouldCollaborateAgain | null,
    createdAt: r.created_at as string,
  };
}

export async function listOutcomeReviews(actorUserId: string, opportunityId: string): Promise<PartnershipOutcomeReview[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_outcome_reviews").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load outcome reviews", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createOutcomeReview(params: {
  opportunityId: string;
  originalNcvAmount?: number | null;
  approvedRcvAmount?: number | null;
  cashConsiderationAmount?: number | null;
  actualOrdiftDirectCost?: number | null;
  partnerContributionPromised?: PartnershipContributionLine[];
  partnerContributionActuallyReceived?: PartnershipContributionLine[];
  cashActuallyReceivedAmount?: number | null;
  leadsGeneratedCount?: number | null;
  attributableBookingsCount?: number | null;
  attributableRevenueAmount?: number | null;
  reachDistributionResult?: string | null;
  portfolioValueOutcome?: string | null;
  relationshipOutcome?: string | null;
  notes?: string | null;
  wouldCollaborateAgain?: WouldCollaborateAgain | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership outcome reviews." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partnership_outcome_reviews")
    .insert({
      opportunity_id: params.opportunityId,
      original_ncv_amount: params.originalNcvAmount ?? null,
      approved_rcv_amount: params.approvedRcvAmount ?? null,
      cash_consideration_amount: params.cashConsiderationAmount ?? null,
      actual_ordift_direct_cost: params.actualOrdiftDirectCost ?? null,
      partner_contribution_promised: params.partnerContributionPromised ?? [],
      partner_contribution_actually_received: params.partnerContributionActuallyReceived ?? [],
      cash_actually_received_amount: params.cashActuallyReceivedAmount ?? null,
      leads_generated_count: params.leadsGeneratedCount ?? null,
      attributable_bookings_count: params.attributableBookingsCount ?? null,
      attributable_revenue_amount: params.attributableRevenueAmount ?? null,
      reach_distribution_result: params.reachDistributionResult ?? null,
      portfolio_value_outcome: params.portfolioValueOutcome ?? null,
      relationship_outcome: params.relationshipOutcome ?? null,
      notes: params.notes ?? null,
      would_collaborate_again: params.wouldCollaborateAgain ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create outcome review", error?.message);
    return { ok: false, error: "Failed to save the outcome review." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.outcome_review.created", entityType: "partnership_outcome_review", entityId: data.id, metadata: { opportunityId: params.opportunityId, wouldCollaborateAgain: params.wouldCollaborateAgain ?? null } });
  return { ok: true, id: data.id };
}
