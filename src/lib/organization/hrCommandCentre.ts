import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listRecruitmentApplications } from "@/lib/recruitment/adminData";
import { getWorkforceOverviewCounts, countCurrentlyOnLeave } from "@/lib/organization/hrDashboard";
import { listPendingLeaveRequestsAcrossStaff } from "@/lib/organization/leaveRequests";

// HR / People Command Centre (2026-09-16) — layers on top of the
// EXISTING Workforce Overview data engine (hrDashboard.ts) rather than
// re-querying the same facts a second, independently-drifting way:
// onboardingInProgress, pendingLeaveRequests/unexplainedAbsences, and
// on-leave-today all come straight from getWorkforceOverviewCounts()/
// countCurrentlyOnLeave() — the same numbers Workforce Overview itself
// shows. Only genuinely new signals are computed here: External
// Workforce headcount and the Recruitment pipeline (new/accepted).

const EMPLOYEE_ROLE_SLUGS = new Set(["staff"]);
const EXTERNAL_WORKFORCE_ROLE_SLUGS = new Set(["vendor", "contractor", "model", "workshop_participant"]);

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

// Pure summarizer — takes already-fetched rows, decides the counts and
// the Needs Your Attention list. Directly testable without a database.
export function summarizeHrCommandCentre(input: {
  users: { roles: string[]; accessStatus: string }[];
  applications: { status: string; id: string; fullName: string }[];
  onboardingInProgress: number;
  onLeaveToday: number;
  pendingLeaveRequests: { id: string; profileFullName: string | null }[];
  unexplainedAbsencesCount: number;
}): { summary: HrCommandCentreSummary; needsAttention: NeedsAttentionItem[] } {
  const activeEmployees = input.users.filter(
    (u) => u.accessStatus === "active" && u.roles.some((r) => EMPLOYEE_ROLE_SLUGS.has(r))
  ).length;
  const externalWorkforce = input.users.filter(
    (u) => u.accessStatus === "active" && u.roles.some((r) => EXTERNAL_WORKFORCE_ROLE_SLUGS.has(r))
  ).length;
  const newApplications = input.applications.filter((a) => a.status === "new").length;
  const acceptedApplications = input.applications.filter((a) => a.status === "accepted");

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
  };
}

export async function getHrCommandCentreSummary(): Promise<{ summary: HrCommandCentreSummary; needsAttention: NeedsAttentionItem[] }> {
  const [usersResult, applications, workforceCounts, onLeaveToday, pendingLeaveRequests] = await Promise.all([
    listUsersWithRoles(),
    listRecruitmentApplications(),
    getWorkforceOverviewCounts(),
    countCurrentlyOnLeave(),
    listPendingLeaveRequestsAcrossStaff(),
  ]);

  return summarizeHrCommandCentre({
    users: usersResult.ok ? usersResult.users : [],
    applications,
    onboardingInProgress: workforceCounts.onboardingInProgress,
    onLeaveToday,
    pendingLeaveRequests,
    unexplainedAbsencesCount: workforceCounts.unexplainedAbsences,
  });
}
