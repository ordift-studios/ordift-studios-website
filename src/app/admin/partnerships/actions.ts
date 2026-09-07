"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createOpportunity, setOpportunityStatus, type PartnershipOpportunityStatus, type PartnershipDecisionOutcome } from "@/lib/partnerships/opportunities";
import { createValueAssessment, approveConcessionAssessment, rejectValueAssessment } from "@/lib/partnerships/valueAssessments";
import type { PartnershipValueClass } from "@/lib/partnerships/valueClasses";
import { createStrategicAssessment } from "@/lib/partnerships/strategicAssessments";
import { createAgreementVersion, type PartnershipAgreementStatus } from "@/lib/partnerships/agreements";
import { createReferralTerms, approveReferralTerms, createReferralLead, disputeReferralLead } from "@/lib/partnerships/referrals";
import { recordCommissionEvent, setCommissionEventStatus, type CommissionEventStatus } from "@/lib/partnerships/referralCommissions";
import { createOutcomeReview, type WouldCollaborateAgain } from "@/lib/partnerships/outcomeReviews";
import type { ReferralDurationPreset } from "@/lib/partnerships/referralMath";

// Partnerships & Collaborations V1 (2026-09-07) — thin Server Action
// wrappers, same established pattern as every other Admin actions.ts:
// resolve the actor, call the governed lib function (which re-checks
// authorization and writes the audit log itself), revalidate.

export async function createOpportunityAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const partnershipTypeId = String(formData.get("partnershipTypeId") ?? "");
  const counterpartName = String(formData.get("counterpartName") ?? "");
  if (!partnershipTypeId || !counterpartName.trim()) return;

  const result = await createOpportunity({
    partnershipTypeId,
    counterpartName,
    counterpartOrganisation: (formData.get("counterpartOrganisation") as string) || null,
    counterpartContactEmail: (formData.get("counterpartContactEmail") as string) || null,
    counterpartContactPhone: (formData.get("counterpartContactPhone") as string) || null,
    marketSlug: (formData.get("marketSlug") as string) || null,
    summary: (formData.get("summary") as string) || null,
    notes: (formData.get("notes") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create partnership opportunity", result.error);

  revalidatePath("/admin/partnerships/opportunities");
  revalidatePath("/admin/partnerships");
}

export async function setOpportunityStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const status = String(formData.get("status") ?? "") as PartnershipOpportunityStatus;
  const decisionOutcome = (formData.get("decisionOutcome") as string) || undefined;
  if (!opportunityId || !status) return;

  const result = await setOpportunityStatus({ opportunityId, status, decisionOutcome: decisionOutcome as PartnershipDecisionOutcome | undefined, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update opportunity status", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
  revalidatePath("/admin/partnerships/opportunities");
}

export async function createValueAssessmentAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const ncvAmount = Number(formData.get("ncvAmount"));
  const rcvAmount = Number(formData.get("rcvAmount"));
  const cashConsiderationAmount = Number(formData.get("cashConsiderationAmount"));
  const rcvValueClass = String(formData.get("rcvValueClass") ?? "") as PartnershipValueClass;
  if (!opportunityId || !Number.isFinite(ncvAmount) || !Number.isFinite(rcvAmount) || !Number.isFinite(cashConsiderationAmount) || !rcvValueClass) {
    return { ok: false, error: "Missing required fields." };
  }

  const result = await createValueAssessment({
    opportunityId,
    ncvAmount,
    ncvBasis: (formData.get("ncvBasis") as string) || null,
    ncvExplanation: (formData.get("ncvExplanation") as string) || null,
    ncvSourceReference: (formData.get("ncvSourceReference") as string) || null,
    pcvAmount: formData.get("pcvAmount") ? Number(formData.get("pcvAmount")) : null,
    pcvDescription: (formData.get("pcvDescription") as string) || null,
    rcvAmount,
    rcvValueClass,
    rcvValuationMethod: (formData.get("rcvValuationMethod") as string) || null,
    rcvReason: (formData.get("rcvReason") as string) || null,
    rcvEvidenceReference: (formData.get("rcvEvidenceReference") as string) || null,
    cashConsiderationAmount,
    actorUserId: user.id,
  });

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function approveConcessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!assessmentId) return;

  const result = await approveConcessionAssessment({ assessmentId, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to approve concession", result.error);

  if (opportunityId) revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}

export async function rejectValueAssessmentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!assessmentId) return;

  const result = await rejectValueAssessment({ assessmentId, actorUserId: user.id, reason: (formData.get("reason") as string) || undefined });
  if (!result.ok) console.error("[admin] failed to reject value assessment", result.error);

  if (opportunityId) revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}

export async function createStrategicAssessmentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!opportunityId) return;

  const numField = (name: string) => (formData.get(name) ? Number(formData.get(name)) : 0);

  const result = await createStrategicAssessment({
    opportunityId,
    factors: {
      targetClientAlignment: numField("targetClientAlignment"),
      brandReputationAlignment: numField("brandReputationAlignment"),
      portfolioCreativeValue: numField("portfolioCreativeValue"),
      measurableDistribution: numField("measurableDistribution"),
      revenueLeadPotential: numField("revenueLeadPotential"),
      marketEntryRelationshipValue: numField("marketEntryRelationshipValue"),
      longTermStrategicValue: numField("longTermStrategicValue"),
    },
    riskDeductions: {
      broadExclusivity: numField("broadExclusivity"),
      unclearUsageIp: numField("unclearUsageIp"),
      highUnreimbursedDirectCost: numField("highUnreimbursedDirectCost"),
      reputationBrandRisk: numField("reputationBrandRisk"),
      unrealisticDeliverablesTimeline: numField("unrealisticDeliverablesTimeline"),
      poorCounterpartyHistory: numField("poorCounterpartyHistory"),
    },
    notes: (formData.get("notes") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create strategic assessment", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}

export async function createAgreementVersionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const status = String(formData.get("status") ?? "") as PartnershipAgreementStatus;
  if (!opportunityId || !status) return;

  const result = await createAgreementVersion({
    opportunityId,
    status,
    termsSnapshot: {
      parties: (formData.get("parties") as string) || "",
      scope: (formData.get("scope") as string) || "",
      deliverables: (formData.get("deliverables") as string) || "",
      directCostResponsibility: (formData.get("directCostResponsibility") as string) || "",
      ipNotes: (formData.get("ipNotes") as string) || "",
      revisionsApprovals: (formData.get("revisionsApprovals") as string) || "",
      timeline: (formData.get("timeline") as string) || "",
      cancellationTerms: (formData.get("cancellationTerms") as string) || "",
      credits: (formData.get("credits") as string) || "",
      confidentiality: (formData.get("confidentiality") as string) || "",
      referralTerms: (formData.get("referralTerms") as string) || null,
      approvalAuthority: (formData.get("approvalAuthority") as string) || "",
    },
    acceptanceRecordedAt: formData.get("acceptanceRecorded") === "true" ? new Date().toISOString() : null,
    acceptanceMethod: (formData.get("acceptanceMethod") as string) || null,
    signatureReference: (formData.get("signatureReference") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create agreement version", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}

export async function createReferralTermsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!opportunityId) return;

  const result = await createReferralTerms({
    opportunityId,
    commissionPercentage: formData.get("commissionPercentage") ? Number(formData.get("commissionPercentage")) : undefined,
    durationPreset: (formData.get("durationPreset") as ReferralDurationPreset) || undefined,
    customDurationMonths: formData.get("customDurationMonths") ? Number(formData.get("customDurationMonths")) : null,
    reasonForElevatedRate: (formData.get("reasonForElevatedRate") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create referral terms", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
  revalidatePath("/admin/partnerships/referrals");
}

export async function approveReferralTermsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const referralId = String(formData.get("referralId") ?? "");
  if (!referralId) return;

  const result = await approveReferralTerms({ referralId, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to approve referral terms", result.error);

  revalidatePath("/admin/partnerships/referrals");
}

export async function createReferralLeadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const referralId = String(formData.get("referralId") ?? "");
  const prospectName = String(formData.get("prospectName") ?? "");
  const attributionWindowDays = Number(formData.get("attributionWindowDays") ?? 90);
  if (!referralId || !prospectName.trim()) return;

  const result = await createReferralLead({
    referralId,
    prospectName,
    prospectEmail: (formData.get("prospectEmail") as string) || null,
    prospectReference: (formData.get("prospectReference") as string) || null,
    attributionWindowDays,
    eligibilityFlags: {
      isAlreadyClient: formData.get("isAlreadyClient") === "true",
      hasActiveEnquiry: formData.get("hasActiveEnquiry") === "true",
      alreadyInPipeline: formData.get("alreadyInPipeline") === "true",
      alreadyAttributedToOther: formData.get("alreadyAttributedToOther") === "true",
      isSelfReferral: formData.get("isSelfReferral") === "true",
      isDuplicateReferral: formData.get("isDuplicateReferral") === "true",
      isCircularReferral: formData.get("isCircularReferral") === "true",
      isRelatedParty: formData.get("isRelatedParty") === "true",
      relatedPartyDisclosed: formData.get("relatedPartyDisclosed") === "true",
      isEmployeeAssignedClient: formData.get("isEmployeeAssignedClient") === "true",
    },
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create referral lead", result.error);

  revalidatePath("/admin/partnerships/referrals");
}

export async function disputeReferralLeadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const leadId = String(formData.get("leadId") ?? "");
  const disputeNotes = String(formData.get("disputeNotes") ?? "");
  if (!leadId || !disputeNotes.trim()) return;

  const result = await disputeReferralLead({ leadId, disputeNotes, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to dispute referral lead", result.error);

  revalidatePath("/admin/partnerships/referrals");
}

export async function recordCommissionEventAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const referralLeadId = String(formData.get("referralLeadId") ?? "");
  const grossCollectedAmount = Number(formData.get("grossCollectedAmount"));
  const commissionPercentage = Number(formData.get("commissionPercentage"));
  if (!referralLeadId || !Number.isFinite(grossCollectedAmount) || !Number.isFinite(commissionPercentage)) return;

  const result = await recordCommissionEvent({
    referralLeadId,
    grossCollectedAmount,
    excludedAmount: formData.get("excludedAmount") ? Number(formData.get("excludedAmount")) : 0,
    commissionPercentage,
    collectedReferenceType: (formData.get("collectedReferenceType") as string) || null,
    collectedReferenceId: (formData.get("collectedReferenceId") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to record commission event", result.error);

  revalidatePath("/admin/partnerships/referrals");
}

export async function setCommissionEventStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "") as CommissionEventStatus;
  if (!eventId || !status) return;

  const result = await setCommissionEventStatus({ eventId, status, actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to update commission event status", result.error);

  revalidatePath("/admin/partnerships/referrals");
}

export async function createOutcomeReviewAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!opportunityId) return;

  const result = await createOutcomeReview({
    opportunityId,
    originalNcvAmount: formData.get("originalNcvAmount") ? Number(formData.get("originalNcvAmount")) : null,
    approvedRcvAmount: formData.get("approvedRcvAmount") ? Number(formData.get("approvedRcvAmount")) : null,
    cashConsiderationAmount: formData.get("cashConsiderationAmount") ? Number(formData.get("cashConsiderationAmount")) : null,
    actualOrdiftDirectCost: formData.get("actualOrdiftDirectCost") ? Number(formData.get("actualOrdiftDirectCost")) : null,
    cashActuallyReceivedAmount: formData.get("cashActuallyReceivedAmount") ? Number(formData.get("cashActuallyReceivedAmount")) : null,
    leadsGeneratedCount: formData.get("leadsGeneratedCount") ? Number(formData.get("leadsGeneratedCount")) : null,
    attributableBookingsCount: formData.get("attributableBookingsCount") ? Number(formData.get("attributableBookingsCount")) : null,
    attributableRevenueAmount: formData.get("attributableRevenueAmount") ? Number(formData.get("attributableRevenueAmount")) : null,
    reachDistributionResult: (formData.get("reachDistributionResult") as string) || null,
    portfolioValueOutcome: (formData.get("portfolioValueOutcome") as string) || null,
    relationshipOutcome: (formData.get("relationshipOutcome") as string) || null,
    notes: (formData.get("notes") as string) || null,
    wouldCollaborateAgain: (formData.get("wouldCollaborateAgain") as WouldCollaborateAgain) || null,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin] failed to create outcome review", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}

// "Convert to Paid Proposal" — preserves the original opportunity/
// history (never deletes it), just records the decision. Routing the
// scope into the normal enquiry/quote/booking process, and any actual
// booking, remains a separate, explicit, client-accepted action outside
// this function's scope — this only records the internal decision.
export async function convertToPaidProposalAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!opportunityId) return;

  const result = await setOpportunityStatus({ opportunityId, status: "decision", decisionOutcome: "convert_to_paid_proposal", actorUserId: user.id });
  if (!result.ok) console.error("[admin] failed to convert opportunity to paid proposal", result.error);

  revalidatePath(`/admin/partnerships/opportunities/${opportunityId}`);
}
