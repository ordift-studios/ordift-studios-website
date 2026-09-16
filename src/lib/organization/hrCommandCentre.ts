import { listUsersWithRoles, type AdminUserRow } from "@/lib/portal/adminData";
import { listRecruitmentApplications } from "@/lib/recruitment/adminData";
import { getWorkforceOverviewCounts, countCurrentlyOnLeave } from "@/lib/organization/hrDashboard";
import { listPendingLeaveRequestsAcrossStaff } from "@/lib/organization/leaveRequests";
import { getRecentActivity } from "@/lib/admin/activityLog";

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

// Pure summarizer — takes already-fetched rows, decides the counts and
// the Needs Your Attention list. Directly testable without a database.
export function summarizeHrCommandCentre(input: {
  users: { roles: string[]; accessStatus: string }[];
  applications: { status: string; id: string; fullName: string }[];
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
    { key: "accepted", label: "Accepted", count: acceptedApplications.length },
    { key: "onboarding", label: "Onboarding", count: input.onboardingInProgress },
    { key: "active", label: "Active", count: activeEmployees },
  ];

  const needsAttention: NeedsAttentionItem[] = [
    ...acceptedApplications.map((a) => ({
      key: `accepted-${a.id}`,
      label: `${a.fullName} — Accepted, awaiting Proceed to Hire`,
      href: `/admin/recruitment/${a.id}`,
    })),
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

export async function getHrCommandCentreSummary(): Promise<{
  summary: HrCommandCentreSummary;
  needsAttention: NeedsAttentionItem[];
  pipeline: PipelineStage[];
  externalWorkforceByType: Record<string, number>;
  recentHires: RecentHire[];
  recentActivity: HrActivityItem[];
}> {
  const [usersResult, applications, workforceCounts, onLeaveToday, pendingLeaveRequests, activity] = await Promise.all([
    listUsersWithRoles(),
    listRecruitmentApplications(),
    getWorkforceOverviewCounts(),
    countCurrentlyOnLeave(),
    listPendingLeaveRequestsAcrossStaff(),
    getRecentActivity(150),
  ]);
  const users: AdminUserRow[] = usersResult.ok ? usersResult.users : [];

  const result = summarizeHrCommandCentre({
    users,
    applications,
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

  return { ...result, recentHires, recentActivity };
}
