import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 1 (2026-09-14) —
// final settlement, OS-HR-GH-006 section 5. Extracted from the
// now-retired offboarding.ts as part of the schema reconciliation
// (migration 0104): final_settlements/final_settlement_deductions now
// reference separation_cases (the canonical, UI-connected separation
// record, migration 0079) via separation_case_id rather than the
// retired `separations` table. This module owns only the settlement
// itself; the separation lifecycle (route, notice, offboarding stage,
// closing employment) lives in separationCases.ts.

async function canManageFinalSettlements(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// Draft only — every component defaults to 0 and is refined via
// updateFinalSettlementComponents()/addFinalSettlementDeduction()
// before submission. gross/net are database GENERATED columns; this
// function never computes or writes them itself.
export async function createFinalSettlement(params: { separationCaseId: string; profileId: string; actorUserId: string }): Promise<{ ok: true; finalSettlementId: string } | { ok: false; error: string }> {
  if (!(await canManageFinalSettlements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to create a final settlement." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("final_settlements").insert({ separation_case_id: params.separationCaseId, profile_id: params.profileId }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "A final settlement already exists for this separation case." };
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
  if (!(await canManageFinalSettlements(params.actorUserId))) {
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
// enforcement; a 0-row result here means the status changed
// concurrently between the check and the increment, an accepted narrow
// race matching this codebase's established read-then-guarded-write
// pattern elsewhere in this phase.
export async function addFinalSettlementDeduction(params: {
  finalSettlementId: string;
  profileId: string;
  classification: string;
  basis: string;
  amount: number;
  supportingRecordReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; deductionId: string } | { ok: false; error: string }> {
  if (!(await canManageFinalSettlements(params.actorUserId))) {
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
  if (!(await canManageFinalSettlements(params.actorUserId))) {
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

export async function getFinalSettlementForSeparationCase(separationCaseId: string): Promise<
  {
    id: string;
    status: string;
    salaryThroughFinalWorkingDay: number;
    outstandingEarningsOvertime: number;
    annualLeaveSettlement: number;
    approvedReimbursements: number;
    noticePilonAmount: number;
    otherLawfulEntitlements: number;
    deductionsTotal: number;
    grossEntitlements: number;
    netFinalSettlement: number;
  } | null
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("final_settlements")
    .select(
      "id, status, salary_through_final_working_day, outstanding_earnings_overtime, annual_leave_settlement, approved_reimbursements, notice_pilon_amount, other_lawful_entitlements, deductions_total, gross_entitlements, net_final_settlement"
    )
    .eq("separation_case_id", separationCaseId)
    .maybeSingle();
  if (error) {
    console.error("[organization] failed to load final_settlements", error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    salaryThroughFinalWorkingDay: data.salary_through_final_working_day,
    outstandingEarningsOvertime: data.outstanding_earnings_overtime,
    annualLeaveSettlement: data.annual_leave_settlement,
    approvedReimbursements: data.approved_reimbursements,
    noticePilonAmount: data.notice_pilon_amount,
    otherLawfulEntitlements: data.other_lawful_entitlements,
    deductionsTotal: data.deductions_total,
    grossEntitlements: data.gross_entitlements,
    netFinalSettlement: data.net_final_settlement,
  };
}

export async function listFinalSettlementDeductions(finalSettlementId: string): Promise<
  { id: string; classification: string; basis: string; amount: number; supportingRecordReference: string | null }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("final_settlement_deductions")
    .select("id, classification, basis, amount, supporting_record_reference")
    .eq("final_settlement_id", finalSettlementId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[organization] failed to load final_settlement_deductions", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, classification: r.classification, basis: r.basis, amount: r.amount, supportingRecordReference: r.supporting_record_reference }));
}
