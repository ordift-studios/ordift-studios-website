import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 7 (2026-09-14) —
// separation / offboarding / final settlement, OS-HR-GH-006 sections
// 1-5. Long-service/death-in-service benefits (section 6) already exist
// separately (compensation.ts, migration 0091) and stay separate here
// per 6.1/6.2 — nothing in this file writes to those tables.

export const SEPARATION_ROUTES = [
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
export type SeparationRoute = (typeof SEPARATION_ROUTES)[number];

export const OFFBOARDING_WORKFLOW_ORDER = [
  "offboarding_initiated",
  "handover",
  "departmental_clearance",
  "assets_access_reconciled",
  "final_settlement_review",
  "cleared",
  "employment_closed",
] as const;
export type OffboardingStatus = (typeof OFFBOARDING_WORKFLOW_ORDER)[number];

// Pure — OS-HR-GH-006 4.1's real, exact 7-stage workflow, never
// invented or reordered. Returns null when there is no further stage
// (already at the terminal employment_closed).
export function computeNextOffboardingStatus(current: OffboardingStatus): OffboardingStatus | null {
  const index = OFFBOARDING_WORKFLOW_ORDER.indexOf(current);
  if (index === -1 || index === OFFBOARDING_WORKFLOW_ORDER.length - 1) return null;
  return OFFBOARDING_WORKFLOW_ORDER[index + 1];
}

export type ConfirmationStatus = "confirmed" | "probationary";

// OS-HR-GH-006 2.1's real approved notice periods, never invented.
// employmentStatus is a required, explicit human input — this function
// never infers confirmed-vs-probationary itself, since no probation-
// tracking infrastructure exists yet in this codebase.
export function computeNoticePeriodDays(employmentStatus: ConfirmationStatus): number {
  return employmentStatus === "confirmed" ? 30 : 14;
}

async function canManageSeparations(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// The unique partial index (separations_one_active_per_profile_idx)
// is the real enforcement of "at most one in-flight separation per
// person" — this function's own pre-check is a fast-path only, not the
// guarantee itself.
export async function initiateSeparation(params: {
  profileId: string;
  separationRoute: SeparationRoute;
  reason: string;
  decisionMakerId?: string | null;
  noticeTreatment?: string | null;
  appealId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; separationId: string } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to initiate a separation." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A documented reason is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("separations")
    .insert({
      profile_id: params.profileId,
      separation_route: params.separationRoute,
      reason: params.reason,
      decision_maker: params.decisionMakerId ?? params.actorUserId,
      notice_treatment: params.noticeTreatment ?? null,
      appeal_id: params.appealId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This person already has an in-flight separation in progress." };
    return { ok: false, error: error?.message ?? "Failed to initiate the separation." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "separation.initiated", entityType: "user", entityId: params.profileId, metadata: { separationId: data.id, separationRoute: params.separationRoute } });
  return { ok: true, separationId: data.id };
}

// Only ever advances by exactly one stage, in the fixed real order.
// Deliberately refuses to produce employment_closed — that transition
// exists only in closeEmployment(), which carries the effective-date
// and final-settlement gate that 1.2 requires.
export async function advanceOffboardingStatus(params: { separationId: string; actorUserId: string }): Promise<{ ok: true; newStatus: OffboardingStatus } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to advance the offboarding workflow." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("separations").select("id, profile_id, offboarding_status").eq("id", params.separationId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation not found." };

  const next = computeNextOffboardingStatus(existing.offboarding_status as OffboardingStatus);
  if (next === null) return { ok: false, error: "This separation is already at its final stage." };
  if (next === "employment_closed") return { ok: false, error: "Use closeEmployment() to close employment — it is never reached via a generic advance." };

  const { data, error } = await admin
    .from("separations")
    .update({ offboarding_status: next })
    .eq("id", params.separationId)
    .eq("offboarding_status", existing.offboarding_status)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to advance the offboarding stage." };
  if (!data) return { ok: false, error: "The offboarding stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation.offboarding_advanced", entityType: "user", entityId: existing.profile_id, metadata: { separationId: params.separationId, newStatus: next } });
  return { ok: true, newStatus: next };
}

// The ONLY function in this file (or anywhere in this phase) that can
// ever set offboarding_status='employment_closed'. Refuses unless the
// separation is at 'cleared', an effective date is available, and a
// linked final_settlements row is already approved/paid — OS-HR-GH-006
// 1.2's completeness requirement enforced as an actual precondition,
// not documentation.
export async function closeEmployment(params: { separationId: string; effectiveDate?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to close employment." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("separations").select("id, profile_id, offboarding_status, effective_date").eq("id", params.separationId).maybeSingle();
  if (!existing) return { ok: false, error: "Separation not found." };
  if (existing.offboarding_status !== "cleared") return { ok: false, error: "Employment can only be closed from the 'cleared' stage." };

  const effectiveDate = params.effectiveDate ?? existing.effective_date;
  if (!effectiveDate) return { ok: false, error: "An effective date is required before employment can be closed." };

  const { data: settlement } = await admin.from("final_settlements").select("id, status").eq("separation_id", params.separationId).maybeSingle();
  if (!settlement || !["approved", "paid"].includes(settlement.status)) {
    return { ok: false, error: "Employment cannot be closed until the final settlement is approved." };
  }

  const { data, error } = await admin
    .from("separations")
    .update({ offboarding_status: "employment_closed", effective_date: effectiveDate })
    .eq("id", params.separationId)
    .eq("offboarding_status", "cleared")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to close employment." };
  if (!data) return { ok: false, error: "The offboarding stage changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "separation.employment_closed", entityType: "user", entityId: existing.profile_id, metadata: { separationId: params.separationId, effectiveDate } });
  return { ok: true };
}

export async function listSeparationsForProfile(profileId: string): Promise<
  { id: string; separationRoute: string; offboardingStatus: string; effectiveDate: string | null; createdAt: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("separations")
    .select("id, separation_route, offboarding_status, effective_date, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load separations", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, separationRoute: r.separation_route, offboardingStatus: r.offboarding_status, effectiveDate: r.effective_date, createdAt: r.created_at }));
}

export async function recordHandoverItem(params: { separationId: string; profileId: string; category: string; description: string; actorUserId: string }): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a handover item." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("offboarding_handover_items")
    .insert({ separation_id: params.separationId, profile_id: params.profileId, category: params.category, description: params.description, recorded_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the handover item." };
  return { ok: true, itemId: data.id };
}

export async function markHandoverItemHandedOver(params: { itemId: string; handedOverTo: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update a handover item." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("offboarding_handover_items")
    .update({ status: "handed_over", handed_over_to: params.handedOverTo, handed_over_at: new Date().toISOString() })
    .eq("id", params.itemId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to update the handover item." };
  if (!data) return { ok: false, error: "Item not found, or not pending." };
  return { ok: true };
}

export async function listHandoverItemsForSeparation(separationId: string): Promise<{ id: string; category: string; description: string; status: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("offboarding_handover_items").select("id, category, description, status").eq("separation_id", separationId).order("created_at", { ascending: true });
  if (error) {
    console.error("[organization] failed to load offboarding_handover_items", error.message);
    return [];
  }
  return data ?? [];
}

// Draft only — every component defaults to 0 and is refined via
// updateFinalSettlementComponents()/addFinalSettlementDeduction()
// before submission. gross/net are database GENERATED columns; this
// function never computes or writes them itself.
export async function createFinalSettlement(params: { separationId: string; profileId: string; actorUserId: string }): Promise<{ ok: true; finalSettlementId: string } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to create a final settlement." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("final_settlements").insert({ separation_id: params.separationId, profile_id: params.profileId }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "A final settlement already exists for this separation." };
    return { ok: false, error: error?.message ?? "Failed to create the final settlement." };
  }
  return { ok: true, finalSettlementId: data.id };
}

export interface FinalSettlementComponents {
  salaryThroughFinalWorkingDay?: number;
  outstandingEarningsOvertime?: number;
  annualLeaveSettlement?: number;
  approvedReimbursements?: number;
  noticePilonAmount?: number;
  otherLawfulEntitlements?: number;
}

// Only permitted while the settlement is still 'draft' — matches the
// same immutability-after-draft guarantee increment_final_settlement_deductions_total()
// enforces for deductions_total.
export async function updateFinalSettlementComponents(params: { finalSettlementId: string; components: FinalSettlementComponents; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update a final settlement." };
  }

  const update: Record<string, number> = {};
  if (params.components.salaryThroughFinalWorkingDay !== undefined) update.salary_through_final_working_day = params.components.salaryThroughFinalWorkingDay;
  if (params.components.outstandingEarningsOvertime !== undefined) update.outstanding_earnings_overtime = params.components.outstandingEarningsOvertime;
  if (params.components.annualLeaveSettlement !== undefined) update.annual_leave_settlement = params.components.annualLeaveSettlement;
  if (params.components.approvedReimbursements !== undefined) update.approved_reimbursements = params.components.approvedReimbursements;
  if (params.components.noticePilonAmount !== undefined) update.notice_pilon_amount = params.components.noticePilonAmount;
  if (params.components.otherLawfulEntitlements !== undefined) update.other_lawful_entitlements = params.components.otherLawfulEntitlements;
  if (Object.keys(update).length === 0) return { ok: true };

  const admin = createAdminClient();
  const { data, error } = await admin.from("final_settlements").update(update).eq("id", params.finalSettlementId).eq("status", "draft").select("id").maybeSingle();
  if (error) return { ok: false, error: "Failed to update the final settlement." };
  if (!data) return { ok: false, error: "Settlement not found, or no longer in draft status." };
  return { ok: true };
}

// The deduction row is only ever inserted after confirming the
// settlement is still 'draft' — avoids recording an audit row for a
// deduction that will never be reflected in deductions_total. The RPC
// carries its own atomic 'draft' guard as the actual immutability
// enforcement (see migration 0092); a 0-row result here means the
// status changed concurrently between the check and the increment, an
// accepted narrow race matching this codebase's established
// read-then-guarded-write pattern elsewhere in this phase.
export async function addFinalSettlementDeduction(params: {
  finalSettlementId: string;
  profileId: string;
  classification: string;
  basis: string;
  amount: number;
  supportingRecordReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; deductionId: string } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to add a final-settlement deduction." };
  }
  if (!params.classification.trim()) return { ok: false, error: "A classification is required." };
  if (!params.basis.trim()) return { ok: false, error: "A lawful basis is required." };
  if (!(params.amount > 0)) return { ok: false, error: "The deduction amount must be greater than zero." };

  const admin = createAdminClient();
  const { data: settlement } = await admin.from("final_settlements").select("id, status").eq("id", params.finalSettlementId).maybeSingle();
  if (!settlement) return { ok: false, error: "Final settlement not found." };
  if (settlement.status !== "draft") return { ok: false, error: "Deductions can only be added while the settlement is in draft status." };

  const { data: deduction, error: insertError } = await admin
    .from("final_settlement_deductions")
    .insert({
      final_settlement_id: params.finalSettlementId,
      profile_id: params.profileId,
      classification: params.classification,
      basis: params.basis,
      amount: params.amount,
      supporting_record_reference: params.supportingRecordReference ?? null,
      approved_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (insertError || !deduction) return { ok: false, error: insertError?.message ?? "Failed to record the deduction." };

  const { data: incrementedRows, error: incrementError } = await admin.rpc("increment_final_settlement_deductions_total", {
    p_final_settlement_id: params.finalSettlementId,
    p_amount: params.amount,
  });
  if (incrementError || incrementedRows !== 1) {
    return { ok: false, error: "The deduction was recorded but the settlement total could not be updated (it may have left draft status) — reconciliation is required." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "final_settlement_deduction.recorded", entityType: "final_settlement", entityId: params.finalSettlementId, metadata: { deductionId: deduction.id, classification: params.classification } });
  return { ok: true, deductionId: deduction.id };
}

export type FinalSettlementDecision = "submitted" | "approved" | "paid";

export async function advanceFinalSettlementStatus(params: { finalSettlementId: string; toStatus: FinalSettlementDecision; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparations(params.actorUserId))) {
    return { ok: false, error: "Not authorized to advance a final settlement's status." };
  }

  const fromStatus = params.toStatus === "submitted" ? "draft" : params.toStatus === "approved" ? "pending_approval" : "approved";
  const dbStatus = params.toStatus === "submitted" ? "pending_approval" : params.toStatus;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("final_settlements")
    .update({ status: dbStatus, ...(params.toStatus === "approved" ? { approved_by: params.actorUserId, approved_at: new Date().toISOString() } : {}) })
    .eq("id", params.finalSettlementId)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to advance the final settlement's status." };
  if (!data) return { ok: false, error: `Settlement not found, or not currently in status "${fromStatus}".` };

  await logActivity({ actorUserId: params.actorUserId, action: "final_settlement.status_advanced", entityType: "final_settlement", entityId: params.finalSettlementId, metadata: { toStatus: dbStatus } });
  return { ok: true };
}

export async function getFinalSettlementForSeparation(separationId: string): Promise<
  { id: string; status: string; grossEntitlements: number; deductionsTotal: number; netFinalSettlement: number } | null
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("final_settlements")
    .select("id, status, gross_entitlements, deductions_total, net_final_settlement")
    .eq("separation_id", separationId)
    .maybeSingle();
  if (error) {
    console.error("[organization] failed to load final_settlements", error.message);
    return null;
  }
  if (!data) return null;
  return { id: data.id, status: data.status, grossEntitlements: data.gross_entitlements, deductionsTotal: data.deductions_total, netFinalSettlement: data.net_final_settlement };
}
