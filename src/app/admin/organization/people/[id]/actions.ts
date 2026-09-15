"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { recordBackgroundScreening } from "@/lib/organization/backgroundScreening";
import { BACKGROUND_SCREENING_CATEGORIES, BACKGROUND_SCREENING_STATUSES } from "@/lib/organization/backgroundScreening";
import { updateAccessStatusAction } from "@/app/admin/users/actions";
import { createSeparationCase, SEPARATION_CATEGORIES, SEPARATION_REASON_TYPES, type SeparationCategory } from "@/lib/organization/separationCases";
import {
  recordPerformanceReview,
  initiatePip,
  recordPipCheckin,
  extendPip,
  decidePip,
  PIP_ALLOWED_DURATIONS_DAYS,
  type PipDurationDays,
  type PipOutcome,
} from "@/lib/organization/performanceReviews";
import {
  issueDisciplinaryAction,
  openInvestigation,
  closeInvestigation,
  recordInvestigatorySuspension,
  recordSuspensionReview,
  DISCIPLINARY_ACTION_TYPES,
  type DisciplinaryActionType,
  type InvestigationOutcome,
} from "@/lib/organization/discipline";
import {
  requestSalaryAdvance,
  decideSalaryAdvance,
  disburseSalaryAdvance,
  recordStaffBenefitTransaction,
  awardLongServiceBenefit,
  awardDeathInServiceBenefit,
  LONG_SERVICE_MILESTONE_PERCENTAGES,
  type SalaryAdvanceDecision,
  type StaffBenefitTransactionType,
  type LongServiceMilestoneYears,
} from "@/lib/organization/compensation";
import {
  acknowledgeAssetAssignment,
  returnAsset,
  transferAsset,
  reportAssetIncident,
  determineAssetIncident,
  type AssetIncidentDetermination,
} from "@/lib/organization/assets";
import {
  requestBusinessTravelAuthorization,
  approveBusinessTravelAuthorization,
  declineBusinessTravelAuthorization,
  authorizeDriver,
  revokeDriverAuthorization,
  reportVehicleIncident,
  advanceVehicleIncidentStage,
  recordVehicleIncidentResponsibilityDetermination,
  resolveVehicleIncident,
  reportWorkplaceInjury,
  advanceWorkplaceInjuryStage,
  recordWorkplaceInjuryAbsencePayClassification,
  resolveWorkplaceInjuryReport,
  type VehicleIncidentResponsibilityDetermination,
} from "@/lib/organization/businessTravel";
import { submitPortfolioUseRequest, approvePortfolioUseRequest, declinePortfolioUseRequest } from "@/lib/organization/portfolioUse";
import { createEmployeeEmploymentAgreementDraftIdempotent } from "@/lib/legal/employeeAgreements";
import {
  requestEmploymentReference,
  verifyRequesterIdentity,
  declineReferenceRequest,
  issueStandardEmploymentVerification,
  issueDetailedCorporateReference,
  type EmploymentReferenceStatus,
  type ReferenceType,
} from "@/lib/organization/employmentReferences";
import { recordPolicyAcknowledgement, type PolicyAcknowledgementMethod } from "@/lib/organization/policyAcknowledgements";
import { resolveDeferredRequirementForProfile } from "@/lib/organization/onboardingRequirements";
import {
  recordEmploymentTransition,
  completeEnhancedReview,
  recordInitialEmploymentTerms,
  EMPLOYMENT_TRANSITION_TYPES,
  WORK_PATTERN_TYPES,
  type EmploymentTransitionType,
  type EmploymentTermsFields,
  type WorkPatternType,
} from "@/lib/organization/employmentTermsHistory";
import { submitAppeal, decideAppeal, type AppealDecision } from "@/lib/organization/appeals";

// Organizational Structure, Authority Grants, Onboarding & Work Email
// V1 (2026-09-07) — Person Detail View actions. Employment/engagement
// STATUS (this file) is deliberately separate from Account/System
// Access Status (src/app/admin/users/actions.ts's
// updateAccessStatusAction, reused unchanged by the page this powers —
// not duplicated here).
const EMPLOYMENT_STATUSES = ["pre_start", "active", "probation", "leave", "suspended", "notice_period", "exited"] as const;

// Security narrowing (2026-09-07) — same people.workforce.administer
// capability as /admin/users' own requireAdmin() (see
// src/app/admin/users/actions.ts) — this file edits the same
// Employment/Access Status workforce data, so it gets the identical
// boundary rather than a looser side door.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authorized.");
  const auth = await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workforceAdminister);
  if (!auth.ok) throw new Error("Not authorized.");
  return user;
}

export async function setEmploymentStatusAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!profileId || !(EMPLOYMENT_STATUSES as readonly string[]).includes(status)) return;

  const admin = createAdminClient();
  const { data: previous } = await admin.from("staff_details").select("employment_status").eq("id", profileId).maybeSingle();

  const { error } = await admin
    .from("staff_details")
    .update({
      employment_status: status,
      employment_status_changed_at: new Date().toISOString(),
      employment_status_changed_by: currentUser.id,
    })
    .eq("id", profileId);
  if (error) {
    console.error("[admin organization] failed to update employment_status", error.message);
    return;
  }

  await logActivity({
    actorUserId: currentUser.id,
    action: "staff_details.employment_status_changed",
    entityType: "user",
    entityId: profileId,
    metadata: { previousStatus: previous?.employment_status ?? null, newStatus: status },
  });

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Background screening decision — recordBackgroundScreening() itself
// independently enforces Super-Admin-only; this action is just the
// form entry point.
export async function recordBackgroundScreeningAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim() || null;
  const evidenceReference = String(formData.get("evidenceReference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !(BACKGROUND_SCREENING_CATEGORIES as readonly string[]).includes(category)) return;
  if (!(BACKGROUND_SCREENING_STATUSES as readonly string[]).includes(status)) return;

  const result = await recordBackgroundScreening({
    profileId,
    category,
    status,
    jurisdiction,
    evidenceReference,
    notes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record background screening", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Thin wrapper so the existing updateAccessStatusAction (which returns
// {error?} for its own client-side ConfirmBar UX in UsersManager.tsx)
// can also be used directly as a plain <form action> here, which
// requires a void-returning action. No logic duplicated — the real
// function is called unmodified.
export async function updateAccessStatusFormAction(formData: FormData): Promise<void> {
  const result = await updateAccessStatusAction(formData);
  if (result.error) console.error("[admin organization] failed to update access status", result.error);
  const profileId = String(formData.get("userId") ?? "").trim();
  if (profileId) revalidatePath(`/admin/organization/people/${profileId}`);
}

// Workforce lifecycle — separation/offboarding entry point (E.5 Stage
// 2J, Part 5/9). This is the admin-invoked foundation only: every real
// call in this stage records initiatedByRole "company" honestly — no
// employee-facing self-service surface exists yet (deliberately
// deferred). createSeparationCase() itself never touches Position/
// Grade/roles/Authority/Corporate Identity/Workspace/payment; it only
// opens a case for the Clearance Workspace to act on. Authorization
// uses the same canManageSeparationCases() boundary as every other
// separation action, deliberately not this file's own
// PEOPLE_CAPABILITIES.workforceAdminister gate, so the whole
// separation feature shares one consistent authorization boundary.
export async function initiateSeparationCaseAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() as SeparationCategory;
  const reasonType = String(formData.get("reasonType") ?? "").trim();
  const reasonNotes = String(formData.get("reasonNotes") ?? "").trim() || null;
  const proposedLastWorkingDate = String(formData.get("proposedLastWorkingDate") ?? "").trim() || null;
  if (!profileId || !(SEPARATION_CATEGORIES as readonly string[]).includes(category)) return;
  if (!(SEPARATION_REASON_TYPES[category] as readonly string[]).includes(reasonType)) return;

  const result = await createSeparationCase({
    profileId,
    category,
    reasonType,
    reasonNotes,
    proposedLastWorkingDate,
    actorUserId: currentUser.id,
  });
  if (!result.ok) {
    console.error("[admin organization] failed to create separation case", result.error);
    return;
  }

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Performance Reviews / Performance Improvement Plans (Phase B5 Step 2,
// 2026-09-14) — consolidated onto the Employee Profile page rather than
// a separate top-level page (spec: "one coherent employee workspace").
// Authorization is enforced inside each lib function
// (canManagePerformance) exactly as the Separation forms above already
// rely on their own lib-level gate.
export async function recordPerformanceReviewAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const outcomeSummary = String(formData.get("outcomeSummary") ?? "").trim();
  const reviewPeriodStart = String(formData.get("reviewPeriodStart") ?? "").trim() || null;
  const reviewPeriodEnd = String(formData.get("reviewPeriodEnd") ?? "").trim() || null;
  const competencyNotes = String(formData.get("competencyNotes") ?? "").trim() || null;
  const kpiNotes = String(formData.get("kpiNotes") ?? "").trim() || null;
  if (!profileId || !outcomeSummary) return;

  const result = await recordPerformanceReview({
    profileId,
    reviewerId: currentUser.id,
    reviewPeriodStart,
    reviewPeriodEnd,
    competencyNotes,
    kpiNotes,
    outcomeSummary,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record performance review", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function initiatePipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const deficientStandard = String(formData.get("deficientStandard") ?? "").trim();
  const requiredImprovement = String(formData.get("requiredImprovement") ?? "").trim();
  const measurableObjectives = String(formData.get("measurableObjectives") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const supportResources = String(formData.get("supportResources") ?? "").trim() || null;
  const durationRaw = Number(formData.get("plannedDurationDays") ?? "");
  const plannedDurationDays = (PIP_ALLOWED_DURATIONS_DAYS as readonly number[]).includes(durationRaw) ? (durationRaw as PipDurationDays) : undefined;
  if (!profileId || !deficientStandard || !requiredImprovement || measurableObjectives.length === 0) return;

  const result = await initiatePip({
    profileId,
    deficientStandard,
    requiredImprovement,
    measurableObjectives,
    supportResources,
    plannedDurationDays,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to initiate PIP", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordPipCheckinAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!profileId || !pipId || !notes) return;

  const result = await recordPipCheckin({ pipId, notes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record PIP check-in", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function extendPipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const newEndDate = String(formData.get("newEndDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !pipId || !newEndDate || !reason) return;

  const result = await extendPip({ pipId, newEndDate, reason, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to extend PIP", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function decidePipAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const pipId = String(formData.get("pipId") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const outcomeNotes = String(formData.get("outcomeNotes") ?? "").trim();
  if (!profileId || !pipId || !outcomeNotes) return;
  if (outcome !== "completed_improved" && outcome !== "completed_failed_escalated") return;

  const result = await decidePip({ pipId, outcome: outcome as PipOutcome, outcomeNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decide PIP outcome", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Employee Relations — Discipline / Investigation (Phase B5 Step 3,
// 2026-09-14). The page itself restricts this section's visibility to
// Super Admin (same "restricted access, separate from performance"
// pattern already used for Background Screening on this page);
// issueDisciplinaryAction/openInvestigation/etc. carry their own
// independent authorization gate regardless.
export async function issueDisciplinaryActionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const actionType = String(formData.get("actionType") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const incidentDate = String(formData.get("incidentDate") ?? "").trim() || null;
  const investigationId = String(formData.get("investigationId") ?? "").trim() || null;
  if (!profileId || !reason || !(DISCIPLINARY_ACTION_TYPES as readonly string[]).includes(actionType)) return;

  const result = await issueDisciplinaryAction({
    profileId,
    actionType: actionType as DisciplinaryActionType,
    reason,
    incidentDate,
    investigationId,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to issue disciplinary action", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function openInvestigationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !reason) return;

  const result = await openInvestigation({ profileId, reason, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to open investigation", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function closeInvestigationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const investigationId = String(formData.get("investigationId") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const outcomeNotes = String(formData.get("outcomeNotes") ?? "").trim() || null;
  const validOutcomes: InvestigationOutcome[] = ["closed_no_action", "closed_resulted_in_discipline", "closed_resulted_in_separation"];
  if (!profileId || !investigationId || !(validOutcomes as string[]).includes(outcome)) return;

  const result = await closeInvestigation({ investigationId, outcome: outcome as InvestigationOutcome, outcomeNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to close investigation", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordInvestigatorySuspensionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const investigationId = String(formData.get("investigationId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const fullBasicPay = formData.get("fullBasicPay") !== "false";
  const normalBenefits = formData.get("normalBenefits") !== "false";
  const accessRestricted = formData.get("accessRestricted") === "true";
  if (!profileId || !investigationId || !reason) return;

  const result = await recordInvestigatorySuspension({ investigationId, profileId, reason, fullBasicPay, normalBenefits, accessRestricted, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record investigatory suspension", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordSuspensionReviewAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const suspensionId = String(formData.get("suspensionId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const nextReviewDueAt = String(formData.get("nextReviewDueAt") ?? "").trim() || null;
  if (!profileId || !suspensionId || (decision !== "continue_suspension" && decision !== "end_suspension")) return;

  const result = await recordSuspensionReview({ suspensionId, decision, notes, nextReviewDueAt, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record suspension review", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Compensation & Benefits (Phase B5 Step 5, 2026-09-14) — salary
// advances, staff-benefit purchases/refunds, long-service and
// death-in-service awards. Consolidated onto the Employee Profile page
// like Performance; each lib function carries its own authorization
// gate (canManageCompensation, or the exceeds-cap Super-Admin-only
// routing for salary advances) independent of this file.
export async function requestSalaryAdvanceAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestedAmount = Number(formData.get("requestedAmount") ?? "");
  if (!profileId || !(requestedAmount > 0)) return;

  const result = await requestSalaryAdvance({ profileId, requestedAmount, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to request salary advance", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function decideSalaryAdvanceAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const advanceId = String(formData.get("advanceId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || null;
  if (!profileId || !advanceId || (decision !== "approved" && decision !== "declined")) return;

  const result = await decideSalaryAdvance({ advanceId, decision: decision as SalaryAdvanceDecision, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decide salary advance", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function disburseSalaryAdvanceAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const advanceId = String(formData.get("advanceId") ?? "").trim();
  const repaymentTerms = String(formData.get("repaymentTerms") ?? "").trim();
  if (!profileId || !advanceId || !repaymentTerms) return;

  const result = await disburseSalaryAdvance({ advanceId, repaymentTerms, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to disburse salary advance", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordStaffBenefitTransactionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const transactionType = String(formData.get("transactionType") ?? "").trim();
  const benefitDescription = String(formData.get("benefitDescription") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  const payrollRecovery = formData.get("payrollRecovery") === "true";
  const relatedTransactionId = String(formData.get("relatedTransactionId") ?? "").trim() || null;
  if (!profileId || !benefitDescription || !(amount > 0) || (transactionType !== "purchase" && transactionType !== "refund")) return;

  const result = await recordStaffBenefitTransaction({
    profileId,
    transactionType: transactionType as StaffBenefitTransactionType,
    benefitDescription,
    amount,
    payrollRecovery,
    relatedTransactionId,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record staff benefit transaction", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function awardLongServiceBenefitAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const milestoneYearsRaw = Number(formData.get("milestoneYears") ?? "");
  const eligibleServiceStartDate = String(formData.get("eligibleServiceStartDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !eligibleServiceStartDate || !(milestoneYearsRaw in LONG_SERVICE_MILESTONE_PERCENTAGES)) return;

  const result = await awardLongServiceBenefit({
    profileId,
    milestoneYears: milestoneYearsRaw as LongServiceMilestoneYears,
    eligibleServiceStartDate,
    notes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to award long-service benefit", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function awardDeathInServiceBenefitAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const beneficiaryVerified = formData.get("beneficiaryVerified") === "true";
  const beneficiaryDetails = String(formData.get("beneficiaryDetails") ?? "").trim() || null;
  const verificationNotes = String(formData.get("verificationNotes") ?? "").trim() || null;
  if (!profileId) return;

  const result = await awardDeathInServiceBenefit({ profileId, beneficiaryVerified, beneficiaryDetails, verificationNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to award death-in-service benefit", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Assets & Equipment — per-person assignments and incidents (Phase B5
// Step 6, 2026-09-14). Registering/assigning new assets happens on the
// standalone /admin/organization/assets registry page; this file only
// covers actions scoped to this specific person's existing
// assignments. Loss/damage always routes to determineAssetIncidentAction
// (and, where warranted, an investigation) — never directly to a
// deduction.
export async function acknowledgeAssetAssignmentAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!profileId || !assignmentId) return;

  const result = await acknowledgeAssetAssignment({ assignmentId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to acknowledge asset assignment", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function returnAssetAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const returnCondition = String(formData.get("returnCondition") ?? "").trim();
  if (!profileId || !assignmentId || !returnCondition) return;

  const result = await returnAsset({ assignmentId, returnCondition, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to return asset", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function transferAssetAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const newProfileId = String(formData.get("newProfileId") ?? "").trim();
  const transferCondition = String(formData.get("transferCondition") ?? "").trim() || null;
  if (!profileId || !assignmentId || !newProfileId) return;

  const result = await transferAsset({ assignmentId, newProfileId, transferCondition, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to transfer asset", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function reportAssetIncidentAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const incidentType = String(formData.get("incidentType") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!profileId || !assignmentId || !incidentType || !description) return;

  const result = await reportAssetIncident({ assignmentId, profileId, incidentType, description, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to report asset incident", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function determineAssetIncidentAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  const determination = String(formData.get("determination") ?? "").trim();
  const determinationNotes = String(formData.get("determinationNotes") ?? "").trim();
  const recoveryRequired = formData.get("recoveryRequired") === "true";
  const recoveryNotes = String(formData.get("recoveryNotes") ?? "").trim() || null;
  if (!profileId || !incidentId || !determinationNotes) return;
  if (determination !== "company_matter" && determination !== "proven_deliberate_or_negligent") return;

  const result = await determineAssetIncident({
    incidentId,
    determination: determination as AssetIncidentDetermination,
    determinationNotes,
    recoveryRequired,
    recoveryNotes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to determine asset incident", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Business Travel, Driving & Production Safety (Phase B5 Step 7,
// 2026-09-14). Vehicle incidents and workplace injuries are
// deliberately separate workflows with their own stage sequences —
// never merged into one generic "incident" concept.
export async function requestBusinessTravelAuthorizationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const destinationCountry = String(formData.get("destinationCountry") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const travelStartDate = String(formData.get("travelStartDate") ?? "").trim() || null;
  const travelEndDate = String(formData.get("travelEndDate") ?? "").trim() || null;
  if (!profileId || !destinationCountry || !purpose) return;

  const result = await requestBusinessTravelAuthorization({ profileId, destinationCountry, purpose, travelStartDate, travelEndDate, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to request business travel authorization", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function approveBusinessTravelAuthorizationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const authorizationId = String(formData.get("authorizationId") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || null;
  const checks = {
    immigrationReviewed: formData.get("immigrationReviewed") === "true",
    workAuthorizationReviewed: formData.get("workAuthorizationReviewed") === "true",
    safetyReviewed: formData.get("safetyReviewed") === "true",
    jurisdictionReviewed: formData.get("jurisdictionReviewed") === "true",
  };
  if (!profileId || !authorizationId) return;

  const result = await approveBusinessTravelAuthorization({ authorizationId, checks, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to approve business travel authorization", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function declineBusinessTravelAuthorizationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const authorizationId = String(formData.get("authorizationId") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim();
  if (!profileId || !authorizationId || !decisionNotes) return;

  const result = await declineBusinessTravelAuthorization({ authorizationId, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decline business travel authorization", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function authorizeDriverAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const licenseNumber = String(formData.get("licenseNumber") ?? "").trim() || null;
  const licenseClass = String(formData.get("licenseClass") ?? "").trim() || null;
  const licenseExpiryDate = String(formData.get("licenseExpiryDate") ?? "").trim() || null;
  const authorizedVehicleTypes = String(formData.get("authorizedVehicleTypes") ?? "").trim() || null;
  if (!profileId) return;

  const result = await authorizeDriver({ profileId, licenseNumber, licenseClass, licenseExpiryDate, authorizedVehicleTypes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to authorize driver", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function revokeDriverAuthorizationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const authorizationId = String(formData.get("authorizationId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !authorizationId || !reason) return;

  const result = await revokeDriverAuthorization({ authorizationId, reason, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to revoke driver authorization", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function reportVehicleIncidentAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!profileId || !description) return;

  const result = await reportVehicleIncident({ profileId, description, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to report vehicle incident", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function advanceVehicleIncidentStageAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  if (!profileId || !incidentId) return;

  const result = await advanceVehicleIncidentStage({ incidentId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to advance vehicle incident stage", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordVehicleIncidentResponsibilityDeterminationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  const determination = String(formData.get("determination") ?? "").trim();
  const responsibilityNotes = String(formData.get("responsibilityNotes") ?? "").trim();
  const validDeterminations: VehicleIncidentResponsibilityDetermination[] = ["employee_responsible", "not_employee_responsible", "shared", "undetermined"];
  if (!profileId || !incidentId || !responsibilityNotes || !(validDeterminations as string[]).includes(determination)) return;

  const result = await recordVehicleIncidentResponsibilityDetermination({
    incidentId,
    determination: determination as VehicleIncidentResponsibilityDetermination,
    responsibilityNotes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record vehicle incident responsibility determination", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function resolveVehicleIncidentAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  const financialDisciplinaryTreatmentNotes = String(formData.get("financialDisciplinaryTreatmentNotes") ?? "").trim();
  if (!profileId || !incidentId || !financialDisciplinaryTreatmentNotes) return;

  const result = await resolveVehicleIncident({ incidentId, financialDisciplinaryTreatmentNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to resolve vehicle incident", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function reportWorkplaceInjuryAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!profileId || !description) return;

  const result = await reportWorkplaceInjury({ profileId, description, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to report workplace injury", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function advanceWorkplaceInjuryStageAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reportId = String(formData.get("reportId") ?? "").trim();
  if (!profileId || !reportId) return;

  const result = await advanceWorkplaceInjuryStage({ reportId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to advance workplace injury stage", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordWorkplaceInjuryAbsencePayClassificationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reportId = String(formData.get("reportId") ?? "").trim();
  const classification = String(formData.get("classification") ?? "").trim();
  if (!profileId || !reportId || !classification) return;

  const result = await recordWorkplaceInjuryAbsencePayClassification({ reportId, classification, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record workplace injury absence/pay classification", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function resolveWorkplaceInjuryReportAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const reportId = String(formData.get("reportId") ?? "").trim();
  const returnToWorkNotes = String(formData.get("returnToWorkNotes") ?? "").trim();
  if (!profileId || !reportId || !returnToWorkNotes) return;

  const result = await resolveWorkplaceInjuryReport({ reportId, returnToWorkNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to resolve workplace injury report", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Portfolio / Personal-Use IP (Phase B5 Step 8, 2026-09-14). Employees
// do not gain automatic publication rights — approvePortfolioUseRequest()
// itself enforces the four required checks (confidentiality, embargo,
// contractual restrictions, client/model release rights) before any
// row can be approved.
export async function submitPortfolioUseRequestAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!profileId || !description) return;

  const result = await submitPortfolioUseRequest({ profileId, description, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to submit portfolio-use request", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function approvePortfolioUseRequestAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const approvedAssets = String(formData.get("approvedAssets") ?? "").trim();
  const approvedPlatforms = String(formData.get("approvedPlatforms") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const approvedTiming = String(formData.get("approvedTiming") ?? "").trim() || null;
  const approvedConditions = String(formData.get("approvedConditions") ?? "").trim() || null;
  const checks = {
    confidentialityChecked: formData.get("confidentialityChecked") === "true",
    embargoChecked: formData.get("embargoChecked") === "true",
    contractualRestrictionsChecked: formData.get("contractualRestrictionsChecked") === "true",
    releaseRightsChecked: formData.get("releaseRightsChecked") === "true",
  };
  if (!profileId || !requestId || !approvedAssets || approvedPlatforms.length === 0) return;

  const result = await approvePortfolioUseRequest({ requestId, checks, approvedAssets, approvedPlatforms, approvedTiming, approvedConditions, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to approve portfolio-use request", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function declinePortfolioUseRequestAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim();
  if (!profileId || !requestId || !decisionNotes) return;

  const result = await declinePortfolioUseRequest({ requestId, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decline portfolio-use request", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Agreement Readiness (Phase B5 Step 10, 2026-09-14). The readiness
// preview itself (checkEmployeeAgreementReadiness) is computed directly
// in page.tsx, read-only, no action needed — this is only the "create
// the real draft" step, which createEmployeeEmploymentAgreementDraftIdempotent()
// re-derives and re-validates independently rather than trusting
// whatever the readiness preview showed a moment earlier.
//
// Rich useActionState return (2026-09-15 UI-feedback fix) — the prior
// plain Promise<void> shape gave the Founder no visible confirmation
// that a click had registered, succeeded, or failed (authenticated QA
// finding: the backend created the draft successfully with no UI
// feedback at all). alreadyExisted distinguishes "this exact click
// created a new draft" from "an identical draft already existed and
// nothing new was created" so the success message is always accurate
// — never implies issuance, approval, signature or execution, only
// that a draft exists for Founder review.
export type CreateAgreementDraftActionState =
  | { ok: true; agreementId: string; agreementReference: string; alreadyExisted: boolean }
  | { ok: false; error: string }
  | null;

export async function createEmployeeEmploymentAgreementDraftAction(
  _prev: CreateAgreementDraftActionState,
  formData: FormData
): Promise<CreateAgreementDraftActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "Not authorized." };

  const profileId = String(formData.get("profileId") ?? "").trim();
  const onboardingId = String(formData.get("onboardingId") ?? "").trim();
  if (!profileId || !onboardingId) return { ok: false, error: "Invalid request." };

  const result = await createEmployeeEmploymentAgreementDraftIdempotent({ onboardingId, actorUserId: currentUser.id });
  if (!result.ok) {
    console.error("[admin organization] failed to create employment agreement draft", result.error);
    return { ok: false, error: result.error };
  }

  revalidatePath(`/admin/organization/people/${profileId}`);
  revalidatePath(`/admin/organization/agreements/${result.agreementId}`);
  return { ok: true, agreementId: result.agreementId, agreementReference: result.agreementReference, alreadyExisted: result.alreadyExisted };
}

// Employment References (Phase B5 Step 11, 2026-09-14). Identity/
// authority verification is the real gate before any issuance — both
// issue actions carry their own independent check of it, matching the
// two issue functions' own atomic guards.
export async function requestEmploymentReferenceAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requesterName = String(formData.get("requesterName") ?? "").trim();
  const requesterOrganization = String(formData.get("requesterOrganization") ?? "").trim() || null;
  const requesterContact = String(formData.get("requesterContact") ?? "").trim() || null;
  const employeeOrFormerEmployee = String(formData.get("employeeOrFormerEmployee") ?? "").trim();
  const referenceType = String(formData.get("referenceType") ?? "").trim();
  if (!profileId || !requesterName) return;
  if (employeeOrFormerEmployee !== "employee" && employeeOrFormerEmployee !== "former_employee") return;
  if (referenceType !== "standard_verification" && referenceType !== "detailed_corporate_reference") return;

  const result = await requestEmploymentReference({
    profileId,
    requesterName,
    requesterOrganization,
    requesterContact,
    employeeOrFormerEmployee: employeeOrFormerEmployee as EmploymentReferenceStatus,
    referenceType: referenceType as ReferenceType,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to log reference request", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function verifyRequesterIdentityAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!profileId || !requestId) return;

  const result = await verifyRequesterIdentity({ requestId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to verify requester identity", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function declineReferenceRequestAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim();
  if (!profileId || !requestId || !decisionNotes) return;

  const result = await declineReferenceRequest({ requestId, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decline reference request", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function issueStandardEmploymentVerificationAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!profileId || !requestId) return;

  const result = await issueStandardEmploymentVerification({ requestId, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to issue standard employment verification", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function issueDetailedCorporateReferenceAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const informationAuthorizedForRelease = String(formData.get("informationAuthorizedForRelease") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!profileId || !requestId || !informationAuthorizedForRelease || !content) return;

  const result = await issueDetailedCorporateReference({ requestId, informationAuthorizedForRelease, content, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to issue detailed corporate reference", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Controlled Policy / Acknowledgement (Phase B5 Step 12, 2026-09-14).
export async function recordPolicyAcknowledgementAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const documentVersionId = String(formData.get("documentVersionId") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const evidenceReference = String(formData.get("evidenceReference") ?? "").trim() || null;
  if (!profileId || !documentVersionId) return;
  if (method !== "digital_click_through" && method !== "physical_signature") return;

  const result = await recordPolicyAcknowledgement({ profileId, documentVersionId, method: method as PolicyAcknowledgementMethod, evidenceReference, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record policy acknowledgement", result.error);
  else {
    // Best-effort, same reasoning as the self-acknowledgement path in
    // admin/me/actions.ts — never blocks the genuine evidence already
    // recorded above, and only resolves once EVERY applicable policy
    // is genuinely acknowledged.
    try {
      await resolveDeferredRequirementForProfile({ profileId, requirementKey: "policies_acknowledged" });
    } catch (err) {
      console.error("[admin organization] failed to resolve deferred policies_acknowledged requirement", err);
    }
  }

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// International & Employment Transitions (Phase B6 Step 2, 2026-09-15).
// Deliberately never accepts positionId/gradeId/managerId here — role/
// title, grade, and reporting-line changes remain the exclusive
// responsibility of assignStaffPosition() (the Organization page), so a
// country move recorded here and a promotion recorded there are always
// two separate, separately-audited actions, even when submitted
// together in the same sitting.
export async function recordEmploymentTransitionAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const transitionType = String(formData.get("transitionType") ?? "").trim();
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !(EMPLOYMENT_TRANSITION_TYPES as readonly string[]).includes(transitionType)) return;

  const changes: Partial<EmploymentTermsFields> = {};
  const employingEntityId = String(formData.get("employingEntityId") ?? "").trim();
  const employmentJurisdictionId = String(formData.get("employmentJurisdictionId") ?? "").trim();
  const workLocation = String(formData.get("workLocation") ?? "").trim();
  const basicSalaryRaw = String(formData.get("basicSalary") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const workPatternTypeRaw = String(formData.get("workPatternType") ?? "").trim();
  if (employingEntityId) changes.employingEntityId = employingEntityId;
  if (employmentJurisdictionId) changes.employmentJurisdictionId = employmentJurisdictionId;
  if (workLocation) changes.workLocation = workLocation;
  if (basicSalaryRaw) changes.basicSalary = Number(basicSalaryRaw);
  if (currency) changes.currency = currency;
  if ((WORK_PATTERN_TYPES as readonly string[]).includes(workPatternTypeRaw)) changes.workPatternType = workPatternTypeRaw as WorkPatternType;
  if (Object.keys(changes).length === 0) return;

  const result = await recordEmploymentTransition({
    profileId,
    transitionType: transitionType as EmploymentTransitionType,
    effectiveFrom,
    changes,
    notes,
    actorUserId: currentUser.id,
  });
  if (!result.ok) console.error("[admin organization] failed to record employment transition", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function recordInitialEmploymentTermsAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  if (!profileId || !effectiveFrom) return;

  const changes: Partial<EmploymentTermsFields> = {};
  const employingEntityId = String(formData.get("employingEntityId") ?? "").trim();
  const employmentJurisdictionId = String(formData.get("employmentJurisdictionId") ?? "").trim();
  const workLocation = String(formData.get("workLocation") ?? "").trim();
  const basicSalaryRaw = String(formData.get("basicSalary") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const workPattern = String(formData.get("workPattern") ?? "").trim();
  const workPatternTypeRaw = String(formData.get("workPatternType") ?? "").trim();
  if (employingEntityId) changes.employingEntityId = employingEntityId;
  if (employmentJurisdictionId) changes.employmentJurisdictionId = employmentJurisdictionId;
  if (workLocation) changes.workLocation = workLocation;
  if (basicSalaryRaw) changes.basicSalary = Number(basicSalaryRaw);
  if (currency) changes.currency = currency;
  if (workPattern) changes.workPattern = workPattern;
  if ((WORK_PATTERN_TYPES as readonly string[]).includes(workPatternTypeRaw)) changes.workPatternType = workPatternTypeRaw as WorkPatternType;

  const result = await recordInitialEmploymentTerms({ profileId, effectiveFrom, changes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to record initial employment terms", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function completeEnhancedReviewAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const employmentTermsHistoryId = String(formData.get("employmentTermsHistoryId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!profileId || !employmentTermsHistoryId) return;

  const result = await completeEnhancedReview({ employmentTermsHistoryId, notes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to complete enhanced review", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

// Appeals (Phase B6 Step 6, 2026-09-15) — against a decided
// disciplinary action, grievance resolution, or other decided outcome.
export async function submitAppealAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const appealedDecisionType = String(formData.get("appealedDecisionType") ?? "").trim();
  const appealedDecisionReference = String(formData.get("appealedDecisionReference") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const decisionDate = String(formData.get("decisionDate") ?? "").trim() || null;
  if (!profileId || !appealedDecisionType || !appealedDecisionReference || !reason) return;

  const result = await submitAppeal({ profileId, appealedDecisionType, appealedDecisionReference, reason, decisionDate, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to submit appeal", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}

export async function decideAppealAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const profileId = String(formData.get("profileId") ?? "").trim();
  const appealId = String(formData.get("appealId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim();
  if (!profileId || !appealId || !decisionNotes) return;
  if (decision !== "upheld" && decision !== "overturned" && decision !== "partially_upheld") return;

  const result = await decideAppeal({ appealId, decision: decision as AppealDecision, decisionNotes, actorUserId: currentUser.id });
  if (!result.ok) console.error("[admin organization] failed to decide appeal", result.error);

  revalidatePath(`/admin/organization/people/${profileId}`);
}
