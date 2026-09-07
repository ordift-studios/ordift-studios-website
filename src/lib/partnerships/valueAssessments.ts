import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, isSuperAdminId, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { assessValueEconomics, type ValueEconomicsResult } from "./valueEconomics";
import { rcvRequiresHigherApproval, type PartnershipValueClass } from "./valueClasses";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — NCV/PCV/RCV/
// CASH assessment records. APPEND-ONLY: createValueAssessment() only
// ever INSERTs a new row (with supersedes_id pointing at the previous
// latest assessment for the opportunity, if any) — there is no UPDATE
// statement anywhere in this file that touches an existing row's
// ncv/rcv/cash/concession columns. Creating a new assessment does NOT
// itself approve anything — approveConcessionAssessment() is the
// separate, explicit action that does, and it enforces the exact
// tiered authorization the approved spec requires (see
// resolveConcessionApprovalRequirement() in valueEconomics.ts).

export type DirectCostLine = { category: string; fundedBy: "partner" | "client" | "ordift_sponsored"; amountUsd: number; notes?: string };

export type PartnershipValueAssessment = {
  id: string;
  opportunityId: string;
  ncvAmount: number;
  ncvCurrency: string;
  ncvBasis: string | null;
  ncvExplanation: string | null;
  ncvSourceReference: string | null;
  pcvAmount: number | null;
  pcvCurrency: string | null;
  pcvDescription: string | null;
  rcvAmount: number;
  rcvCurrency: string;
  rcvValueClass: PartnershipValueClass;
  rcvValuationMethod: string | null;
  rcvReason: string | null;
  rcvEvidenceReference: string | null;
  cashConsiderationAmount: number;
  cashConsiderationCurrency: string;
  netOrdiftContributionUsd: number;
  effectiveConcessionPercentage: number | null;
  partnerPositiveValueUsd: number | null;
  concessionBand: string | null;
  directCostResponsibility: DirectCostLine[];
  approvalStatus: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
};

async function authorizeAdminister(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
}

function mapRow(a: Record<string, unknown>): PartnershipValueAssessment {
  return {
    id: a.id as string,
    opportunityId: a.opportunity_id as string,
    ncvAmount: Number(a.ncv_amount),
    ncvCurrency: a.ncv_currency as string,
    ncvBasis: a.ncv_basis as string | null,
    ncvExplanation: a.ncv_explanation as string | null,
    ncvSourceReference: a.ncv_source_reference as string | null,
    pcvAmount: a.pcv_amount === null ? null : Number(a.pcv_amount),
    pcvCurrency: a.pcv_currency as string | null,
    pcvDescription: a.pcv_description as string | null,
    rcvAmount: Number(a.rcv_amount),
    rcvCurrency: a.rcv_currency as string,
    rcvValueClass: a.rcv_value_class as PartnershipValueClass,
    rcvValuationMethod: a.rcv_valuation_method as string | null,
    rcvReason: a.rcv_reason as string | null,
    rcvEvidenceReference: a.rcv_evidence_reference as string | null,
    cashConsiderationAmount: Number(a.cash_consideration_amount),
    cashConsiderationCurrency: a.cash_consideration_currency as string,
    netOrdiftContributionUsd: Number(a.net_ordift_contribution_usd),
    effectiveConcessionPercentage: a.effective_concession_percentage === null ? null : Number(a.effective_concession_percentage),
    partnerPositiveValueUsd: a.partner_positive_value_usd === null ? null : Number(a.partner_positive_value_usd),
    concessionBand: a.concession_band as string | null,
    directCostResponsibility: (a.direct_cost_responsibility as DirectCostLine[]) ?? [],
    approvalStatus: a.approval_status as "pending" | "approved" | "rejected",
    approvedBy: a.approved_by as string | null,
    approvedAt: a.approved_at as string | null,
    supersedesId: a.supersedes_id as string | null,
    createdAt: a.created_at as string,
  };
}

const SELECT = "id, opportunity_id, ncv_amount, ncv_currency, ncv_basis, ncv_explanation, ncv_source_reference, pcv_amount, pcv_currency, pcv_description, rcv_amount, rcv_currency, rcv_value_class, rcv_valuation_method, rcv_reason, rcv_evidence_reference, cash_consideration_amount, cash_consideration_currency, net_ordift_contribution_usd, effective_concession_percentage, partner_positive_value_usd, concession_band, direct_cost_responsibility, approval_status, approved_by, approved_at, supersedes_id, created_at";

export async function getLatestValueAssessment(actorUserId: string, opportunityId: string): Promise<PartnershipValueAssessment | null> {
  const auth = await authorizeAdminister(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_value_assessments").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[partnerships] failed to load latest value assessment", error.message);
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function listValueAssessmentHistory(actorUserId: string, opportunityId: string): Promise<PartnershipValueAssessment[]> {
  const auth = await authorizeAdminister(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_value_assessments").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load value assessment history", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createValueAssessment(params: {
  opportunityId: string;
  ncvAmount: number;
  ncvCurrency?: string;
  ncvBasis?: string | null;
  ncvExplanation?: string | null;
  ncvSourceReference?: string | null;
  pcvAmount?: number | null;
  pcvCurrency?: string | null;
  pcvDescription?: string | null;
  rcvAmount: number;
  rcvCurrency?: string;
  rcvValueClass: PartnershipValueClass;
  rcvValuationMethod?: string | null;
  rcvReason?: string | null;
  rcvEvidenceReference?: string | null;
  cashConsiderationAmount: number;
  cashConsiderationCurrency?: string;
  directCostResponsibility?: DirectCostLine[];
  actorUserId: string;
}): Promise<{ ok: true; id: string; economics: ValueEconomicsResult } | { ok: false; error: string }> {
  const auth = await authorizeAdminister(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership value assessments." };

  // "Class C exposure defaults to monetary RCV $0" — enforced here,
  // server-side, not merely as a UI default: whatever amount was
  // requested is discarded for Class C.
  const effectiveRcvAmount = params.rcvValueClass === "class_c_speculative" ? 0 : Math.max(0, params.rcvAmount);

  const economics = assessValueEconomics({ ncvUsd: params.ncvAmount, pcvUsd: params.pcvAmount ?? null, rcvUsd: effectiveRcvAmount, cashUsd: params.cashConsiderationAmount });
  if (!economics.ok) return { ok: false, error: economics.reason };

  const admin = createAdminClient();
  const { data: previous } = await admin.from("partnership_value_assessments").select("id").eq("opportunity_id", params.opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await admin
    .from("partnership_value_assessments")
    .insert({
      opportunity_id: params.opportunityId,
      ncv_amount: params.ncvAmount,
      ncv_currency: params.ncvCurrency ?? "USD",
      ncv_basis: params.ncvBasis ?? null,
      ncv_explanation: params.ncvExplanation ?? null,
      ncv_source_reference: params.ncvSourceReference ?? null,
      pcv_amount: params.pcvAmount ?? null,
      pcv_currency: params.pcvCurrency ?? null,
      pcv_description: params.pcvDescription ?? null,
      rcv_amount: effectiveRcvAmount,
      rcv_currency: params.rcvCurrency ?? "USD",
      rcv_value_class: params.rcvValueClass,
      rcv_valuation_method: params.rcvValuationMethod ?? null,
      rcv_reason: params.rcvReason ?? null,
      rcv_evidence_reference: params.rcvEvidenceReference ?? null,
      cash_consideration_amount: params.cashConsiderationAmount,
      cash_consideration_currency: params.cashConsiderationCurrency ?? "USD",
      net_ordift_contribution_usd: economics.position === "concession" ? economics.netOrdiftContributionUsd : 0,
      effective_concession_percentage: economics.position === "concession" ? economics.effectiveConcessionPercentage : null,
      partner_positive_value_usd: economics.position === "partner_positive_value" ? economics.partnerPositiveValueUsd : null,
      concession_band: economics.position === "concession" ? economics.band : null,
      direct_cost_responsibility: params.directCostResponsibility ?? [],
      approval_status: "pending",
      supersedes_id: previous?.id ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create value assessment", error?.message);
    return { ok: false, error: "Failed to save the value assessment." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "partnerships.value_assessment.created",
    entityType: "partnership_value_assessment",
    entityId: data.id,
    metadata: { opportunityId: params.opportunityId, ncvAmount: params.ncvAmount, rcvAmount: effectiveRcvAmount, rcvValueClass: params.rcvValueClass, position: economics.position },
  });

  if (params.rcvValueClass === "class_b_measurable_commercial" && rcvRequiresHigherApproval(params.rcvValueClass, effectiveRcvAmount, params.ncvAmount)) {
    await logActivity({ actorUserId: params.actorUserId, action: "partnerships.value_assessment.class_b_exceeds_threshold", entityType: "partnership_value_assessment", entityId: data.id, metadata: { rcvAmount: effectiveRcvAmount, ncvAmount: params.ncvAmount } });
  }

  return { ok: true, id: data.id, economics };
}

// Concession approval — the single most safety-critical action in this
// module. Enforces the EXACT tiered authorization the approved spec
// requires: the lower three bands need their own capability (or Super
// Admin); the upper two bands (>50-75%, >75-100%) accept ONLY Super
// Admin — there is no capability that can ever satisfy them, so no
// future Authority Grant assignment could accidentally unlock them.
export async function approveConcessionAssessment(params: { assessmentId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: assessment, error: fetchError } = await admin
    .from("partnership_value_assessments")
    .select("id, concession_band, approval_status")
    .eq("id", params.assessmentId)
    .maybeSingle();
  if (fetchError || !assessment) return { ok: false, error: "Value assessment not found." };
  if (assessment.approval_status !== "pending") return { ok: false, error: `This assessment is already ${assessment.approval_status} — approve the latest pending version instead.` };

  const band = assessment.concession_band as
    | "commercial_partnership"
    | "preferred_collaboration"
    | "strategic_collaboration"
    | "major_strategic_contribution"
    | "exceptional_sponsored_work"
    | "fully_sponsored_pro_bono"
    | null;

  let authorized = false;
  if (band === "commercial_partnership") {
    authorized = (await authorizeWithSuperAdminOverride(params.actorUserId, STRATEGY_CAPABILITIES.partnershipConcessionApproveNormal)).ok;
  } else if (band === "preferred_collaboration") {
    authorized = (await authorizeWithSuperAdminOverride(params.actorUserId, STRATEGY_CAPABILITIES.partnershipConcessionApprovePreferred)).ok;
  } else if (band === "strategic_collaboration") {
    authorized = (await authorizeWithSuperAdminOverride(params.actorUserId, STRATEGY_CAPABILITIES.partnershipConcessionApproveStrategic)).ok;
  } else {
    // major_strategic_contribution / exceptional_sponsored_work /
    // fully_sponsored_pro_bono / null (partner-positive-value has no
    // band at all, and still requires the highest bar since there is
    // no lower-risk classification available for it) — Super Admin
    // only, deliberately with NO capability check at all.
    authorized = await isSuperAdminId(params.actorUserId);
  }

  if (!authorized) return { ok: false, error: "Not authorized to approve a concession at this level." };

  const { error } = await admin.from("partnership_value_assessments").update({ approval_status: "approved", approved_by: params.actorUserId, approved_at: new Date().toISOString() }).eq("id", params.assessmentId);
  if (error) {
    console.error("[partnerships] failed to approve concession", error.message);
    return { ok: false, error: "Failed to approve the assessment." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.concession.approved", entityType: "partnership_value_assessment", entityId: params.assessmentId, metadata: { band } });
  return { ok: true };
}

export async function rejectValueAssessment(params: { assessmentId: string; actorUserId: string; reason?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeAdminister(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership value assessments." };

  const admin = createAdminClient();
  const { error } = await admin.from("partnership_value_assessments").update({ approval_status: "rejected", approved_by: params.actorUserId, approved_at: new Date().toISOString() }).eq("id", params.assessmentId);
  if (error) {
    console.error("[partnerships] failed to reject value assessment", error.message);
    return { ok: false, error: "Failed to reject the assessment." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.concession.rejected", entityType: "partnership_value_assessment", entityId: params.assessmentId, metadata: { reason: params.reason ?? null } });
  return { ok: true };
}
