import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftAgreement, attachAgreementSnapshot, addAgreementParty } from "@/lib/legal/agreementEngine";
import {
  EMPLOYMENT_AGREEMENT_VARIABLES,
  OS_LGL_007_CANONICAL_CODE,
  type EmploymentAgreementVariableKey,
} from "@/lib/legal/documents/os-lgl-007-employee-employment-agreement";
import {
  checkEmployeeAgreementJurisdictionSchedule,
  type EmployeeAgreementJurisdictionGateState,
} from "@/lib/legal/employeeAgreementJurisdictionGate";
import { classifyEmploymentAgreementVariable } from "@/lib/legal/employeeAgreementRequirements";
import { mapEngagementTypeSlugToWorkforceRelationship } from "@/lib/compliance/workforceMappings";
import { recordRequirementEvaluation } from "@/lib/compliance/requirementAudit";
import { getCurrentEmploymentTerms, resolveCurrentEmploymentContext } from "@/lib/organization/employmentTermsHistory";

// Employee Employment Agreement — onboarding integration (E.5 Stage
// 3B-3C; requirement-engine wiring added COMP-SYS-1 Phase B3 Step 2,
// 2026-09-14). The reusable pipeline (master -> version -> agreement ->
// snapshot -> signature) lives in agreementEngine.ts/signatureEngine.ts
// unchanged; this file is only the OS-LGL-007-specific variable
// resolution against real staff_onboarding/recruitment_requisitions/
// staff_details data. Never invents a value: an unresolved REQUIRED
// field, or any unresolved REVIEW_REQUIRED classification, blocks
// agreement creation entirely — zero writes.

export type EmploymentAgreementVariables = Partial<Record<EmploymentAgreementVariableKey, string>>;

export async function resolveEmployeeAgreementVariables(
  onboardingId: string
): Promise<{ values: EmploymentAgreementVariables; engagementTypeSlug: string | null; profileId: string | null }> {
  const admin = createAdminClient();
  const { data: onboarding } = await admin
    .from("staff_onboarding")
    .select("profile_id, requisition_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!onboarding) return { values: {}, engagementTypeSlug: null, profileId: null };

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", onboarding.profile_id).maybeSingle();

  let requisition: {
    requested_position_id: string | null;
    department_id: string | null;
    grade_id: string | null;
    engagement_type_id: string | null;
    hiring_manager_id: string | null;
    preferred_start_date: string | null;
    employing_entity_id: string | null;
    employment_jurisdiction_id: string | null;
    work_location: string | null;
  } | null = null;
  if (onboarding.requisition_id) {
    const { data } = await admin
      .from("recruitment_requisitions")
      .select(
        "requested_position_id, department_id, grade_id, engagement_type_id, hiring_manager_id, preferred_start_date, employing_entity_id, employment_jurisdiction_id, work_location"
      )
      .eq("id", onboarding.requisition_id)
      .maybeSingle();
    requisition = data;
  }

  // Phase B6 Step 3 (2026-09-15), consolidated Phase B6 Step 9
  // (2026-09-15): entity/jurisdiction/work-location/start-date now come
  // from the SAME canonical resolveCurrentEmploymentContext()
  // (employmentTermsHistory.ts) the Onboarding Workspace's "Employment /
  // Hire Definition" summary uses — one shared resolver, not two
  // independently-written merges of employment_terms_history over the
  // original hire-time requisition, so the two views can never again
  // show two different answers for the same real fact. basicSalary/
  // normalWorkingHours have no requisition fallback at all (no such
  // column exists on recruitment_requisitions) — they come directly
  // from current terms, unchanged from before this consolidation.
  const currentTerms = await getCurrentEmploymentTerms(onboarding.profile_id);
  const context = await resolveCurrentEmploymentContext({
    profileId: onboarding.profile_id,
    fallback: requisition
      ? {
          employingEntityId: requisition.employing_entity_id,
          employmentJurisdictionId: requisition.employment_jurisdiction_id,
          workLocation: requisition.work_location,
          startDate: requisition.preferred_start_date,
        }
      : null,
  });

  const [position, department, grade, engagementType, manager] = await Promise.all([
    requisition?.requested_position_id ? admin.from("positions").select("name").eq("id", requisition.requested_position_id).maybeSingle() : null,
    requisition?.department_id ? admin.from("departments").select("name").eq("id", requisition.department_id).maybeSingle() : null,
    requisition?.grade_id ? admin.from("grades").select("name").eq("id", requisition.grade_id).maybeSingle() : null,
    requisition?.engagement_type_id ? admin.from("engagement_types").select("name, slug").eq("id", requisition.engagement_type_id).maybeSingle() : null,
    requisition?.hiring_manager_id ? admin.from("profiles").select("full_name").eq("id", requisition.hiring_manager_id).maybeSingle() : null,
  ]);

  // probation, allowances, annualLeave, notice: optional, no source yet.
  const values: EmploymentAgreementVariables = {
    employerLegalName: context.employingEntityName ?? undefined,
    employeeLegalName: profile?.full_name ?? undefined,
    jobTitle: position?.data?.name ?? undefined,
    organizationalGrade: grade?.data?.name ?? undefined,
    department: department?.data?.name ?? undefined,
    reportingTo: manager?.data?.full_name ?? undefined,
    startDate: context.startDate ?? undefined,
    employmentType: engagementType?.data?.name ?? undefined,
    primaryWorkLocation: context.workLocation ?? undefined,
    normalWorkingHours: currentTerms?.workPattern ?? undefined,
    basicWageSalary: currentTerms?.basicSalary
      ? `${currentTerms.currency ?? ""} ${currentTerms.basicSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
      : undefined,
    jurisdiction: context.employmentJurisdictionName ?? undefined,
  };

  return { values, engagementTypeSlug: engagementType?.data?.slug ?? null, profileId: onboarding.profile_id };
}

export interface EmploymentAgreementFieldReadiness {
  key: EmploymentAgreementVariableKey;
  label: string;
  classification: string;
  value: string | null;
  status: "satisfied" | "missing" | "review_required" | "prohibited_present" | "not_applicable";
}

// Read-only preview of createEmployeeEmploymentAgreementDraft()'s own
// gate — computes the identical classification for every field but
// never writes anything (no requirement_evaluations row, no agreement
// draft). This is what "truthfully show the actual missing facts"
// (rather than inventing them) means in practice: the Agreement
// Readiness screen calls this, not the draft-creation function, so
// simply viewing a person's readiness never has a side effect.
export async function checkEmployeeAgreementReadiness(onboardingId: string): Promise<
  | { ok: true; ready: boolean; fields: EmploymentAgreementFieldReadiness[] }
  | { ok: false; error: string; jurisdictionGateState?: EmployeeAgreementJurisdictionGateState }
> {
  const { values, engagementTypeSlug, profileId } = await resolveEmployeeAgreementVariables(onboardingId);
  if (!profileId) return { ok: false, error: "Onboarding record not found." };

  const jurisdictionGate = await checkEmployeeAgreementJurisdictionSchedule(values.jurisdiction ?? null);
  if (!jurisdictionGate.ok) {
    return { ok: false, error: jurisdictionGate.error, jurisdictionGateState: jurisdictionGate.state };
  }

  const relationship = mapEngagementTypeSlugToWorkforceRelationship(engagementTypeSlug);
  if (!relationship) {
    return {
      ok: false,
      error: "This person's workforce relationship is not yet recognized by the compliance system — it requires review before an Employee Employment Agreement can be drafted.",
    };
  }

  const fields: EmploymentAgreementFieldReadiness[] = [];
  let ready = true;

  for (const variable of EMPLOYMENT_AGREEMENT_VARIABLES) {
    const classification = classifyEmploymentAgreementVariable({
      relationship,
      jurisdiction: jurisdictionGate.workforceJurisdiction,
      key: variable.key,
    });
    const value = values[variable.key] ?? null;
    const hasValue = Boolean(value);

    let status: EmploymentAgreementFieldReadiness["status"];
    if (classification.classification === "REVIEW_REQUIRED") {
      status = "review_required";
      ready = false;
    } else if (classification.classification === "REQUIRED" && !hasValue) {
      status = "missing";
      ready = false;
    } else if (classification.classification === "PROHIBITED" && hasValue) {
      status = "prohibited_present";
      ready = false;
    } else if (classification.classification === "NOT_APPLICABLE") {
      status = "not_applicable";
    } else {
      status = "satisfied";
    }

    fields.push({ key: variable.key, label: variable.label, classification: classification.classification, value, status });
  }

  return { ok: true, ready, fields };
}

// Creates the real draft agreement ONLY when:
//  1. an approved jurisdiction schedule exists for the resolved jurisdiction
//     (employeeAgreementJurisdictionGate.ts — also confirms jurisdiction
//     itself resolves and the schedule version is active/effective);
//  2. the person's workforce relationship resolves (workforceMappings.ts —
//     never inferred from title/grade);
//  3. every EMPLOYMENT_AGREEMENT_VARIABLES field classifies REQUIRED-and-
//     present, OPTIONAL, or NOT_APPLICABLE (classifyEmploymentAgreementVariable,
//     COMP-SYS-1 Phase B3 Step 2 — replaces the old flat required:boolean
//     check; the classification itself is unchanged in substance, now
//     resolver-driven and Ghana-grounded per OS-HR-GH-001 Section 2);
//  4. no field classifies REVIEW_REQUIRED;
//  5. no field classifies PROHIBITED while still carrying a value.
// Otherwise: zero writes. Blocking classifications (REVIEW_REQUIRED,
// REQUIRED-missing, PROHIBITED-present) are persisted to
// requirement_evaluations for audit; routine passes are not, to keep the
// audit table meaningful rather than a page-view log.
//
// masterId/masterVersionId are looked up live (never hard-coded) so a
// future re-approval/new version is picked up automatically.
export async function createEmployeeEmploymentAgreementDraft(params: {
  onboardingId: string;
  actorUserId: string;
}): Promise<
  | { ok: true; agreementId: string; agreementReference: string }
  | {
      ok: false;
      error: string;
      missingFields?: string[];
      reviewRequiredFields?: string[];
      prohibitedFields?: string[];
      jurisdictionGateState?: EmployeeAgreementJurisdictionGateState;
    }
> {
  const { values, engagementTypeSlug, profileId } = await resolveEmployeeAgreementVariables(params.onboardingId);
  if (!profileId) return { ok: false, error: "Onboarding record not found." };

  const jurisdictionGate = await checkEmployeeAgreementJurisdictionSchedule(values.jurisdiction ?? null);
  if (!jurisdictionGate.ok) {
    return { ok: false, error: jurisdictionGate.error, jurisdictionGateState: jurisdictionGate.state };
  }

  const relationship = mapEngagementTypeSlugToWorkforceRelationship(engagementTypeSlug);
  if (!relationship) {
    return {
      ok: false,
      error: "This person's workforce relationship is not yet recognized by the compliance system — it requires review before an Employee Employment Agreement can be drafted.",
    };
  }

  const missingFields: string[] = [];
  const reviewRequiredFields: string[] = [];
  const prohibitedFields: string[] = [];

  for (const variable of EMPLOYMENT_AGREEMENT_VARIABLES) {
    const classification = classifyEmploymentAgreementVariable({
      relationship,
      jurisdiction: jurisdictionGate.workforceJurisdiction,
      key: variable.key,
    });
    const hasValue = Boolean(values[variable.key]);
    const isRequiredMissing = classification.classification === "REQUIRED" && !hasValue;
    const isProhibitedPresent = classification.classification === "PROHIBITED" && hasValue;
    const isReviewRequired = classification.classification === "REVIEW_REQUIRED";

    // Persist only the noteworthy outcomes — a meaningful controlled
    // decision (a block, or a fail-closed classification), not every
    // routine "required and present" pass.
    if (isReviewRequired || isRequiredMissing || isProhibitedPresent) {
      await recordRequirementEvaluation({
        subjectType: "staff_onboarding",
        subjectReference: params.onboardingId,
        domain: `employment_agreement.${variable.key}`,
        relationship,
        jurisdiction: jurisdictionGate.workforceJurisdiction,
        result: classification,
        evaluatedBy: params.actorUserId,
      });
    }

    if (isReviewRequired) {
      reviewRequiredFields.push(variable.label);
    } else if (isRequiredMissing) {
      missingFields.push(variable.label);
    } else if (isProhibitedPresent) {
      prohibitedFields.push(variable.label);
      delete values[variable.key]; // data minimization — never let a PROHIBITED value reach the snapshot
    }
  }

  if (reviewRequiredFields.length > 0) {
    return {
      ok: false,
      error: "Some employment particulars require compliance review before an Employee Employment Agreement can be drafted.",
      reviewRequiredFields,
    };
  }
  if (missingFields.length > 0) {
    return { ok: false, error: "Required employment particulars are not yet resolved — no draft was created.", missingFields };
  }
  if (prohibitedFields.length > 0) {
    return {
      ok: false,
      error: "Some resolved information must not be included in a Ghana employment agreement — review required before issuance.",
      prohibitedFields,
    };
  }

  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id, current_version_id").eq("canonical_code", OS_LGL_007_CANONICAL_CODE).maybeSingle();
  if (!master?.current_version_id) {
    return { ok: false, error: "OS-LGL-007 has no active master version registered yet." };
  }

  const draft = await createDraftAgreement({
    masterId: master.id,
    masterVersionId: master.current_version_id,
    classification: "transaction_agreement",
    engagementJurisdiction: values.jurisdiction ?? null,
    primaryContextType: "staff_onboarding",
    primaryContextReference: params.onboardingId,
    actorUserId: params.actorUserId,
  });
  if (!draft.ok) return draft;

  const employer = await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "employer",
    externalName: values.employerLegalName ?? "Ordift Studios",
    actorUserId: params.actorUserId,
  });
  if (!employer.ok) return employer;

  const employee = await addAgreementParty({
    agreementId: draft.agreementId,
    partyRole: "employee",
    profileId,
    actorUserId: params.actorUserId,
  });
  if (!employee.ok) return employee;

  const snapshot = await attachAgreementSnapshot({
    agreementId: draft.agreementId,
    snapshotData: values,
    sourceReference: `staff_onboarding:${params.onboardingId}`,
    actorUserId: params.actorUserId,
  });
  if (!snapshot.ok) return snapshot;

  return { ok: true, agreementId: draft.agreementId, agreementReference: draft.agreementReference };
}

// The derive function for the onboarding requirement
// (employment_agreement_executed) — reads the REAL agreement lifecycle
// status linked via primary_context_reference, never a manual claim.
// Signature matches RequirementTemplate.derive's existing contract
// (profileId only, same as deriveFromBackgroundScreening) — resolves
// this profile's onboarding id internally via the unique(profile_id)
// constraint, no shared-signature change needed elsewhere.
export async function deriveEmploymentAgreementExecuted(profileId: string): Promise<"satisfied" | null> {
  const admin = createAdminClient();
  const { data: onboarding } = await admin.from("staff_onboarding").select("id").eq("profile_id", profileId).maybeSingle();
  if (!onboarding) return null;

  const { data } = await admin
    .from("agreements")
    .select("status")
    .eq("primary_context_type", "staff_onboarding")
    .eq("primary_context_reference", onboarding.id)
    .in("status", ["fully_executed", "active", "completed"])
    .limit(1)
    .maybeSingle();
  return data ? "satisfied" : null;
}
