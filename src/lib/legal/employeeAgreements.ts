import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftAgreement, attachAgreementSnapshot, addAgreementParty } from "@/lib/legal/agreementEngine";
import {
  EMPLOYMENT_AGREEMENT_VARIABLES,
  OS_LGL_007_CANONICAL_CODE,
  type EmploymentAgreementVariableKey,
} from "@/lib/legal/documents/os-lgl-007-employee-employment-agreement";

// Employee Employment Agreement — onboarding integration (E.5 Stage
// 3B-3C). The reusable pipeline (master -> version -> agreement ->
// snapshot -> signature) lives in agreementEngine.ts/signatureEngine.ts
// unchanged; this file is only the OS-LGL-007-specific variable
// resolution against real staff_onboarding/recruitment_requisitions/
// staff_details data. Never invents a value: an unresolved required
// field blocks agreement creation entirely (createEmployeeEmploymentAgreementDraft
// makes zero writes when any required field is missing).

export type EmploymentAgreementVariables = Partial<Record<EmploymentAgreementVariableKey, string>>;

export async function resolveEmployeeAgreementVariables(
  onboardingId: string
): Promise<{ values: EmploymentAgreementVariables; missingRequired: string[]; profileId: string | null }> {
  const admin = createAdminClient();
  const { data: onboarding } = await admin
    .from("staff_onboarding")
    .select("profile_id, requisition_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (!onboarding) return { values: {}, missingRequired: ["Onboarding record not found"], profileId: null };

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

  const [position, department, grade, engagementType, manager, employingEntity, jurisdiction] = await Promise.all([
    requisition?.requested_position_id ? admin.from("positions").select("name").eq("id", requisition.requested_position_id).maybeSingle() : null,
    requisition?.department_id ? admin.from("departments").select("name").eq("id", requisition.department_id).maybeSingle() : null,
    requisition?.grade_id ? admin.from("grades").select("name").eq("id", requisition.grade_id).maybeSingle() : null,
    requisition?.engagement_type_id ? admin.from("engagement_types").select("name").eq("id", requisition.engagement_type_id).maybeSingle() : null,
    requisition?.hiring_manager_id ? admin.from("profiles").select("full_name").eq("id", requisition.hiring_manager_id).maybeSingle() : null,
    requisition?.employing_entity_id ? admin.from("employing_entities").select("name").eq("id", requisition.employing_entity_id).maybeSingle() : null,
    requisition?.employment_jurisdiction_id ? admin.from("employment_jurisdictions").select("name").eq("id", requisition.employment_jurisdiction_id).maybeSingle() : null,
  ]);

  // No compensation/work-schedule/leave/notice architecture exists
  // anywhere in this codebase yet (confirmed E.5 Stage 2Z/3A) — these
  // remain genuinely unresolved for every onboarding today, never
  // fabricated here.
  const values: EmploymentAgreementVariables = {
    employerLegalName: employingEntity?.data?.name ?? undefined,
    employeeLegalName: profile?.full_name ?? undefined,
    jobTitle: position?.data?.name ?? undefined,
    organizationalGrade: grade?.data?.name ?? undefined,
    department: department?.data?.name ?? undefined,
    reportingTo: manager?.data?.full_name ?? undefined,
    startDate: requisition?.preferred_start_date ?? undefined,
    employmentType: engagementType?.data?.name ?? undefined,
    primaryWorkLocation: requisition?.work_location ?? undefined,
    jurisdiction: jurisdiction?.data?.name ?? undefined,
    // basicWageSalary, normalWorkingHours: no source exists yet.
    // probation, allowances, annualLeave, notice: optional, no source yet.
  };

  const missingRequired = EMPLOYMENT_AGREEMENT_VARIABLES.filter((v) => v.required && !values[v.key]).map((v) => v.label);

  return { values, missingRequired, profileId: onboarding.profile_id };
}

// Creates the real draft agreement ONLY when every required variable
// is genuinely resolved — otherwise makes zero writes and returns the
// exact missing fields. masterId/masterVersionId are looked up live
// (never hard-coded) so a future re-approval/new version is picked up
// automatically.
export async function createEmployeeEmploymentAgreementDraft(params: {
  onboardingId: string;
  actorUserId: string;
}): Promise<{ ok: true; agreementId: string; agreementReference: string } | { ok: false; error: string; missingFields?: string[] }> {
  const { values, missingRequired, profileId } = await resolveEmployeeAgreementVariables(params.onboardingId);
  if (!profileId) return { ok: false, error: "Onboarding record not found." };
  if (missingRequired.length > 0) {
    return { ok: false, error: "Required employment particulars are not yet resolved — no draft was created.", missingFields: missingRequired };
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
