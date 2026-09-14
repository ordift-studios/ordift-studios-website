import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 13 (2026-09-14) —
// business travel, driving, and production safety, OS-HR-GH-005
// section 5. Two genuinely different real workflows (vehicle incidents
// vs. workplace injuries) are kept structurally separate, matching the
// standing instruction not to merge conceptually different workflows.

async function canManageBusinessTravel(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// --- business travel (5.1) --------------------------------------------

export interface BusinessTravelApprovalChecks {
  immigrationReviewed: boolean;
  workAuthorizationReviewed: boolean;
  safetyReviewed: boolean;
  jurisdictionReviewed: boolean;
}

// Pure — validates completeness of the four required reviews from
// OS-HR-GH-005 5.1, never performs any of them itself.
export function validateBusinessTravelApprovalChecks(checks: BusinessTravelApprovalChecks): { ok: true } | { ok: false; error: string } {
  if (!checks.immigrationReviewed) return { ok: false, error: "Immigration must be reviewed before approval." };
  if (!checks.workAuthorizationReviewed) return { ok: false, error: "Work authorization must be reviewed before approval." };
  if (!checks.safetyReviewed) return { ok: false, error: "Safety must be reviewed before approval." };
  if (!checks.jurisdictionReviewed) return { ok: false, error: "Jurisdiction must be reviewed before approval." };
  return { ok: true };
}

export async function requestBusinessTravelAuthorization(params: {
  profileId: string;
  destinationCountry: string;
  purpose: string;
  travelStartDate?: string | null;
  travelEndDate?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; authorizationId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to request travel authorization on behalf of another person." };
  }
  if (!params.destinationCountry.trim()) return { ok: false, error: "A destination country is required." };
  if (!params.purpose.trim()) return { ok: false, error: "A purpose is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_travel_authorizations")
    .insert({
      profile_id: params.profileId,
      requested_by: params.actorUserId,
      destination_country: params.destinationCountry,
      purpose: params.purpose,
      travel_start_date: params.travelStartDate ?? null,
      travel_end_date: params.travelEndDate ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to request travel authorization." };

  await logActivity({ actorUserId: params.actorUserId, action: "business_travel_authorization.requested", entityType: "user", entityId: params.profileId, metadata: { authorizationId: data.id } });
  return { ok: true, authorizationId: data.id };
}

// The ONLY function that can set status='approved' — requires all four
// checks true (validated via validateBusinessTravelApprovalChecks()
// before any row is touched). Never writes to
// employment_terms_history.employing_entity_id — OS-HR-GH-005 5.1:
// "Travel does not silently change employing entity or governing law."
export async function approveBusinessTravelAuthorization(params: { authorizationId: string; checks: BusinessTravelApprovalChecks; decisionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to approve travel authorization." };
  }
  const validation = validateBusinessTravelApprovalChecks(params.checks);
  if (!validation.ok) return validation;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_travel_authorizations")
    .update({
      status: "approved",
      immigration_reviewed: params.checks.immigrationReviewed,
      work_authorization_reviewed: params.checks.workAuthorizationReviewed,
      safety_reviewed: params.checks.safetyReviewed,
      jurisdiction_reviewed: params.checks.jurisdictionReviewed,
      approved_by: params.actorUserId,
      approved_at: new Date().toISOString(),
      decision_notes: params.decisionNotes ?? null,
    })
    .eq("id", params.authorizationId)
    .eq("status", "requested")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to approve the travel authorization." };
  if (!data) return { ok: false, error: "Authorization not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "business_travel_authorization.approved", entityType: "user", entityId: data.profile_id, metadata: { authorizationId: params.authorizationId } });
  return { ok: true };
}

export async function declineBusinessTravelAuthorization(params: { authorizationId: string; decisionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decline travel authorization." };
  }
  if (!params.decisionNotes.trim()) return { ok: false, error: "Decision notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_travel_authorizations")
    .update({ status: "declined", approved_by: params.actorUserId, approved_at: new Date().toISOString(), decision_notes: params.decisionNotes })
    .eq("id", params.authorizationId)
    .eq("status", "requested")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decline the travel authorization." };
  if (!data) return { ok: false, error: "Authorization not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "business_travel_authorization.declined", entityType: "user", entityId: data.profile_id, metadata: { authorizationId: params.authorizationId } });
  return { ok: true };
}

// --- driver authorization (5.2) ----------------------------------------

export async function authorizeDriver(params: { profileId: string; licenseNumber?: string | null; licenseClass?: string | null; licenseExpiryDate?: string | null; authorizedVehicleTypes?: string | null; actorUserId: string }): Promise<{ ok: true; authorizationId: string } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to authorize a driver." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("driver_authorizations")
    .insert({
      profile_id: params.profileId,
      license_number: params.licenseNumber ?? null,
      license_class: params.licenseClass ?? null,
      license_expiry_date: params.licenseExpiryDate ?? null,
      authorized_vehicle_types: params.authorizedVehicleTypes ?? null,
      authorized_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to authorize the driver." };

  await logActivity({ actorUserId: params.actorUserId, action: "driver_authorization.authorized", entityType: "user", entityId: params.profileId, metadata: { authorizationId: data.id } });
  return { ok: true, authorizationId: data.id };
}

export async function revokeDriverAuthorization(params: { authorizationId: string; reason: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to revoke a driver authorization." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A reason is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("driver_authorizations")
    .update({ status: "revoked", revoked_by: params.actorUserId, revoked_at: new Date().toISOString(), revoked_reason: params.reason })
    .eq("id", params.authorizationId)
    .eq("status", "active")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to revoke the authorization." };
  if (!data) return { ok: false, error: "Authorization not found, or already revoked." };

  await logActivity({ actorUserId: params.actorUserId, action: "driver_authorization.revoked", entityType: "user", entityId: data.profile_id, metadata: { authorizationId: params.authorizationId } });
  return { ok: true };
}

// --- vehicle incidents (5.3) --------------------------------------------

export const VEHICLE_INCIDENT_WORKFLOW_ORDER = [
  "safety_medical_response",
  "incident_report",
  "insurance_authority_requirements",
  "investigation",
  "responsibility_determination",
  "lawful_financial_disciplinary_treatment",
] as const;
export type VehicleIncidentStage = (typeof VEHICLE_INCIDENT_WORKFLOW_ORDER)[number];

// Pure — OS-HR-GH-005 5.3's real, exact 6-stage sequence, never invented
// or reordered.
export function computeNextVehicleIncidentStage(current: VehicleIncidentStage): VehicleIncidentStage | null {
  const index = VEHICLE_INCIDENT_WORKFLOW_ORDER.indexOf(current);
  if (index === -1 || index === VEHICLE_INCIDENT_WORKFLOW_ORDER.length - 1) return null;
  return VEHICLE_INCIDENT_WORKFLOW_ORDER[index + 1];
}

export async function reportVehicleIncident(params: { profileId: string; assetId?: string | null; description: string; occurredAt?: string | null; actorUserId: string }): Promise<{ ok: true; incidentId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_incident_reports")
    .insert({ profile_id: params.profileId, reported_by: params.actorUserId, asset_id: params.assetId ?? null, description: params.description, occurred_at: params.occurredAt ?? new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to report the vehicle incident." };

  await logActivity({ actorUserId: params.actorUserId, action: "vehicle_incident.reported", entityType: "user", entityId: params.profileId, metadata: { incidentId: data.id } });
  return { ok: true, incidentId: data.id };
}

export async function advanceVehicleIncidentStage(params: { incidentId: string; actorUserId: string }): Promise<{ ok: true; newStage: VehicleIncidentStage } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to advance a vehicle incident's stage." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("vehicle_incident_reports").select("id, profile_id, stage").eq("id", params.incidentId).maybeSingle();
  if (!existing) return { ok: false, error: "Incident not found." };

  const next = computeNextVehicleIncidentStage(existing.stage as VehicleIncidentStage);
  if (next === null) return { ok: false, error: "This incident is already at its final stage." };

  const { data, error } = await admin.from("vehicle_incident_reports").update({ stage: next }).eq("id", params.incidentId).eq("stage", existing.stage).select("id").maybeSingle();
  if (error) return { ok: false, error: "Failed to advance the stage." };
  if (!data) return { ok: false, error: "The incident's stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "vehicle_incident.stage_advanced", entityType: "user", entityId: existing.profile_id, metadata: { incidentId: params.incidentId, newStage: next } });
  return { ok: true, newStage: next };
}

export type VehicleIncidentResponsibilityDetermination = "employee_responsible" | "not_employee_responsible" | "shared" | "undetermined";

// Always an explicit human decision — never inferred. "An accident does
// not automatically make the employee financially liable" (5.3): this
// function never writes to salary_advances, final_settlement_deductions,
// or disciplinary_actions.
export async function recordVehicleIncidentResponsibilityDetermination(params: {
  incidentId: string;
  determination: VehicleIncidentResponsibilityDetermination;
  responsibilityNotes: string;
  investigationId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a responsibility determination." };
  }
  if (!params.responsibilityNotes.trim()) return { ok: false, error: "Responsibility notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_incident_reports")
    .update({ responsibility_determination: params.determination, responsibility_notes: params.responsibilityNotes, investigation_id: params.investigationId ?? null })
    .eq("id", params.incidentId)
    .eq("stage", "responsibility_determination")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the determination." };
  if (!data) return { ok: false, error: "Incident not found, or not currently at the responsibility_determination stage." };

  await logActivity({ actorUserId: params.actorUserId, action: "vehicle_incident.responsibility_determined", entityType: "user", entityId: data.profile_id, metadata: { incidentId: params.incidentId, determination: params.determination } });
  return { ok: true };
}

export async function resolveVehicleIncident(params: { incidentId: string; financialDisciplinaryTreatmentNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to resolve a vehicle incident." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_incident_reports")
    .update({ financial_disciplinary_treatment_notes: params.financialDisciplinaryTreatmentNotes, resolved_at: new Date().toISOString() })
    .eq("id", params.incidentId)
    .eq("stage", "lawful_financial_disciplinary_treatment")
    .is("resolved_at", null)
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to resolve the incident." };
  if (!data) return { ok: false, error: "Incident not found, not at the final stage, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "vehicle_incident.resolved", entityType: "user", entityId: data.profile_id, metadata: { incidentId: params.incidentId } });
  return { ok: true };
}

// --- workplace injuries (5.4) --------------------------------------------

export const WORKPLACE_INJURY_WORKFLOW_ORDER = [
  "safety_medical_response",
  "incident_investigation",
  "statutory_insurance_processing",
  "absence_pay_classification",
  "return_to_work",
] as const;
export type WorkplaceInjuryStage = (typeof WORKPLACE_INJURY_WORKFLOW_ORDER)[number];

// Pure — OS-HR-GH-005 5.4's real, exact 5-stage sequence, deliberately
// different from vehicle_incident_reports' 5.3 stages.
export function computeNextWorkplaceInjuryStage(current: WorkplaceInjuryStage): WorkplaceInjuryStage | null {
  const index = WORKPLACE_INJURY_WORKFLOW_ORDER.indexOf(current);
  if (index === -1 || index === WORKPLACE_INJURY_WORKFLOW_ORDER.length - 1) return null;
  return WORKPLACE_INJURY_WORKFLOW_ORDER[index + 1];
}

export async function reportWorkplaceInjury(params: { profileId: string; description: string; occurredAt?: string | null; actorUserId: string }): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workplace_injury_reports")
    .insert({ profile_id: params.profileId, reported_by: params.actorUserId, description: params.description, occurred_at: params.occurredAt ?? new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to report the workplace injury." };

  await logActivity({ actorUserId: params.actorUserId, action: "workplace_injury.reported", entityType: "user", entityId: params.profileId, metadata: { reportId: data.id } });
  return { ok: true, reportId: data.id };
}

export async function advanceWorkplaceInjuryStage(params: { reportId: string; actorUserId: string }): Promise<{ ok: true; newStage: WorkplaceInjuryStage } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to advance a workplace injury report's stage." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("workplace_injury_reports").select("id, profile_id, stage").eq("id", params.reportId).maybeSingle();
  if (!existing) return { ok: false, error: "Report not found." };

  const next = computeNextWorkplaceInjuryStage(existing.stage as WorkplaceInjuryStage);
  if (next === null) return { ok: false, error: "This report is already at its final stage." };

  const { data, error } = await admin.from("workplace_injury_reports").update({ stage: next }).eq("id", params.reportId).eq("stage", existing.stage).select("id").maybeSingle();
  if (error) return { ok: false, error: "Failed to advance the stage." };
  if (!data) return { ok: false, error: "The report's stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "workplace_injury.stage_advanced", entityType: "user", entityId: existing.profile_id, metadata: { reportId: params.reportId, newStage: next } });
  return { ok: true, newStage: next };
}

export async function recordWorkplaceInjuryAbsencePayClassification(params: { reportId: string; classification: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record an absence/pay classification." };
  }
  if (!params.classification.trim()) return { ok: false, error: "A classification is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workplace_injury_reports")
    .update({ absence_pay_classification: params.classification })
    .eq("id", params.reportId)
    .eq("stage", "absence_pay_classification")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the classification." };
  if (!data) return { ok: false, error: "Report not found, or not currently at the absence_pay_classification stage." };

  await logActivity({ actorUserId: params.actorUserId, action: "workplace_injury.absence_pay_classified", entityType: "user", entityId: data.profile_id, metadata: { reportId: params.reportId, classification: params.classification } });
  return { ok: true };
}

export async function resolveWorkplaceInjuryReport(params: { reportId: string; returnToWorkNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageBusinessTravel(params.actorUserId))) {
    return { ok: false, error: "Not authorized to resolve a workplace injury report." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workplace_injury_reports")
    .update({ return_to_work_notes: params.returnToWorkNotes, resolved_at: new Date().toISOString() })
    .eq("id", params.reportId)
    .eq("stage", "return_to_work")
    .is("resolved_at", null)
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to resolve the report." };
  if (!data) return { ok: false, error: "Report not found, not at the final stage, or already resolved." };

  await logActivity({ actorUserId: params.actorUserId, action: "workplace_injury.resolved", entityType: "user", entityId: data.profile_id, metadata: { reportId: params.reportId } });
  return { ok: true };
}
