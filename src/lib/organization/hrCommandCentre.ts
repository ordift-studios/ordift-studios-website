import { listUsersWithRoles, type AdminUserRow } from "@/lib/portal/adminData";
import { listRecruitmentApplications, getHiringBridgeStatus } from "@/lib/recruitment/adminData";
import { getWorkforceOverviewCounts, countCurrentlyOnLeave } from "@/lib/organization/hrDashboard";
import { listPendingLeaveRequestsAcrossStaff, listApprovedLeaveStartingSoonAcrossStaff } from "@/lib/organization/leaveRequests";
import { listAttendanceRecordsForDateAcrossStaff } from "@/lib/organization/attendance";
import { listStaffOnboarding } from "@/lib/organization/onboarding";
import { getRecentActivity } from "@/lib/admin/activityLog";
import { getEarliestEmploymentTerms } from "@/lib/organization/employmentTermsHistory";
import { computeProbationWindow, GHANA_EMPLOYEE_PROBATION_POLICY } from "@/lib/legal/ghanaEmployeeAgreementPolicy";
import { LONG_SERVICE_MILESTONE_PERCENTAGES, listLongServiceBenefitAwardsForProfile, type LongServiceMilestoneYears } from "@/lib/organization/compensation";
import { mapEmploymentJurisdictionToWorkforceJurisdiction } from "@/lib/compliance/workforceMappings";
import { createAdminClient } from "@/lib/supabase/admin";

// HR / People Command Centre (2026-09-16) — layers on top of the
// EXISTING Workforce Overview data engine (hrDashboard.ts) rather than
// re-querying the same facts a second, independently-drifting way:
// onboardingInProgress, pendingLeaveRequests/unexplainedAbsences, and
// on-leave-today all come straight from getWorkforceOverviewCounts()/
// countCurrentlyOnLeave() — the same numbers Workforce Overview itself
// shows. Only genuinely new signals are computed here: External
// Workforce breakdown, the Recruitment/Onboarding pipeline, a People
// Snapshot teaser (reusing listUsersWithRoles(), never a second roster),
// and a filtered slice of the existing global activity feed.

const EMPLOYEE_ROLE_SLUGS = new Set(["staff"]);
const EXTERNAL_WORKFORCE_ROLE_SLUGS = ["vendor", "contractor", "model", "workshop_participant"] as const;

// Action prefixes genuinely relevant to HR/People — a curated view over
// the SAME global activity_log getRecentActivity() already serves
// elsewhere, never a second audit trail.
const HR_ACTIVITY_PREFIXES = [
  "recruitment.",
  "recruitment_application.",
  "recruitment_requisition.",
  "collaborator.",
  "position.",
  "grade.",
  "onboarding.",
  "staff_onboarding.",
  "leave_request.",
  "vendor_profile.",
  "access_status.",
];

export type HrCommandCentreSummary = {
  activeEmployees: number;
  externalWorkforce: number;
  newApplications: number;
  acceptedAwaitingHire: number;
  onboardingInProgress: number;
  onLeaveToday: number;
  attendanceExceptions: number;
  pendingLeaveDecisions: number;
};

export type NeedsAttentionItem = {
  key: string;
  label: string;
  href: string;
};

export type PipelineStage = { key: string; label: string; count: number };

export type RecentHire = {
  id: string;
  fullName: string | null;
  positionName: string | null;
  memberNumber: string | null;
};

export type HrActivityItem = {
  id: string;
  actorLabel: string;
  action: string;
  createdAt: string;
};

// One accepted application's real current hiring-bridge stage
// (getHiringBridgeStatus, adminData.ts) — resolved by the async wrapper
// below, never guessed from application.status alone. This is the
// concrete fix for the reported staleness bug: Kelvin's application
// stayed status='accepted' forever (recruitment status is a one-time
// decision, correctly never rewritten), but the DASHBOARD previously
// inferred "still awaiting Proceed to Hire" from that alone, ignoring
// that the bridge had already run. Every stage produces a DIFFERENT,
// accurate label — never a blanket "Accepted" action once real
// progress exists.
export type AcceptedApplicationBridgeStatus = {
  id: string;
  fullName: string;
  stage: "not_invited" | "invitation_sent" | "account_created" | "onboarding_in_progress" | "onboarding_complete";
  profileId?: string;
  positionAssigned?: boolean;
};

// Pure summarizer — takes already-fetched rows, decides the counts and
// the Needs Your Attention list. Directly testable without a database.
export function summarizeHrCommandCentre(input: {
  users: { roles: string[]; accessStatus: string }[];
  applications: { status: string; id: string; fullName: string }[];
  acceptedApplicationsBridgeStatus: AcceptedApplicationBridgeStatus[];
  onboardingInProgress: number;
  onboardingComplete: number;
  onLeaveToday: number;
  pendingLeaveRequests: { id: string; profileFullName: string | null }[];
  unexplainedAbsencesCount: number;
}): { summary: HrCommandCentreSummary; needsAttention: NeedsAttentionItem[]; pipeline: PipelineStage[]; externalWorkforceByType: Record<string, number> } {
  const activeEmployees = input.users.filter(
    (u) => u.accessStatus === "active" && u.roles.some((r) => EMPLOYEE_ROLE_SLUGS.has(r))
  ).length;
  const externalWorkforceByType: Record<string, number> = {};
  for (const slug of EXTERNAL_WORKFORCE_ROLE_SLUGS) {
    externalWorkforceByType[slug] = input.users.filter((u) => u.accessStatus === "active" && u.roles.includes(slug)).length;
  }
  const externalWorkforce = Object.values(externalWorkforceByType).reduce((sum, n) => sum + n, 0);

  const newApplications = input.applications.filter((a) => a.status === "new").length;
  const reviewingApplications = input.applications.filter((a) => a.status === "reviewing").length;
  const shortlistedOrInterview = input.applications.filter((a) => a.status === "shortlisted" || a.status === "interview").length;
  const acceptedApplications = input.applications.filter((a) => a.status === "accepted");

  const pipeline: PipelineStage[] = [
    { key: "new", label: "New", count: newApplications },
    { key: "review", label: "Review", count: reviewingApplications },
    { key: "shortlisted", label: "Shortlisted / Interview", count: shortlistedOrInterview },
    { key: "accepted", label: "Selected", count: acceptedApplications.length },
    { key: "onboarding", label: "Onboarding", count: input.onboardingInProgress },
    { key: "active", label: "Active", count: activeEmployees },
  ];

  const acceptedApplicationAttentionItems: NeedsAttentionItem[] = [];
  for (const a of input.acceptedApplicationsBridgeStatus) {
    if (a.stage === "not_invited") {
      acceptedApplicationAttentionItems.push({ key: `accepted-${a.id}`, label: `${a.fullName} — Selected, awaiting Proceed to Hire`, href: `/admin/recruitment/${a.id}` });
    } else if (a.stage === "invitation_sent") {
      acceptedApplicationAttentionItems.push({ key: `accepted-${a.id}`, label: `${a.fullName} — Invitation sent, awaiting response`, href: `/admin/recruitment/${a.id}` });
    } else if (a.stage === "account_created" && !a.positionAssigned) {
      acceptedApplicationAttentionItems.push({ key: `accepted-${a.id}`, label: `${a.fullName} — Account created, needs a Position assigned`, href: a.profileId ? `/admin/organization/people/${a.profileId}` : `/admin/recruitment/${a.id}` });
    } else if (a.stage === "account_created" && a.positionAssigned) {
      acceptedApplicationAttentionItems.push({ key: `accepted-${a.id}`, label: `${a.fullName} — Ready to start onboarding`, href: a.profileId ? `/admin/organization/people/${a.profileId}` : `/admin/recruitment/${a.id}` });
    }
    // onboarding_in_progress / onboarding_complete: no individual entry —
    // already covered by the aggregate "N onboarding records in
    // progress" entry below, or genuinely no longer needs attention.
  }

  const needsAttention: NeedsAttentionItem[] = [
    ...acceptedApplicationAttentionItems,
    ...input.pendingLeaveRequests.map((r) => ({
      key: `leave-${r.id}`,
      label: `${r.profileFullName ?? "A staff member"} — leave request awaiting decision`,
      href: `/admin/organization/leave`,
    })),
    ...(input.unexplainedAbsencesCount > 0
      ? [
          {
            key: "attendance-exceptions",
            label: `${input.unexplainedAbsencesCount} unexplained absence${input.unexplainedAbsencesCount === 1 ? "" : "s"} awaiting reconciliation`,
            href: "/admin/organization/attendance",
          },
        ]
      : []),
    ...(input.onboardingInProgress > 0
      ? [
          {
            key: "onboarding-in-progress",
            label: `${input.onboardingInProgress} onboarding record${input.onboardingInProgress === 1 ? "" : "s"} in progress`,
            href: "/admin/organization/workforce",
          },
        ]
      : []),
  ];

  return {
    summary: {
      activeEmployees,
      externalWorkforce,
      newApplications,
      acceptedAwaitingHire: acceptedApplications.length,
      onboardingInProgress: input.onboardingInProgress,
      onLeaveToday: input.onLeaveToday,
      attendanceExceptions: input.unexplainedAbsencesCount,
      pendingLeaveDecisions: input.pendingLeaveRequests.length,
    },
    needsAttention,
    pipeline,
    externalWorkforceByType,
  };
}

// D. Onboarding Progress — a stage-level breakdown, not just the
// single in-progress count the pipeline strip already shows. Pure and
// independently testable: groups already-fetched onboarding rows by
// pipeline + stage, in the catalog's own declared order.
export type OnboardingProgressStage = { pipeline: "employee" | "external_contractor"; stage: string; count: number };

export function summarizeOnboardingProgress(
  onboarding: { pipeline: "employee" | "external_contractor"; stage: string; status: string }[]
): OnboardingProgressStage[] {
  const counts = new Map<string, number>();
  for (const o of onboarding) {
    if (o.status === "completed" || o.status === "cancelled") continue;
    const key = `${o.pipeline}::${o.stage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [pipeline, stage] = key.split("::") as [OnboardingProgressStage["pipeline"], string];
      return { pipeline, stage, count };
    })
    .sort((a, b) => (a.pipeline === b.pipeline ? b.count - a.count : a.pipeline.localeCompare(b.pipeline)));
}

// I. Workforce Analytics — headcount breakdowns over the SAME
// listUsersWithRoles() roster the rest of the Command Centre and the
// People Directory already use, never a second roster query.
export type WorkforceBreakdownRow = { label: string; count: number };

export function summarizeWorkforceAnalytics(
  users: { accessStatus: string; departmentName: string | null; engagementTypeName: string | null }[]
): { byDepartment: WorkforceBreakdownRow[]; byEngagementType: WorkforceBreakdownRow[] } {
  const active = users.filter((u) => u.accessStatus === "active");
  const byDepartmentMap = new Map<string, number>();
  const byEngagementMap = new Map<string, number>();
  for (const u of active) {
    const dept = u.departmentName ?? "Unassigned";
    byDepartmentMap.set(dept, (byDepartmentMap.get(dept) ?? 0) + 1);
    const engagement = u.engagementTypeName ?? "Unclassified";
    byEngagementMap.set(engagement, (byEngagementMap.get(engagement) ?? 0) + 1);
  }
  const toSortedRows = (m: Map<string, number>): WorkforceBreakdownRow[] =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return { byDepartment: toSortedRows(byDepartmentMap), byEngagementType: toSortedRows(byEngagementMap) };
}

// G. Attendance & Leave Snapshot — today's attendance breakdown,
// reusing listAttendanceRecordsForDateAcrossStaff() (the same function
// the Attendance admin page itself uses for a given date) rather than
// a second query style. onLeaveToday is passed in from
// countCurrentlyOnLeave() (already computed above) rather than
// re-derived from attendance_status, since leave and attendance are
// deliberately separate systems in this codebase.
export type AttendanceLeaveSnapshot = {
  presentToday: number;
  lateToday: number;
  unexplainedAbsencesToday: number;
  onLeaveToday: number;
};

export function summarizeAttendanceLeaveSnapshot(
  todayRecords: { attendanceStatus: string; isLate: boolean }[],
  onLeaveToday: number
): AttendanceLeaveSnapshot {
  return {
    presentToday: todayRecords.filter((r) => r.attendanceStatus === "present" || r.attendanceStatus === "remote").length,
    lateToday: todayRecords.filter((r) => r.isLate).length,
    unexplainedAbsencesToday: todayRecords.filter((r) => r.attendanceStatus === "absent_unexplained").length,
    onLeaveToday,
  };
}

// H. Upcoming People Events — genuinely scheduled future facts only
// (approved leave already decided to start soon, onboarding already
// under way with a start date coming up) — never a fabricated
// "birthdays/anniversaries" list the codebase has no data for.
export type UpcomingPeopleEvent = { key: string; label: string; date: string; href: string };

export function summarizeUpcomingPeopleEvents(input: {
  upcomingLeave: { id: string; profileFullName: string | null; startDate: string }[];
  upcomingOnboardingStarts: { id: string; profileId: string; startDate: string; pipeline: "employee" | "external_contractor" }[];
  // Task 14 (2026-09-18) — genuinely computable from the existing
  // probation policy (computeProbationWindow) and long-service engine
  // (LONG_SERVICE_MILESTONE_PERCENTAGES) respectively; never a
  // fabricated event. Both optional — a caller with no genuine data
  // for either simply omits it, same "empty means nothing to show"
  // discipline as the two lists above.
  upcomingProbationEndings?: { profileId: string; profileFullName: string | null; endDate: string }[];
  upcomingLongServiceMilestones?: { profileId: string; profileFullName: string | null; milestoneYears: number; date: string }[];
}): UpcomingPeopleEvent[] {
  const events: UpcomingPeopleEvent[] = [
    ...input.upcomingLeave.map((l) => ({
      key: `leave-${l.id}`,
      label: `${l.profileFullName ?? "A staff member"} — leave begins`,
      date: l.startDate,
      href: "/admin/organization/leave",
    })),
    ...input.upcomingOnboardingStarts.map((o) => ({
      key: `onboarding-${o.id}`,
      label: `${o.pipeline === "employee" ? "Staff" : "External workforce"} onboarding start date`,
      date: o.startDate,
      href: `/admin/organization/onboarding/${o.id}`,
    })),
    ...(input.upcomingProbationEndings ?? []).map((p) => ({
      key: `probation-${p.profileId}`,
      label: `${p.profileFullName ?? "A staff member"} — probation period ends`,
      date: p.endDate,
      href: `/admin/organization/people/${p.profileId}`,
    })),
    ...(input.upcomingLongServiceMilestones ?? []).map((m) => ({
      key: `long-service-${m.profileId}-${m.milestoneYears}`,
      label: `${m.profileFullName ?? "A staff member"} — ${m.milestoneYears}-year long-service milestone`,
      date: m.date,
      href: `/admin/organization/people/${m.profileId}`,
    })),
  ];
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function getHrCommandCentreSummary(): Promise<{
  summary: HrCommandCentreSummary;
  needsAttention: NeedsAttentionItem[];
  pipeline: PipelineStage[];
  externalWorkforceByType: Record<string, number>;
  recentHires: RecentHire[];
  recentActivity: HrActivityItem[];
  onboardingProgress: OnboardingProgressStage[];
  workforceAnalytics: { byDepartment: WorkforceBreakdownRow[]; byEngagementType: WorkforceBreakdownRow[] };
  activeWorkforceRows: { departmentName: string | null; engagementTypeName: string | null }[];
  attendanceLeaveSnapshot: AttendanceLeaveSnapshot;
  upcomingEvents: UpcomingPeopleEvent[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const [usersResult, applications, workforceCounts, onLeaveToday, pendingLeaveRequests, activity, onboarding, todayAttendance, upcomingLeave] =
    await Promise.all([
      listUsersWithRoles(),
      listRecruitmentApplications(),
      getWorkforceOverviewCounts(),
      countCurrentlyOnLeave(),
      listPendingLeaveRequestsAcrossStaff(),
      getRecentActivity(150),
      listStaffOnboarding(),
      listAttendanceRecordsForDateAcrossStaff(today),
      listApprovedLeaveStartingSoonAcrossStaff(14),
    ]);
  const users: AdminUserRow[] = usersResult.ok ? usersResult.users : [];

  // Task 14 (2026-09-18) — Probation milestones: genuinely computable
  // only where a real GH probation policy applies (never a global
  // default — see employeeAgreements.ts's own identical gating), and
  // only for staff whose real employmentStatus is currently
  // 'probation'. Bounded fan-out — typically a handful of people, not
  // the whole roster.
  const withinTwoWeeksDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const probationStaff = users.filter((u) => u.employmentStatus === "probation" && u.roles.includes("staff"));
  const probationResults = await Promise.all(
    probationStaff.map(async (u) => {
      const earliest = await getEarliestEmploymentTerms(u.id);
      if (!earliest?.employmentJurisdictionId) return null;
      const admin = createAdminClient();
      const { data: jurisdictionRow } = await admin.from("employment_jurisdictions").select("name").eq("id", earliest.employmentJurisdictionId).maybeSingle();
      if (mapEmploymentJurisdictionToWorkforceJurisdiction(jurisdictionRow?.name) !== "GH") return null;
      const window = computeProbationWindow(earliest.effectiveFrom, GHANA_EMPLOYEE_PROBATION_POLICY.initialMonths);
      if (window.endDate < today || window.endDate > withinTwoWeeksDate) return null;
      return { profileId: u.id, profileFullName: u.fullName, endDate: window.endDate };
    })
  );
  const upcomingProbationEndings = probationResults.filter((r): r is NonNullable<typeof r> => r !== null);

  // Long-service milestones — genuinely computable from the same
  // engine My Workspace's own Benefits & Employment section already
  // uses (compensation.ts), never a fabricated anniversary. Only
  // flagged when no award for that exact milestone already exists.
  const activeStaff = users.filter((u) => u.roles.includes("staff") && u.accessStatus === "active");
  const longServiceResults = await Promise.all(
    activeStaff.map(async (u) => {
      const earliest = await getEarliestEmploymentTerms(u.id);
      if (!earliest) return [];
      const existingAwards = await listLongServiceBenefitAwardsForProfile(u.id);
      const awardedYears = new Set(existingAwards.map((a) => a.milestoneYears));
      const matches: { profileId: string; profileFullName: string | null; milestoneYears: number; date: string }[] = [];
      for (const yearsStr of Object.keys(LONG_SERVICE_MILESTONE_PERCENTAGES)) {
        const years = Number(yearsStr) as LongServiceMilestoneYears;
        if (awardedYears.has(years)) continue;
        const anniversary = new Date(`${earliest.effectiveFrom}T00:00:00Z`);
        anniversary.setUTCFullYear(anniversary.getUTCFullYear() + years);
        const anniversaryDate = anniversary.toISOString().slice(0, 10);
        if (anniversaryDate >= today && anniversaryDate <= withinTwoWeeksDate) {
          matches.push({ profileId: u.id, profileFullName: u.fullName, milestoneYears: years, date: anniversaryDate });
        }
      }
      return matches;
    })
  );
  const upcomingLongServiceMilestones = longServiceResults.flat();

  // Resolves each accepted application's REAL current stage — small,
  // bounded fan-out (only ever as many rows as genuinely have
  // status='accepted', never every application) via the same
  // getHiringBridgeStatus() the Recruitment detail page itself uses,
  // so the dashboard and that page can never disagree.
  const acceptedApplications = applications.filter((a) => a.status === "accepted");
  const acceptedApplicationsBridgeStatus = await Promise.all(
    acceptedApplications.map(async (a) => {
      const bridge = await getHiringBridgeStatus({ id: a.id, email: a.email });
      return {
        id: a.id,
        fullName: a.fullName,
        stage: bridge.stage,
        profileId: "profileId" in bridge ? bridge.profileId : undefined,
        positionAssigned: "positionAssigned" in bridge ? bridge.positionAssigned : undefined,
      };
    })
  );

  const result = summarizeHrCommandCentre({
    users,
    applications,
    acceptedApplicationsBridgeStatus,
    onboardingInProgress: workforceCounts.onboardingInProgress,
    onboardingComplete: 0,
    onLeaveToday,
    pendingLeaveRequests,
    unexplainedAbsencesCount: workforceCounts.unexplainedAbsences,
  });

  const recentHires: RecentHire[] = users
    .filter((u) => u.roles.includes("staff"))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6)
    .map((u) => ({ id: u.id, fullName: u.fullName, positionName: u.positionName, memberNumber: u.memberNumber }));

  const recentActivity: HrActivityItem[] = activity
    .filter((e) => HR_ACTIVITY_PREFIXES.some((p) => e.action.startsWith(p)))
    .slice(0, 10)
    .map((e) => ({ id: e.id, actorLabel: e.actorLabel, action: e.action, createdAt: e.createdAt }));

  const onboardingProgress = summarizeOnboardingProgress(onboarding);
  const workforceAnalytics = summarizeWorkforceAnalytics(users);
  const attendanceLeaveSnapshot = summarizeAttendanceLeaveSnapshot(todayAttendance, onLeaveToday);

  const withinTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingOnboardingStarts = onboarding
    .filter((o) => o.status !== "completed" && o.status !== "cancelled")
    .filter((o): o is typeof o & { startDate: string } => o.startDate !== null && o.startDate >= today && o.startDate <= withinTwoWeeks)
    .map((o) => ({ id: o.id, profileId: o.profileId, startDate: o.startDate, pipeline: o.pipeline }));
  const upcomingEvents = summarizeUpcomingPeopleEvents({
    upcomingLeave: upcomingLeave.map((l) => ({ id: l.id, profileFullName: l.profileFullName, startDate: l.startDate })),
    upcomingOnboardingStarts,
    upcomingProbationEndings,
    upcomingLongServiceMilestones,
  });

  const activeWorkforceRows = users
    .filter((u) => u.accessStatus === "active")
    .map((u) => ({ departmentName: u.departmentName, engagementTypeName: u.engagementTypeName }));

  return {
    ...result,
    recentHires,
    recentActivity,
    onboardingProgress,
    workforceAnalytics,
    activeWorkforceRows,
    attendanceLeaveSnapshot,
    upcomingEvents,
  };
}
