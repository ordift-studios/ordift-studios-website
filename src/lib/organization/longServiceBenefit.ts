import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";

// Long-Service Benefit Engine (backlog Phase 7, 2026-09-16) — an
// ORDIFT CONTROLLED BENEFIT, explicitly NOT statutory gratuity (see
// migration 0130's own comment). The milestone/percentage table itself
// is configurable and versioned (long_service_benefit_policies); this
// module only computes against whatever policy is currently active —
// it never hardcodes 3/5/10 years or 25/50/100% anywhere in code, so a
// future policy change never requires a code change, only a new policy
// row. Calculation never auto-creates a Payable or moves money — that
// remains a distinct, later, explicitly-approved step.

export interface LongServiceMilestone {
  yearsOfService: number;
  percentOfBasicSalary: number;
}

export interface LongServiceBenefitPolicy {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  milestones: LongServiceMilestone[];
  absenceAdjustmentRule: string | null;
}

function mapPolicy(r: {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  status: string;
  milestones: unknown;
  absence_adjustment_rule: string | null;
}): LongServiceBenefitPolicy {
  return {
    id: r.id,
    name: r.name,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    status: r.status,
    milestones: Array.isArray(r.milestones) ? (r.milestones as LongServiceMilestone[]) : [],
    absenceAdjustmentRule: r.absence_adjustment_rule,
  };
}

export async function getActiveLongServiceBenefitPolicy(): Promise<LongServiceBenefitPolicy | null> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("long_service_benefit_policies")
    .select("id, name, effective_from, effective_to, status, milestones, absence_adjustment_rule")
    .eq("status", "active")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapPolicy(data) : null;
}

// Pure — the actual milestone-matching decision, directly testable.
// Full completed years of service only (a person who has not yet
// completed a milestone year is simply not yet eligible for it — never
// pro-rated or guessed). Returns the HIGHEST milestone reached, since
// this is a one-time-per-milestone benefit, not cumulative across every
// prior milestone at once.
export function resolveLongServiceMilestone(
  completedYearsOfService: number,
  milestones: readonly LongServiceMilestone[]
): LongServiceMilestone | null {
  const eligible = milestones.filter((m) => completedYearsOfService >= m.yearsOfService);
  if (eligible.length === 0) return null;
  return eligible.reduce((highest, m) => (m.yearsOfService > highest.yearsOfService ? m : highest));
}

function completedYearsOfService(serviceStartDate: string, asOfDate: string): number {
  const start = new Date(serviceStartDate);
  const asOf = new Date(asOfDate);
  let years = asOf.getUTCFullYear() - start.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(asOf.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  if (asOf < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
}

// DB-wiring: resolves a real profile's genuine service-start date (the
// EARLIEST effective_from across their own employment_terms_history —
// no separate "hire_date" field exists anywhere in this codebase, and
// this is the one genuine, already-recorded signal for it) and their
// most recent recorded basic_salary, against the currently active
// policy. Returns the eligible milestone (if any) WITHOUT writing
// anything — a separate recordLongServiceBenefitCalculation() call is
// the real, auditable write.
export async function calculateLongServiceBenefit(profileId: string): Promise<
  | {
      ok: true;
      eligible: true;
      policyId: string;
      milestone: LongServiceMilestone;
      eligibleBasicSalary: number;
      currency: string;
      calculatedAmount: number;
      serviceStartDate: string;
    }
  | { ok: true; eligible: false; reason: string }
  | { ok: false; error: string }
> {
  const policy = await getActiveLongServiceBenefitPolicy();
  if (!policy) return { ok: false, error: "No active Long-Service Benefit policy is configured." };

  const admin = createAdminClient();
  const { data: history } = await admin
    .from("employment_terms_history")
    .select("effective_from, basic_salary, currency")
    .eq("profile_id", profileId)
    .order("effective_from", { ascending: true });
  if (!history || history.length === 0) return { ok: true, eligible: false, reason: "No employment terms history recorded for this profile." };

  const serviceStartDate = history[0].effective_from;
  const latest = history[history.length - 1];
  if (latest.basic_salary === null) return { ok: true, eligible: false, reason: "No basic salary currently recorded — cannot calculate." };

  const years = completedYearsOfService(serviceStartDate, new Date().toISOString().slice(0, 10));
  const milestone = resolveLongServiceMilestone(years, policy.milestones);
  if (!milestone) return { ok: true, eligible: false, reason: `${years} completed year(s) of service — no milestone reached yet.` };

  const calculatedAmount = Math.round(latest.basic_salary * (milestone.percentOfBasicSalary / 100) * 100) / 100;
  return {
    ok: true,
    eligible: true,
    policyId: policy.id,
    milestone,
    eligibleBasicSalary: latest.basic_salary,
    currency: latest.currency ?? "GHS",
    calculatedAmount,
    serviceStartDate,
  };
}

// The real, auditable write — "calculated" status only (evidence, not
// a payment). unique(profile_id, policy_id, milestone_years) on the
// table itself prevents double-recording the same milestone.
export async function recordLongServiceBenefitCalculation(params: { profileId: string; actorUserId: string }): Promise<{ ok: true; calculationId: string } | { ok: false; error: string }> {
  const result = await calculateLongServiceBenefit(params.profileId);
  if (!result.ok) return result;
  if (!result.eligible) return { ok: false, error: result.reason };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("long_service_benefit_calculations")
    .insert({
      profile_id: params.profileId,
      policy_id: result.policyId,
      milestone_years: result.milestone.yearsOfService,
      percent_of_basic_salary: result.milestone.percentOfBasicSalary,
      eligible_basic_salary: result.eligibleBasicSalary,
      currency: result.currency,
      calculated_amount: result.calculatedAmount,
      service_start_date: result.serviceStartDate,
      calculation_date: new Date().toISOString().slice(0, 10),
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This milestone has already been calculated for this profile." };
    console.error("[organization] failed to record long_service_benefit_calculation", error?.message);
    return { ok: false, error: "Failed to record the calculation." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "long_service_benefit.calculated",
    entityType: "user",
    entityId: params.profileId,
    metadata: { calculationId: data.id, milestoneYears: result.milestone.yearsOfService, calculatedAmount: result.calculatedAmount },
  });

  return { ok: true, calculationId: data.id };
}

// Super-Admin-only approval — a real, deliberate human decision before
// this can ever inform an actual payment. Never auto-approved.
export async function approveLongServiceBenefitCalculation(params: { calculationId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isSuperAdminId(params.actorUserId))) {
    return { ok: false, error: "Not authorized to approve a Long-Service Benefit calculation." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("long_service_benefit_calculations")
    .update({ status: "approved", approved_by: params.actorUserId, approved_at: new Date().toISOString() })
    .eq("id", params.calculationId)
    .eq("status", "calculated");
  if (error) {
    console.error("[organization] failed to approve long_service_benefit_calculation", error.message);
    return { ok: false, error: "Failed to approve the calculation." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "long_service_benefit.approved", entityType: "long_service_benefit_calculation", entityId: params.calculationId });
  return { ok: true };
}
