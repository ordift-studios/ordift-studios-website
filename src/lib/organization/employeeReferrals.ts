import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 15 (2026-09-14) —
// employee referrals, OS-HR-GH-003 3.2. No numeric formula exists in
// this section (reward_amount is a fixed, human-set value per program,
// never computed), so this module carries no pure functions.

async function canManageReferralPrograms(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// "Eligibility conditions and the reward must be established before
// the qualifying referral" (3.2) — this function is the ONLY way a
// referral_programs row can come into existence, and a referral can
// never reference one that doesn't already exist (NOT NULL FK,
// migration 0100), making "before" true by construction rather than by
// convention.
export async function activateReferralProgram(params: {
  requisitionId: string;
  eligibilityConditions: string;
  rewardAmount: number;
  rewardCurrency: string;
  conflictOfInterestExclusions?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; programId: string } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to activate a referral program." };
  }
  if (!params.eligibilityConditions.trim()) return { ok: false, error: "Eligibility conditions are required." };
  if (!(params.rewardAmount > 0)) return { ok: false, error: "The reward amount must be greater than zero." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("referral_programs")
    .insert({
      requisition_id: params.requisitionId,
      eligibility_conditions: params.eligibilityConditions,
      reward_amount: params.rewardAmount,
      reward_currency: params.rewardCurrency,
      conflict_of_interest_exclusions: params.conflictOfInterestExclusions ?? null,
      activated_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This vacancy already has an active referral program." };
    return { ok: false, error: error?.message ?? "Failed to activate the referral program." };
  }
  return { ok: true, programId: data.id };
}

export async function closeReferralProgram(params: { programId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to close a referral program." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("referral_programs")
    .update({ status: "closed", closed_by: params.actorUserId, closed_at: new Date().toISOString() })
    .eq("id", params.programId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to close the referral program." };
  if (!data) return { ok: false, error: "Program not found, or already closed." };
  return { ok: true };
}

export async function listActiveReferralPrograms(): Promise<{ id: string; requisitionId: string; eligibilityConditions: string; rewardAmount: number; rewardCurrency: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("referral_programs").select("id, requisition_id, eligibility_conditions, reward_amount, reward_currency").eq("status", "active");
  if (error) {
    console.error("[organization] failed to load referral_programs", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, requisitionId: r.requisition_id, eligibilityConditions: r.eligibility_conditions, rewardAmount: r.reward_amount, rewardCurrency: r.reward_currency }));
}

// A referral may only be submitted against a currently-active program
// — checked explicitly here (a closed program still exists as a row,
// so the NOT NULL FK alone cannot enforce "currently active").
export async function submitEmployeeReferral(params: {
  referralProgramId: string;
  referredBy: string;
  candidateName: string;
  candidateContact: string;
  actorUserId: string;
}): Promise<{ ok: true; referralId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.referredBy;
  if (!isSelf && !(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit a referral on behalf of another person." };
  }
  if (!params.candidateName.trim()) return { ok: false, error: "The candidate's name is required." };
  if (!params.candidateContact.trim()) return { ok: false, error: "The candidate's contact details are required." };

  const admin = createAdminClient();
  const { data: program } = await admin.from("referral_programs").select("id, status").eq("id", params.referralProgramId).maybeSingle();
  if (!program) return { ok: false, error: "Referral program not found." };
  if (program.status !== "active") return { ok: false, error: "This referral program is no longer active." };

  const { data, error } = await admin
    .from("employee_referrals")
    .insert({ referral_program_id: params.referralProgramId, referred_by: params.referredBy, candidate_name: params.candidateName, candidate_contact: params.candidateContact })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the referral." };

  await logActivity({ actorUserId: params.actorUserId, action: "employee_referral.submitted", entityType: "user", entityId: params.referredBy, metadata: { referralId: data.id, referralProgramId: params.referralProgramId } });
  return { ok: true, referralId: data.id };
}

export async function linkReferralToApplication(params: { referralId: string; recruitmentApplicationId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to link a referral to an application." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("employee_referrals").update({ recruitment_application_id: params.recruitmentApplicationId }).eq("id", params.referralId);
  if (error) return { ok: false, error: "Failed to link the referral." };
  return { ok: true };
}

export type EmployeeReferralOutcome = "candidate_hired" | "not_hired" | "disqualified";

export async function decideReferralOutcome(params: { referralId: string; outcome: EmployeeReferralOutcome; decisionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide a referral outcome." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_referrals")
    .update({ status: params.outcome, decided_by: params.actorUserId, decided_at: new Date().toISOString(), decision_notes: params.decisionNotes ?? null })
    .eq("id", params.referralId)
    .eq("status", "submitted")
    .select("id, referred_by")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the referral outcome." };
  if (!data) return { ok: false, error: "Referral not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "employee_referral.outcome_decided", entityType: "user", entityId: data.referred_by, metadata: { referralId: params.referralId, outcome: params.outcome } });
  return { ok: true };
}

// The real "Conflict-of-interest exclusions may apply" (3.2) gate:
// reward_payable is never set true merely because the candidate was
// hired — this function requires conflictOfInterestChecked=true as an
// explicit caller-supplied confirmation, and only proceeds from
// status='candidate_hired'.
export async function confirmReferralRewardPayable(params: { referralId: string; conflictOfInterestChecked: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to confirm a referral reward as payable." };
  }
  if (!params.conflictOfInterestChecked) {
    return { ok: false, error: "Conflict-of-interest exclusions must be checked before the reward can be confirmed payable." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_referrals")
    .update({ conflict_of_interest_checked: true, reward_payable: true })
    .eq("id", params.referralId)
    .eq("status", "candidate_hired")
    .eq("reward_payable", false)
    .select("id, referred_by")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to confirm the reward as payable." };
  if (!data) return { ok: false, error: "Referral not found, not currently at candidate_hired status, or already confirmed payable." };

  await logActivity({ actorUserId: params.actorUserId, action: "employee_referral.reward_confirmed_payable", entityType: "user", entityId: data.referred_by, metadata: { referralId: params.referralId } });
  return { ok: true };
}

// Never writes to employment_terms_history.basic_salary — OS-HR-GH-003
// 3.2: "Payment is separate from basic salary and subject to
// applicable payroll/tax treatment." This only records that a payment
// was made; the actual disbursement happens through payroll, outside
// this system.
export async function recordReferralRewardPayment(params: { referralId: string; paymentReference: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageReferralPrograms(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a referral reward payment." };
  }
  if (!params.paymentReference.trim()) return { ok: false, error: "A payment reference is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_referrals")
    .update({ reward_paid: true, reward_paid_at: new Date().toISOString(), payment_reference: params.paymentReference })
    .eq("id", params.referralId)
    .eq("reward_payable", true)
    .eq("reward_paid", false)
    .select("id, referred_by")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record the payment." };
  if (!data) return { ok: false, error: "Referral not found, not payable, or already paid." };

  await logActivity({ actorUserId: params.actorUserId, action: "employee_referral.reward_paid", entityType: "user", entityId: data.referred_by, metadata: { referralId: params.referralId } });
  return { ok: true };
}

export async function listEmployeeReferralsForProfile(referredBy: string): Promise<{ id: string; candidateName: string; status: string; rewardPayable: boolean; rewardPaid: boolean }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_referrals")
    .select("id, candidate_name, status, reward_payable, reward_paid")
    .eq("referred_by", referredBy)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load employee_referrals", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, candidateName: r.candidate_name, status: r.status, rewardPayable: r.reward_payable, rewardPaid: r.reward_paid }));
}
