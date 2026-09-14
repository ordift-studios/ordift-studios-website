import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import type { RoleSlug } from "@/lib/portal/roles";
import { getUnsatisfiedRequiredSeparationRequirements } from "@/lib/organization/separationRequirements";

// Workforce lifecycle — separation/offboarding/clearance cases
// (Sequence 1, E.5 Stage 2J). Deliberately thin, mirroring the exact
// shape of src/lib/organization/onboarding.ts: this module resolves
// and tracks a separation CASE's own state; it never itself touches
// Position/Grade/system roles/Authority Grants/Corporate Identity/
// Google Workspace/payment — those remain independently controlled
// (Part 12). finalizeSeparationClearance() only RECORDS that clearance
// was reached; it performs no privileged subsystem action itself
// (Part 11).

export const SEPARATION_CATEGORIES = ["employee_initiated", "company_initiated", "exceptional"] as const;
export type SeparationCategory = (typeof SEPARATION_CATEGORIES)[number];

// Specific reasons per category — application-validated text, matching
// this codebase's established convention (staff_onboarding.stage) of
// not encoding this as a DB enum. No jurisdiction-specific legal
// conclusion is implied by any of these labels (Part 3).
//
// probationary_separation/performance_capability_termination/
// misconduct_dismissal/redundancy_role_elimination were added
// (Phase B5 Step 1, schema reconciliation) so this general-purpose
// taxonomy can also carry OS-HR-GH-006 1.1's exact real named routes
// for a Ghana staff case, via the separate, more specific
// separationRoute field below — reasonType stays the general-purpose
// classification used across every relationship type this table
// serves (staff, vendor, contractor, instructor, model/talent,
// collaborator); separationRoute is Ghana-employee-specific and
// nullable.
export const SEPARATION_REASON_TYPES: Record<SeparationCategory, readonly string[]> = {
  employee_initiated: ["resignation"],
  company_initiated: [
    "termination",
    "contract_completion_expiry",
    "redundancy",
    "mutual_separation",
    "retirement",
    "other_company_initiated",
    "probationary_separation",
    "performance_capability_termination",
    "misconduct_dismissal",
    "redundancy_role_elimination",
  ],
  exceptional: ["abandonment_no_contact", "death", "incapacity_disability", "emergency_involuntary", "other_exceptional"],
} as const;

// OS-HR-GH-006 1.1's exact real named routes for a Ghana employee case
// — a separate, more specific classification from the general-purpose
// category/reasonType above (added Phase B5 Step 1, schema
// reconciliation, resolving the overlap between this table and the
// since-retired `separations` table). Nullable: not every
// separation_cases row is a Ghana staff case.
export const GHANA_SEPARATION_ROUTES = [
  "resignation",
  "probationary_separation",
  "performance_capability_termination",
  "misconduct_dismissal",
  "redundancy_role_elimination",
  "fixed_term_expiry",
  "retirement",
  "death_in_service",
  "other_lawful_route",
] as const;
export type GhanaSeparationRoute = (typeof GHANA_SEPARATION_ROUTES)[number];

// OS-HR-GH-006 2.2's real named notice treatments — unconstrained text
// (descriptive, not a closed enum in the database), matching this
// module's own established convention for reasonType.
export const NOTICE_TREATMENTS = ["worked_in_full", "shortened_by_mutual_agreement", "payment_in_lieu", "restricted_garden_duties"] as const;
export type NoticeTreatment = (typeof NOTICE_TREATMENTS)[number];

// OS-HR-GH-006 4.1's real, exact 7-stage offboarding workflow.
export const OFFBOARDING_STAGES = [
  "offboarding_initiated",
  "handover",
  "departmental_clearance",
  "assets_access_reconciled",
  "final_settlement_review",
  "cleared",
  "employment_closed",
] as const;
export type OffboardingStage = (typeof OFFBOARDING_STAGES)[number];

// Pure — the real 4.1 sequence, never invented or reordered. Mirrors
// the same pattern already proven by computeNextVehicleIncidentStage()
// (businessTravel.ts).
export function computeNextOffboardingStage(current: OffboardingStage): OffboardingStage | null {
  const index = OFFBOARDING_STAGES.indexOf(current);
  if (index === -1 || index === OFFBOARDING_STAGES.length - 1) return null;
  return OFFBOARDING_STAGES[index + 1];
}

export type ResignationWithdrawalOutcome = "approved" | "declined";

export const SEPARATION_CASE_STATUSES = ["open", "cleared", "cancelled"] as const;
export type SeparationCaseStatus = (typeof SEPARATION_CASE_STATUSES)[number];

export const NOTICE_POLICY_SOURCES = ["contract", "company_policy", "statutory_override", "unresolved"] as const;
export type NoticePolicySource = (typeof NOTICE_POLICY_SOURCES)[number];

// Financial closure boundary (E.5 Stage 2K, Part D, clarified —
// no schema/migration change, this field's meaning was always this
// narrow, but is made explicit here to remove future ambiguity).
// final_settlement_status/final_settlement_reference are a generic
// STATUS/POINTER pair used by every relationship type's clearance —
// but what they point TO is fundamentally different per relationship
// and must stay that way:
//   - Staff/Employee -> a future formal Final Settlement process
//     (salary to final working date, eligible allowances, lawful
//     deductions, leave-related settlement, Ordift Service Gratuity/
//     Long-Service Benefit where applicable) — none of this is
//     calculated or implemented here; this column only marks that a
//     handoff to that future process has occurred.
//   - Vendor/Supplier -> outstanding purchase/order/invoice obligations.
//   - Contractor -> outstanding contractual compensation/obligations.
//   - Instructor -> workshop/facilitator compensation.
//   - Model/Talent -> applicable talent/engagement compensation.
//   - Collaborator/other external contributor -> applicable engagement terms.
// Clearance may check whether financial obligations are resolved
// (existing Payables system, untouched) — it must NEVER calculate or
// imply an employee gratuity/final-settlement amount for a non-staff
// relationship. No formula or calculation exists anywhere in this
// module for any relationship type.
export const FINAL_SETTLEMENT_STATUSES = ["not_started", "handoff_requested", "in_progress", "completed"] as const;
export type FinalSettlementStatus = (typeof FINAL_SETTLEMENT_STATUSES)[number];

export type SeparationCase = {
  id: string;
  profileId: string;
  category: SeparationCategory;
  reasonType: string;
  reasonNotes: string | null;
  initiatedBy: string | null;
  initiatedByRole: "self" | "company";
  submittedAt: string;
  proposedLastWorkingDate: string | null;
  confirmedLastWorkingDate: string | null;
  companyAcknowledgedAt: string | null;
  companyAcknowledgedBy: string | null;
  noticePolicySource: NoticePolicySource | null;
  noticeReference: string | null;
  noticeRequiredDays: number | null;
  noticeResolvedAt: string | null;
  finalSettlementStatus: FinalSettlementStatus;
  finalSettlementReference: string | null;
  status: SeparationCaseStatus;
  finalClearanceAt: string | null;
  finalClearanceBy: string | null;
  createdAt: string;
  separationRoute: GhanaSeparationRoute | null;
  noticeTreatment: NoticeTreatment | null;
  appealId: string | null;
  offboardingStage: OffboardingStage;
  resignationWithdrawalRequestedAt: string | null;
  resignationWithdrawalDecidedAt: string | null;
  resignationWithdrawalDecidedBy: string | null;
  resignationWithdrawalOutcome: ResignationWithdrawalOutcome | null;
};

function mapCase(r: {
  id: string;
  profile_id: string;
  category: string;
  reason_type: string;
  reason_notes: string | null;
  initiated_by: string | null;
  initiated_by_role: string;
  submitted_at: string;
  proposed_last_working_date: string | null;
  confirmed_last_working_date: string | null;
  company_acknowledged_at: string | null;
  company_acknowledged_by: string | null;
  notice_policy_source: string | null;
  notice_reference: string | null;
  notice_required_days: number | null;
  notice_resolved_at: string | null;
  final_settlement_status: string;
  final_settlement_reference: string | null;
  status: string;
  final_clearance_at: string | null;
  final_clearance_by: string | null;
  created_at: string;
  separation_route: string | null;
  notice_treatment: string | null;
  appeal_id: string | null;
  offboarding_stage: string;
  resignation_withdrawal_requested_at: string | null;
  resignation_withdrawal_decided_at: string | null;
  resignation_withdrawal_decided_by: string | null;
  resignation_withdrawal_outcome: string | null;
}): SeparationCase {
  return {
    id: r.id,
    profileId: r.profile_id,
    category: r.category as SeparationCategory,
    reasonType: r.reason_type,
    reasonNotes: r.reason_notes,
    initiatedBy: r.initiated_by,
    initiatedByRole: r.initiated_by_role as "self" | "company",
    submittedAt: r.submitted_at,
    proposedLastWorkingDate: r.proposed_last_working_date,
    confirmedLastWorkingDate: r.confirmed_last_working_date,
    companyAcknowledgedAt: r.company_acknowledged_at,
    companyAcknowledgedBy: r.company_acknowledged_by,
    noticePolicySource: r.notice_policy_source as NoticePolicySource | null,
    noticeReference: r.notice_reference,
    noticeRequiredDays: r.notice_required_days,
    noticeResolvedAt: r.notice_resolved_at,
    finalSettlementStatus: r.final_settlement_status as FinalSettlementStatus,
    finalSettlementReference: r.final_settlement_reference,
    status: r.status as SeparationCaseStatus,
    finalClearanceAt: r.final_clearance_at,
    finalClearanceBy: r.final_clearance_by,
    createdAt: r.created_at,
    separationRoute: r.separation_route as GhanaSeparationRoute | null,
    noticeTreatment: r.notice_treatment as NoticeTreatment | null,
    appealId: r.appeal_id,
    offboardingStage: r.offboarding_stage as OffboardingStage,
    resignationWithdrawalRequestedAt: r.resignation_withdrawal_requested_at,
    resignationWithdrawalDecidedAt: r.resignation_withdrawal_decided_at,
    resignationWithdrawalDecidedBy: r.resignation_withdrawal_decided_by,
    resignationWithdrawalOutcome: r.resignation_withdrawal_outcome as ResignationWithdrawalOutcome | null,
  };
}

const SELECT =
  "id, profile_id, category, reason_type, reason_notes, initiated_by, initiated_by_role, submitted_at, proposed_last_working_date, confirmed_last_working_date, company_acknowledged_at, company_acknowledged_by, notice_policy_source, notice_reference, notice_required_days, notice_resolved_at, final_settlement_status, final_settlement_reference, status, final_clearance_at, final_clearance_by, created_at, separation_route, notice_treatment, appeal_id, offboarding_stage, resignation_withdrawal_requested_at, resignation_withdrawal_decided_at, resignation_withdrawal_decided_by, resignation_withdrawal_outcome";

// Same coarse boundary as onboarding — Super Admin, or a holder of
// operations.administer. No new authority introduced or granted.
export async function canManageSeparationCases(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export function describeSeparationCaseCreateError(code: string | null | undefined): string {
  if (code === "23505") return "This person already has an open separation case.";
  return "Failed to create the separation case.";
}

export async function listSeparationCases(): Promise<SeparationCase[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("separation_cases").select(SELECT).order("submitted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load separation_cases", error.message);
    return [];
  }
  return (data ?? []).map(mapCase);
}

export async function getSeparationCaseById(id: string): Promise<SeparationCase | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("separation_cases").select(SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapCase(data);
}

// Part 5's domain foundation for an eventual employee-initiated entry
// point: initiatedByRole is a real parameter here, but this stage
// exposes only an admin-invoked server action — no employee-facing
// caller exists yet, so every real call in this stage passes 'company'
// honestly rather than a value implying self-service already works.
// Creating a case NEVER itself touches Position/Grade/roles/Authority/
// Corporate Identity/Workspace/payment (Part 5/12) — it only opens a
// case for the subsequent clearance workflow to act on.
export async function createSeparationCase(params: {
  profileId: string;
  category: SeparationCategory;
  reasonType: string;
  reasonNotes?: string | null;
  initiatedByRole?: "self" | "company";
  proposedLastWorkingDate?: string | null;
  separationRoute?: GhanaSeparationRoute | null;
  actorUserId: string;
}): Promise<{ ok: true; separationCaseId: string } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) {
    return { ok: false, error: "Not authorized to open a separation case." };
  }
  if (!(SEPARATION_REASON_TYPES[params.category] as readonly string[]).includes(params.reasonType)) {
    return { ok: false, error: "Invalid reason for this separation category." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("separation_cases")
    .insert({
      profile_id: params.profileId,
      category: params.category,
      reason_type: params.reasonType,
      reason_notes: params.reasonNotes ?? null,
      initiated_by: params.actorUserId,
      initiated_by_role: params.initiatedByRole ?? "company",
      proposed_last_working_date: params.proposedLastWorkingDate ?? null,
      separation_route: params.separationRoute ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to create separation_case", error?.message);
    return { ok: false, error: describeSeparationCaseCreateError(error?.code) };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "separation_case.created",
    entityType: "user",
    entityId: params.profileId,
    metadata: { separationCaseId: data.id, category: params.category, reasonType: params.reasonType },
  });

  return { ok: true, separationCaseId: data.id };
}

export async function acknowledgeSeparationCase(params: { separationCaseId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id, status").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  if (existing.status !== "open") return { ok: false, error: `This case is "${existing.status}", not open.` };

  const { error } = await admin
    .from("separation_cases")
    .update({ company_acknowledged_at: new Date().toISOString(), company_acknowledged_by: params.actorUserId, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .is("company_acknowledged_at", null);
  if (error) return { ok: false, error: "Failed to acknowledge the case." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.acknowledged", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId } });
  return { ok: true };
}

export async function confirmLastWorkingDate(params: { separationCaseId: string; date: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id, status").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  if (existing.status !== "open") return { ok: false, error: `This case is "${existing.status}", not open.` };

  const { error } = await admin
    .from("separation_cases")
    .update({ confirmed_last_working_date: params.date, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId);
  if (error) return { ok: false, error: "Failed to confirm the last working date." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.last_working_date_confirmed", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, confirmedLastWorkingDate: params.date } });
  return { ok: true };
}

// Notice-policy BOUNDARY only (Part 6) — records which source produced
// a notice result and what it was; never computes it. 'unresolved' is
// a legitimate, honest value here, not an error state.
export async function resolveNoticePolicy(params: {
  separationCaseId: string;
  source: NoticePolicySource;
  reference?: string | null;
  requiredDays?: number | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  if (!NOTICE_POLICY_SOURCES.includes(params.source)) return { ok: false, error: "Invalid notice policy source." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };

  const { error } = await admin
    .from("separation_cases")
    .update({
      notice_policy_source: params.source,
      notice_reference: params.reference ?? null,
      notice_required_days: params.requiredDays ?? null,
      notice_resolved_at: new Date().toISOString(),
      notice_resolved_by: params.actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.separationCaseId);
  if (error) return { ok: false, error: "Failed to record the notice policy resolution." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.notice_resolved", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, source: params.source } });
  return { ok: true };
}

export async function updateFinalSettlementStatus(params: {
  separationCaseId: string;
  status: FinalSettlementStatus;
  reference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  if (!FINAL_SETTLEMENT_STATUSES.includes(params.status)) return { ok: false, error: "Invalid final settlement status." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };

  const { error } = await admin
    .from("separation_cases")
    .update({ final_settlement_status: params.status, final_settlement_reference: params.reference ?? null, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId);
  if (error) return { ok: false, error: "Failed to update the final settlement status." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.final_settlement_status_updated", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, status: params.status } });
  return { ok: true };
}

export async function cancelSeparationCase(params: { separationCaseId: string; actorUserId: string; reason?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("separation_cases")
    .update({ status: "cancelled", reason_notes: params.reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .eq("status", "open")
    .select("profile_id");
  if (error) return { ok: false, error: "Failed to cancel the case." };
  if (!updated || updated.length === 0) return { ok: false, error: "This case is not open (already cleared or cancelled)." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.cancelled", entityType: "user", entityId: updated[0].profile_id, metadata: { separationCaseId: params.separationCaseId } });
  return { ok: true };
}

// Final clearance safety (Part 11) — fails closed unless every
// REQUIRED clearance requirement for this case's relationship tier is
// satisfied/waived/not_applicable. Sets status='cleared' and records
// who/when — it does NOT itself revoke roles, Authority Grants,
// Corporate Identity, or Workspace access, execute any payment, or
// delete any historical record. Those remain separate, independently
// authorized actions in their own systems.
export async function finalizeSeparationClearance(params: {
  separationCaseId: string;
  roles: RoleSlug[];
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("separation_cases")
    .select("profile_id, status, final_settlement_status")
    .eq("id", params.separationCaseId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  if (existing.status !== "open") return { ok: false, error: `This case is "${existing.status}", not open.` };

  const unsatisfied = await getUnsatisfiedRequiredSeparationRequirements({
    separationCaseId: params.separationCaseId,
    profileId: existing.profile_id,
    roles: params.roles,
    finalSettlementStatus: existing.final_settlement_status,
  });
  if (unsatisfied.length > 0) {
    return { ok: false, error: `Final clearance cannot be recorded while required item(s) remain outstanding: ${unsatisfied.map((r) => r.label).join(", ")}.` };
  }

  const { data: updated, error } = await admin
    .from("separation_cases")
    .update({ status: "cleared", final_clearance_at: new Date().toISOString(), final_clearance_by: params.actorUserId, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "Failed to record final clearance." };
  if (!updated || updated.length === 0) return { ok: false, error: "This case has already been cleared or cancelled." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.cleared", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId } });
  return { ok: true };
}

// --- Ghana-specific extensions (Phase B5 Step 1, schema reconciliation) ---
// Added directly onto the canonical separation_cases record rather than
// a second table — see migration 0104's inspection summary.

export async function recordNoticeTreatment(params: { separationCaseId: string; treatment: NoticeTreatment; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };

  const { error } = await admin
    .from("separation_cases")
    .update({ notice_treatment: params.treatment, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId);
  if (error) return { ok: false, error: "Failed to record the notice treatment." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.notice_treatment_recorded", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, treatment: params.treatment } });
  return { ok: true };
}

// OS-HR-GH-006 2.4/9.2: "An employee may request withdrawal during
// notice." Self-request has no special authorization requirement;
// requesting on someone else's behalf requires the same tier as every
// other separation-case action.
export async function requestResignationWithdrawal(params: { separationCaseId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id, status, resignation_withdrawal_requested_at").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  const isSelf = params.actorUserId === existing.profile_id;
  if (!isSelf && !(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized to request withdrawal on behalf of another person." };
  if (existing.status !== "open") return { ok: false, error: `This case is "${existing.status}", not open.` };
  if (existing.resignation_withdrawal_requested_at) return { ok: false, error: "A withdrawal request has already been submitted for this case." };

  const { data, error } = await admin
    .from("separation_cases")
    .update({ resignation_withdrawal_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .is("resignation_withdrawal_requested_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to submit the withdrawal request." };
  if (!data) return { ok: false, error: "A withdrawal request has already been submitted for this case." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.withdrawal_requested", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId } });
  return { ok: true };
}

// Approval "cancels offboarding and restores appropriate access" (2.4)
// — restoring access is a separate, independently authorized action in
// the Authority Grants / access-control system (same boundary
// discipline as finalizeSeparationClearance() never itself touching
// those systems); this function only records the management decision.
// Decline leaves the original resignation in effect — no other field
// changes.
export async function decideResignationWithdrawal(params: { separationCaseId: string; outcome: ResignationWithdrawalOutcome; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id, resignation_withdrawal_requested_at, resignation_withdrawal_decided_at").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  if (!existing.resignation_withdrawal_requested_at) return { ok: false, error: "No withdrawal request is pending for this case." };
  if (existing.resignation_withdrawal_decided_at) return { ok: false, error: "This withdrawal request has already been decided." };

  const updates: Record<string, unknown> = {
    resignation_withdrawal_decided_at: new Date().toISOString(),
    resignation_withdrawal_decided_by: params.actorUserId,
    resignation_withdrawal_outcome: params.outcome,
    updated_at: new Date().toISOString(),
  };
  if (params.outcome === "approved") updates.status = "cancelled";

  const { data, error } = await admin
    .from("separation_cases")
    .update(updates)
    .eq("id", params.separationCaseId)
    .is("resignation_withdrawal_decided_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the withdrawal decision." };
  if (!data) return { ok: false, error: "This withdrawal request has already been decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.withdrawal_decided", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, outcome: params.outcome } });
  return { ok: true };
}

// Only ever advances by one stage in the fixed real OS-HR-GH-006 4.1
// order; deliberately refuses to produce employment_closed — that
// transition exists only in closeEmployment() below.
export async function advanceOffboardingStage(params: { separationCaseId: string; actorUserId: string }): Promise<{ ok: true; newStage: OffboardingStage } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("separation_cases").select("profile_id, offboarding_stage").eq("id", params.separationCaseId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };

  const next = computeNextOffboardingStage(existing.offboarding_stage as OffboardingStage);
  if (next === null) return { ok: false, error: "This case is already at its final offboarding stage." };
  if (next === "employment_closed") return { ok: false, error: "Use closeEmployment() to close employment — it is never reached via a generic stage advance." };

  const { data, error } = await admin
    .from("separation_cases")
    .update({ offboarding_stage: next, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .eq("offboarding_stage", existing.offboarding_stage)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to advance the offboarding stage." };
  if (!data) return { ok: false, error: "The offboarding stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.offboarding_stage_advanced", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, newStage: next } });
  return { ok: true, newStage: next };
}

// The ONLY function that can set offboarding_stage='employment_closed'.
// Requires the case's own status to already be 'cleared' (i.e.
// finalizeSeparationClearance() has already fail-closed-verified every
// required separation_requirements item), offboarding_stage to already
// be 'cleared', an effective date, and a linked final_settlements row
// already approved/paid — OS-HR-GH-006 1.2's completeness requirement
// enforced as an actual precondition, not documentation.
export async function closeEmployment(params: { separationCaseId: string; effectiveDate?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationCases(params.actorUserId))) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("separation_cases")
    .select("profile_id, status, offboarding_stage, confirmed_last_working_date")
    .eq("id", params.separationCaseId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Separation case not found." };
  if (existing.status !== "cleared") return { ok: false, error: "Employment can only be closed once the case's own clearance (finalizeSeparationClearance) has been recorded." };
  if (existing.offboarding_stage !== "cleared") return { ok: false, error: "Employment can only be closed from the 'cleared' offboarding stage." };

  const effectiveDate = params.effectiveDate ?? existing.confirmed_last_working_date;
  if (!effectiveDate) return { ok: false, error: "An effective date (or a confirmed last working date) is required before employment can be closed." };

  const { data: settlement } = await admin.from("final_settlements").select("id, status").eq("separation_case_id", params.separationCaseId).maybeSingle();
  if (!settlement || !["approved", "paid"].includes(settlement.status)) {
    return { ok: false, error: "Employment cannot be closed until the final settlement is approved." };
  }

  const { data, error } = await admin
    .from("separation_cases")
    .update({ offboarding_stage: "employment_closed", confirmed_last_working_date: effectiveDate, updated_at: new Date().toISOString() })
    .eq("id", params.separationCaseId)
    .eq("offboarding_stage", "cleared")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to close employment." };
  if (!data) return { ok: false, error: "The offboarding stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation_case.employment_closed", entityType: "user", entityId: existing.profile_id, metadata: { separationCaseId: params.separationCaseId, effectiveDate } });
  return { ok: true };
}
