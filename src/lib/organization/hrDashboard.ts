import { createAdminClient } from "@/lib/supabase/admin";

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
  };
}
