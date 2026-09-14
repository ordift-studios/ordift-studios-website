import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 6 (2026-09-14) —
// compensation/payroll infrastructure beyond basic salary structure
// (which already exists — employmentTermsHistory.ts), OS-HR-GH-003
// sections 2-4.

// --- pure functions --------------------------------------------------

// OS-HR-GH-003 2.2's real approved 50% internal cap, never invented.
export function computeSalaryAdvanceCap(basicSalaryReference: number): number {
  return basicSalaryReference * 0.5;
}

export type SalaryAdvanceApprovalRequirement = { requiresSuperAdminOnly: true } | { requiresCapability: "operations.administer" };

// 2.2: "Higher exceptional advances require Founder/Senior approval."
// Mirrors the same isSuperAdminId()-only routing already established
// for the upper partnership-concession bands
// (src/lib/partnerships/valueEconomics.ts resolveConcessionApprovalRequirement())
// — no capability-based escape valve for an exceeds-cap advance.
export function resolveSalaryAdvanceApprovalRequirement(exceedsCap: boolean): SalaryAdvanceApprovalRequirement {
  return exceedsCap ? { requiresSuperAdminOnly: true } : { requiresCapability: "operations.administer" };
}

export interface PayrollReconciliation {
  cutoffDate: string; // YYYY-MM-DD, the 15th of the transaction's month
  reconciledCycle: string; // "YYYY-MM"
}

// OS-HR-GH-003 2.4's real approved rule: cut-off is the 15th of each
// month. On-or-before -> that calendar month's cycle; after -> the next
// month's. Explicitly an internal processing rule, never presented as a
// statutory Ghana deadline.
export function computePayrollReconciliation(transactionDate: string): PayrollReconciliation {
  const [year, month, day] = transactionDate.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year, month - 1, 15));
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const cycleDate = day <= 15 ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, month, 1));
  const reconciledCycle = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return { cutoffDate, reconciledCycle };
}

export const LONG_SERVICE_MILESTONE_PERCENTAGES = { 3: 25, 5: 50, 10: 100 } as const;
export type LongServiceMilestoneYears = keyof typeof LONG_SERVICE_MILESTONE_PERCENTAGES;

// OS-HR-GH-003 3.3's real approved milestone pairs, never invented:
// 3 years-25%, 5 years-50%, 10 years-100% of one month's basic salary.
export function computeLongServiceBenefitAmount(basicSalaryReference: number, milestoneYears: LongServiceMilestoneYears): number {
  return (basicSalaryReference * LONG_SERVICE_MILESTONE_PERCENTAGES[milestoneYears]) / 100;
}

// OS-HR-GH-003 3.4's real approved formula: exactly one month's basic
// salary, never invented or scaled.
export function computeDeathInServiceBenefitAmount(basicSalaryReference: number): number {
  return basicSalaryReference;
}

// --- DB-dependent functions -------------------------------------------

async function canManageCompensation(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

async function getBasicSalaryReference(profileId: string): Promise<number | null> {
  const terms = await getCurrentEmploymentTerms(profileId);
  return terms?.basicSalary ?? null;
}

export async function requestSalaryAdvance(params: { profileId: string; requestedAmount: number; actorUserId: string }): Promise<{ ok: true; advanceId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageCompensation(params.actorUserId))) {
    return { ok: false, error: "Not authorized to request a salary advance on behalf of another person." };
  }
  if (!(params.requestedAmount > 0)) return { ok: false, error: "The requested amount must be greater than zero." };

  const basicSalaryReference = await getBasicSalaryReference(params.profileId);
  if (basicSalaryReference === null) {
    return { ok: false, error: "No current basic salary is on record for this person — cannot compute the advance cap." };
  }

  const capAmount = computeSalaryAdvanceCap(basicSalaryReference);
  const exceedsCap = params.requestedAmount > capAmount;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salary_advances")
    .insert({
      profile_id: params.profileId,
      requested_by: params.actorUserId,
      requested_amount: params.requestedAmount,
      basic_salary_reference: basicSalaryReference,
      cap_amount: capAmount,
      exceeds_cap: exceedsCap,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to request the salary advance." };

  await logActivity({ actorUserId: params.actorUserId, action: "salary_advance.requested", entityType: "user", entityId: params.profileId, metadata: { advanceId: data.id, exceedsCap } });
  return { ok: true, advanceId: data.id };
}

export type SalaryAdvanceDecision = "approved" | "declined";

// The approval-tier check is re-derived from the row's own stored
// exceeds_cap (never re-trusting a caller-supplied flag) — an
// exceeds-cap advance can only ever be decided by a real Super Admin.
export async function decideSalaryAdvance(params: { advanceId: string; decision: SalaryAdvanceDecision; decisionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("salary_advances").select("id, profile_id, exceeds_cap, status").eq("id", params.advanceId).maybeSingle();
  if (!existing) return { ok: false, error: "Salary advance request not found." };
  if (existing.status !== "requested") return { ok: false, error: `Cannot decide a request already in status "${existing.status}".` };

  const requirement = resolveSalaryAdvanceApprovalRequirement(existing.exceeds_cap);
  const authorized = "requiresSuperAdminOnly" in requirement ? await isSuperAdminId(params.actorUserId) : await canManageCompensation(params.actorUserId);
  if (!authorized) {
    return { ok: false, error: existing.exceeds_cap ? "This advance exceeds the internal cap and requires Founder/Super Admin approval." : "Not authorized to decide a salary advance request." };
  }

  const { error } = await admin
    .from("salary_advances")
    .update({ status: params.decision, decided_by: params.actorUserId, decided_at: new Date().toISOString(), decision_notes: params.decisionNotes ?? null })
    .eq("id", params.advanceId)
    .eq("status", "requested");
  if (error) return { ok: false, error: "Failed to decide the salary advance request." };

  await logActivity({ actorUserId: params.actorUserId, action: "salary_advance.decided", entityType: "user", entityId: existing.profile_id, metadata: { advanceId: params.advanceId, decision: params.decision } });
  return { ok: true };
}

// 2.2: "A written repayment arrangement must be agreed before
// disbursement" — enforced here as a non-empty repaymentTerms
// requirement, the actual gate, not merely documentation.
export async function disburseSalaryAdvance(params: { advanceId: string; repaymentTerms: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageCompensation(params.actorUserId))) {
    return { ok: false, error: "Not authorized to disburse a salary advance." };
  }
  if (!params.repaymentTerms.trim()) return { ok: false, error: "A written repayment arrangement must be recorded before disbursement." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salary_advances")
    .update({ status: "disbursed", repayment_terms: params.repaymentTerms, disbursed_by: params.actorUserId, disbursed_at: new Date().toISOString() })
    .eq("id", params.advanceId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to disburse the salary advance." };
  if (!data) return { ok: false, error: "Request not found, or not in approved status." };

  await logActivity({ actorUserId: params.actorUserId, action: "salary_advance.disbursed", entityType: "salary_advance", entityId: params.advanceId });
  return { ok: true };
}

export async function listSalaryAdvancesForProfile(profileId: string): Promise<
  { id: string; requestedAmount: number; capAmount: number; exceedsCap: boolean; status: string; createdAt: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salary_advances")
    .select("id, requested_amount, cap_amount, exceeds_cap, status, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load salary_advances", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, requestedAmount: r.requested_amount, capAmount: r.cap_amount, exceedsCap: r.exceeds_cap, status: r.status, createdAt: r.created_at }));
}

export type StaffBenefitTransactionType = "purchase" | "refund";

export async function recordStaffBenefitTransaction(params: {
  profileId: string;
  transactionType: StaffBenefitTransactionType;
  benefitDescription: string;
  amount: number;
  payrollRecovery?: boolean;
  relatedTransactionId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  if (!(await canManageCompensation(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a staff-benefit transaction." };
  }
  if (!params.benefitDescription.trim()) return { ok: false, error: "A benefit description is required." };
  if (!(params.amount > 0)) return { ok: false, error: "The amount must be greater than zero." };
  if (params.transactionType === "refund" && !params.relatedTransactionId) {
    return { ok: false, error: "A refund must reference the original purchase transaction." };
  }

  const transactionDate = new Date().toISOString().slice(0, 10);
  const { cutoffDate, reconciledCycle } = computePayrollReconciliation(transactionDate);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_benefit_transactions")
    .insert({
      profile_id: params.profileId,
      transaction_type: params.transactionType,
      benefit_description: params.benefitDescription,
      amount: params.amount,
      transaction_date: transactionDate,
      payroll_recovery: params.payrollRecovery ?? false,
      related_transaction_id: params.relatedTransactionId ?? null,
      payroll_cutoff_date: cutoffDate,
      reconciled_payroll_cycle: reconciledCycle,
      recorded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the transaction." };

  await logActivity({ actorUserId: params.actorUserId, action: "staff_benefit_transaction.recorded", entityType: "user", entityId: params.profileId, metadata: { transactionId: data.id, transactionType: params.transactionType } });
  return { ok: true, transactionId: data.id };
}

export async function listStaffBenefitTransactionsForProfile(profileId: string): Promise<
  { id: string; transactionType: string; benefitDescription: string; amount: number; transactionDate: string; reconciledPayrollCycle: string | null }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_benefit_transactions")
    .select("id, transaction_type, benefit_description, amount, transaction_date, reconciled_payroll_cycle")
    .eq("profile_id", profileId)
    .order("transaction_date", { ascending: false });
  if (error) {
    console.error("[organization] failed to load staff_benefit_transactions", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    transactionType: r.transaction_type,
    benefitDescription: r.benefit_description,
    amount: r.amount,
    transactionDate: r.transaction_date,
    reconciledPayrollCycle: r.reconciled_payroll_cycle,
  }));
}

// eligibleServiceStartDate is a required, explicit human input — see
// migration 0090's comment: the eligible-service-day methodology is not
// yet configured/approved, so this function never derives it itself.
export async function awardLongServiceBenefit(params: { profileId: string; milestoneYears: LongServiceMilestoneYears; eligibleServiceStartDate: string; notes?: string | null; actorUserId: string }): Promise<{ ok: true; awardId: string } | { ok: false; error: string }> {
  if (!(await canManageCompensation(params.actorUserId))) {
    return { ok: false, error: "Not authorized to award a long-service benefit." };
  }

  const basicSalaryReference = await getBasicSalaryReference(params.profileId);
  if (basicSalaryReference === null) {
    return { ok: false, error: "No current basic salary is on record for this person — cannot compute the award amount." };
  }

  const percentage = LONG_SERVICE_MILESTONE_PERCENTAGES[params.milestoneYears];
  const awardAmount = computeLongServiceBenefitAmount(basicSalaryReference, params.milestoneYears);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("long_service_benefit_awards")
    .insert({
      profile_id: params.profileId,
      milestone_years: params.milestoneYears,
      percentage,
      basic_salary_reference: basicSalaryReference,
      award_amount: awardAmount,
      eligible_service_start_date: params.eligibleServiceStartDate,
      awarded_by: params.actorUserId,
      notes: params.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the long-service benefit award." };

  await logActivity({ actorUserId: params.actorUserId, action: "long_service_benefit_award.recorded", entityType: "user", entityId: params.profileId, metadata: { awardId: data.id, milestoneYears: params.milestoneYears } });
  return { ok: true, awardId: data.id };
}

export async function listLongServiceBenefitAwardsForProfile(profileId: string): Promise<
  { id: string; milestoneYears: number; percentage: number; awardAmount: number; awardedAt: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("long_service_benefit_awards")
    .select("id, milestone_years, percentage, award_amount, awarded_at")
    .eq("profile_id", profileId)
    .order("awarded_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load long_service_benefit_awards", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, milestoneYears: r.milestone_years, percentage: r.percentage, awardAmount: r.award_amount, awardedAt: r.awarded_at }));
}

// Recording an award here does not itself constitute beneficiary/estate
// verification (OS-HR-GH-003 3.4) — beneficiaryVerified/verificationNotes
// record the outcome of a verification performed elsewhere.
export async function awardDeathInServiceBenefit(params: { profileId: string; beneficiaryVerified: boolean; beneficiaryDetails?: string | null; verificationNotes?: string | null; actorUserId: string }): Promise<{ ok: true; awardId: string } | { ok: false; error: string }> {
  // OS-HR-GH-003 3.4 states no special approval tier for this benefit
  // (unlike 2.2's explicit Founder/Senior escalation) — reusing the
  // same Super-Admin/operations.administer tier as every other
  // compensation action here, never an invented stricter gate.
  if (!(await canManageCompensation(params.actorUserId))) {
    return { ok: false, error: "Not authorized to award a death-in-service benefit." };
  }

  const basicSalaryReference = await getBasicSalaryReference(params.profileId);
  if (basicSalaryReference === null) {
    return { ok: false, error: "No current basic salary is on record for this person — cannot compute the award amount." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("death_in_service_benefit_awards")
    .insert({
      profile_id: params.profileId,
      basic_salary_reference: basicSalaryReference,
      award_amount: computeDeathInServiceBenefitAmount(basicSalaryReference),
      beneficiary_verified: params.beneficiaryVerified,
      beneficiary_details: params.beneficiaryDetails ?? null,
      verification_notes: params.verificationNotes ?? null,
      awarded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the death-in-service benefit award." };

  await logActivity({ actorUserId: params.actorUserId, action: "death_in_service_benefit_award.recorded", entityType: "user", entityId: params.profileId, metadata: { awardId: data.id } });
  return { ok: true, awardId: data.id };
}
