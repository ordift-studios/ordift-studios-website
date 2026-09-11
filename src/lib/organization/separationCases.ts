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
export const SEPARATION_REASON_TYPES: Record<SeparationCategory, readonly string[]> = {
  employee_initiated: ["resignation"],
  company_initiated: ["termination", "contract_completion_expiry", "redundancy", "mutual_separation", "retirement", "other_company_initiated"],
  exceptional: ["abandonment_no_contact", "death", "incapacity_disability", "emergency_involuntary", "other_exceptional"],
} as const;

export const SEPARATION_CASE_STATUSES = ["open", "cleared", "cancelled"] as const;
export type SeparationCaseStatus = (typeof SEPARATION_CASE_STATUSES)[number];

export const NOTICE_POLICY_SOURCES = ["contract", "company_policy", "statutory_override", "unresolved"] as const;
export type NoticePolicySource = (typeof NOTICE_POLICY_SOURCES)[number];

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
  };
}

const SELECT =
  "id, profile_id, category, reason_type, reason_notes, initiated_by, initiated_by_role, submitted_at, proposed_last_working_date, confirmed_last_working_date, company_acknowledged_at, company_acknowledged_by, notice_policy_source, notice_reference, notice_required_days, notice_resolved_at, final_settlement_status, final_settlement_reference, status, final_clearance_at, final_clearance_by, created_at";

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
