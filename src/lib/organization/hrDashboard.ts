import { createAdminClient } from "@/lib/supabase/admin";
import { getStatutoryComplianceForProfile } from "@/lib/organization/statutoryWageEngine";
import { listControlledPolicyDocuments } from "@/lib/organization/policyAcknowledgements";
import { checkEmployeeAgreementReadiness } from "@/lib/legal/employeeAgreements";

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 2 (2026-09-14) —
// Workforce Overview data aggregation. Every count below is a real,
// direct query against Production tables built across this engagement
// — no invented or placeholder figure. A subsystem with zero rows
// (the honest current state of most of them) shows 0, never a sample
// number standing in for real data.

export interface StaffRosterEntry {
  profileId: string;
  fullName: string | null;
}

// The staff roster — role='staff' holders. Deliberately two plain
// queries (find the 'staff' role id, then find its holders) rather
// than a nested-filter embed, for a simpler, more predictable query
// shape than the heavier paginated auth-admin listUsersWithRoles()
// (used by /admin/users for full account management, which needs
// email/last-sign-in as well); this only needs id+name for a
// dashboard/picker.
export async function listActiveStaffRoster(): Promise<StaffRosterEntry[]> {
  const admin = createAdminClient();
  const { data: staffRole } = await admin.from("roles").select("id").eq("slug", "staff").maybeSingle();
  if (!staffRole) return [];

  const { data, error } = await admin.from("user_roles").select("user_id, profiles!user_roles_user_id_fkey(id, full_name)").eq("role_id", staffRole.id);
  if (error) {
    console.error("[organization] failed to load staff roster", error.message);
    return [];
  }
  const roster: StaffRosterEntry[] = [];
  for (const row of (data ?? []) as unknown as { user_id: string; profiles: { id: string; full_name: string | null } | null }[]) {
    if (!row.profiles) continue;
    roster.push({ profileId: row.profiles.id, fullName: row.profiles.full_name });
  }
  return roster.sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
}

export interface WorkforceOverviewCounts {
  activeStaffCount: number;
  onboardingInProgress: number;
  fixedTermApproachingExpiry: number;
  pendingLeaveRequests: number;
  activePips: number;
  openGrievances: number;
  openDisciplinaryInvestigations: number;
  pendingHrApprovals: number;
  actingAssignmentsActive: number;
  outstandingAssets: number;
  activeOffboardingCases: number;
  unresolvedRequirementReviews: number;
  unexplainedAbsences: number;
  openSafeguardingConcerns: number;
  pendingReferenceRequests: number;
  pendingBusinessTravelAuthorizations: number;
  pendingPortfolioUseRequests: number;
  registeredLegalEntities: number;
}

// Every field is a real COUNT query — zero is a normal, honestly
// reported value throughout this dashboard, never suppressed or
// replaced with a placeholder.
export async function getWorkforceOverviewCounts(): Promise<WorkforceOverviewCounts> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const in90Days = new Date();
  in90Days.setUTCDate(in90Days.getUTCDate() + 90);
  const in90DaysStr = in90Days.toISOString().slice(0, 10);

  const { data: staffRole } = await admin.from("roles").select("id").eq("slug", "staff").maybeSingle();

  const [
    activeStaffCount,
    onboardingInProgress,
    fixedTermApproachingExpiry,
    pendingLeaveRequests,
    activePips,
    openGrievances,
    openDisciplinaryInvestigations,
    pendingHrApprovals,
    actingAssignmentsActive,
    outstandingAssets,
    activeOffboardingCases,
    unresolvedRequirementReviews,
    unexplainedAbsences,
    openSafeguardingConcerns,
    pendingReferenceRequests,
    pendingBusinessTravelAuthorizations,
    pendingPortfolioUseRequests,
    registeredLegalEntities,
  ] = await Promise.all([
    staffRole
      ? admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", staffRole.id)
      : Promise.resolve({ count: 0 }),
    admin.from("staff_onboarding").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    admin.from("fixed_term_employment_records").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_date", in90DaysStr).gte("end_date", today),
    admin.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    admin.from("performance_improvement_plans").select("id", { count: "exact", head: true }).in("status", ["active", "extended"]),
    admin.from("grievances").select("id", { count: "exact", head: true }).in("status", ["submitted", "acknowledged", "under_review"]),
    admin.from("investigations").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("development_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    admin.from("acting_assignments").select("id", { count: "exact", head: true }).is("ended_early_at", null).gte("end_date", today),
    admin.from("asset_assignments").select("id", { count: "exact", head: true }).eq("status", "issued"),
    admin.from("separation_cases").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("requirement_evaluations").select("id", { count: "exact", head: true }).eq("classification", "REVIEW_REQUIRED"),
    admin.from("attendance_records").select("id", { count: "exact", head: true }).eq("attendance_status", "absent_unexplained"),
    admin.from("safeguarding_concern_reports").select("id", { count: "exact", head: true }).in("status", ["reported", "escalated"]),
    admin.from("reference_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    admin.from("business_travel_authorizations").select("id", { count: "exact", head: true }).eq("status", "requested"),
    admin.from("portfolio_use_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    admin.from("employing_entities").select("id", { count: "exact", head: true }),
  ]);

  return {
    activeStaffCount: activeStaffCount.count ?? 0,
    onboardingInProgress: onboardingInProgress.count ?? 0,
    fixedTermApproachingExpiry: fixedTermApproachingExpiry.count ?? 0,
    pendingLeaveRequests: pendingLeaveRequests.count ?? 0,
    activePips: activePips.count ?? 0,
    openGrievances: openGrievances.count ?? 0,
    openDisciplinaryInvestigations: openDisciplinaryInvestigations.count ?? 0,
    pendingHrApprovals: pendingHrApprovals.count ?? 0,
    actingAssignmentsActive: actingAssignmentsActive.count ?? 0,
    outstandingAssets: outstandingAssets.count ?? 0,
    activeOffboardingCases: activeOffboardingCases.count ?? 0,
    unresolvedRequirementReviews: unresolvedRequirementReviews.count ?? 0,
    unexplainedAbsences: unexplainedAbsences.count ?? 0,
    openSafeguardingConcerns: openSafeguardingConcerns.count ?? 0,
    pendingReferenceRequests: pendingReferenceRequests.count ?? 0,
    pendingBusinessTravelAuthorizations: pendingBusinessTravelAuthorizations.count ?? 0,
    pendingPortfolioUseRequests: pendingPortfolioUseRequests.count ?? 0,
    registeredLegalEntities: registeredLegalEntities.count ?? 0,
  };
}

// Company-wide statutory-wage compliance — how many people currently
// resolve to BELOW_FLOOR. Loops per-profile (one compliance check per
// person with employment-terms history) rather than a single SQL
// aggregate, since the comparison itself (compareSalaryToStatutoryFloor())
// is deliberately non-trivial application logic, not something safely
// expressible as one query — acceptable given this engagement's real
// current workforce size.
export async function countBelowStatutoryFloor(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("employment_terms_history").select("profile_id");
  if (error) {
    console.error("[organization] failed to load employment_terms_history for compliance count", error.message);
    return 0;
  }
  const profileIds = [...new Set((data ?? []).map((r) => r.profile_id))];
  let belowFloorCount = 0;
  for (const profileId of profileIds) {
    const result = await getStatutoryComplianceForProfile(profileId);
    if (result.state === "BELOW_FLOOR") belowFloorCount++;
  }
  return belowFloorCount;
}

// Approved leave whose window covers today — "currently-away
// employees" (Part 5 §3). Deliberately status='approved' only:
// submitted/under_review requests are not yet decided, so they don't
// mean someone is actually away.
export async function countCurrentlyOnLeave(): Promise<number> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await admin
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .lte("start_date", today)
    .gte("end_date", today);
  if (error) {
    console.error("[organization] failed to count currently-on-leave", error.message);
    return 0;
  }
  return count ?? 0;
}

// Overdue performance reviews (Part 5 §4) — a real next_review_due_at
// already in the past, per the same field recordPerformanceReview()
// itself computes (performanceReviews.ts's computeNextReviewDueDate()).
export async function countOverdueReviews(): Promise<number> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await admin.from("performance_reviews").select("id", { count: "exact", head: true }).lt("next_review_due_at", today);
  if (error) {
    console.error("[organization] failed to count overdue reviews", error.message);
    return 0;
  }
  return count ?? 0;
}

// Salary advance requests still awaiting a decision (Part 5 §7).
export async function countPendingSalaryAdvances(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin.from("salary_advances").select("id", { count: "exact", head: true }).eq("status", "requested");
  if (error) {
    console.error("[organization] failed to count pending salary advances", error.message);
    return 0;
  }
  return count ?? 0;
}

// How many onboarding employees are NOT yet Agreement-Ready (Part 5
// §12) — loops checkEmployeeAgreementReadiness() (the exact same
// resolver each individual Employee Profile page uses) across every
// in-progress onboarding, rather than a separate simplified check that
// could disagree with the real per-employee result.
export async function countAgreementReadinessBlocked(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff_onboarding").select("id").eq("status", "in_progress");
  if (error) {
    console.error("[organization] failed to load staff_onboarding for readiness count", error.message);
    return 0;
  }
  let blockedCount = 0;
  for (const row of data ?? []) {
    const readiness = await checkEmployeeAgreementReadiness(row.id);
    if (!readiness.ok || !readiness.ready) blockedCount++;
  }
  return blockedCount;
}

export interface PolicyAcknowledgementCompletion {
  totalPossible: number;
  totalCompleted: number;
  completionPercent: number;
}

// (staff roster size) x (active controlled documents) = total possible
// acknowledgements; actual completed count comes from the real
// policy_acknowledgements table. A 0/0 case reports 100% (nothing yet
// required), never a division-by-zero artifact.
export async function getPolicyAcknowledgementCompletion(): Promise<PolicyAcknowledgementCompletion> {
  const admin = createAdminClient();
  const [roster, documents, { count: totalCompleted }] = await Promise.all([
    listActiveStaffRoster(),
    listControlledPolicyDocuments(),
    admin.from("policy_acknowledgements").select("id", { count: "exact", head: true }),
  ]);
  const totalPossible = roster.length * documents.length;
  const completed = totalCompleted ?? 0;
  const completionPercent = totalPossible === 0 ? 100 : Math.round((completed / totalPossible) * 100);
  return { totalPossible, totalCompleted: completed, completionPercent };
}
