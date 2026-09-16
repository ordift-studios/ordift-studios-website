import { describe, expect, it } from "vitest";
import {
  summarizeHrCommandCentre,
  summarizeOnboardingProgress,
  summarizeWorkforceAnalytics,
  summarizeAttendanceLeaveSnapshot,
  summarizeUpcomingPeopleEvents,
} from "./hrCommandCentre";

const base = {
  users: [] as { roles: string[]; accessStatus: string }[],
  applications: [] as { status: string; id: string; fullName: string }[],
  acceptedApplicationsBridgeStatus: [] as import("./hrCommandCentre").AcceptedApplicationBridgeStatus[],
  onboardingInProgress: 0,
  onboardingComplete: 0,
  onLeaveToday: 0,
  pendingLeaveRequests: [] as { id: string; profileFullName: string | null }[],
  unexplainedAbsencesCount: 0,
};

describe("summarizeHrCommandCentre — real assertions", () => {
  it("counts active employees and external workforce separately, ignoring inactive accounts", () => {
    const { summary } = summarizeHrCommandCentre({
      ...base,
      users: [
        { roles: ["staff"], accessStatus: "active" },
        { roles: ["staff"], accessStatus: "suspended" },
        { roles: ["vendor"], accessStatus: "active" },
        { roles: ["client"], accessStatus: "active" },
      ],
    });
    expect(summary.activeEmployees).toBe(1);
    expect(summary.externalWorkforce).toBe(1);
  });

  it("externalWorkforceByType breaks down by role slug", () => {
    const { externalWorkforceByType } = summarizeHrCommandCentre({
      ...base,
      users: [
        { roles: ["vendor"], accessStatus: "active" },
        { roles: ["vendor"], accessStatus: "active" },
        { roles: ["contractor"], accessStatus: "active" },
        { roles: ["model"], accessStatus: "active" },
      ],
    });
    expect(externalWorkforceByType.vendor).toBe(2);
    expect(externalWorkforceByType.contractor).toBe(1);
    expect(externalWorkforceByType.model).toBe(1);
    expect(externalWorkforceByType.workshop_participant).toBe(0);
  });

  it("accepted applications appear in the pipeline count regardless of bridge stage", () => {
    const { summary, pipeline } = summarizeHrCommandCentre({
      ...base,
      applications: [
        { id: "a1", fullName: "Kelvin Acheampong", status: "accepted" },
        { id: "a2", fullName: "Someone Else", status: "new" },
      ],
    });
    expect(summary.acceptedAwaitingHire).toBe(1);
    expect(summary.newApplications).toBe(1);
    expect(pipeline.find((s) => s.key === "accepted")?.count).toBe(1);
    expect(pipeline.find((s) => s.key === "new")?.count).toBe(1);
  });

  // Kelvin staleness fix (2026-09-16) — the exact reported defect: an
  // application whose Proceed-to-Hire bridge already ran must NEVER
  // still show "Accepted, awaiting Proceed to Hire". Each real stage
  // produces its own distinct, accurate label.
  it("stage 'not_invited' shows the original awaiting-Proceed-to-Hire action", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      ...base,
      acceptedApplicationsBridgeStatus: [{ id: "a1", fullName: "Kelvin Acheampong", stage: "not_invited" }],
    });
    expect(needsAttention.find((n) => n.key === "accepted-a1")?.label).toBe("Kelvin Acheampong — Selected, awaiting Proceed to Hire");
  });

  it("stage 'account_created' with no Position assigned shows a DIFFERENT, accurate action — never the stale 'awaiting Proceed to Hire'", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      ...base,
      acceptedApplicationsBridgeStatus: [{ id: "a1", fullName: "Kelvin Acheampong", stage: "account_created", profileId: "p1", positionAssigned: false }],
    });
    const entry = needsAttention.find((n) => n.key === "accepted-a1");
    expect(entry?.label).toBe("Kelvin Acheampong — Account created, needs a Position assigned");
    expect(entry?.label).not.toContain("awaiting Proceed to Hire");
    expect(entry?.href).toBe("/admin/organization/people/p1");
  });

  it("stage 'account_created' with a Position assigned shows Ready to start onboarding", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      ...base,
      acceptedApplicationsBridgeStatus: [{ id: "a1", fullName: "Kelvin Acheampong", stage: "account_created", profileId: "p1", positionAssigned: true }],
    });
    expect(needsAttention.find((n) => n.key === "accepted-a1")?.label).toBe("Kelvin Acheampong — Ready to start onboarding");
  });

  it("stage 'onboarding_in_progress' produces NO individual entry — already covered by the aggregate onboarding-in-progress card", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      ...base,
      acceptedApplicationsBridgeStatus: [{ id: "a1", fullName: "Kelvin Acheampong", stage: "onboarding_in_progress", profileId: "p1" }],
    });
    expect(needsAttention.find((n) => n.key === "accepted-a1")).toBeUndefined();
  });

  it("stage 'onboarding_complete' produces no entry at all — genuinely nothing left to do", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      ...base,
      acceptedApplicationsBridgeStatus: [{ id: "a1", fullName: "Kelvin Acheampong", stage: "onboarding_complete", profileId: "p1" }],
    });
    expect(needsAttention.find((n) => n.key === "accepted-a1")).toBeUndefined();
  });

  it("empty input produces an empty Needs Attention list, never a fabricated entry", () => {
    const { needsAttention } = summarizeHrCommandCentre(base);
    expect(needsAttention).toEqual([]);
  });

  it("onboardingInProgress passthrough produces one aggregate Needs Attention entry", () => {
    const { summary, needsAttention } = summarizeHrCommandCentre({ ...base, onboardingInProgress: 1 });
    expect(summary.onboardingInProgress).toBe(1);
    expect(needsAttention.filter((n) => n.key === "onboarding-in-progress")).toHaveLength(1);
  });

  it("unexplainedAbsencesCount aggregates into one Needs Attention entry with the real count", () => {
    const { needsAttention } = summarizeHrCommandCentre({ ...base, unexplainedAbsencesCount: 2 });
    const entry = needsAttention.find((n) => n.key === "attendance-exceptions");
    expect(entry?.label).toContain("2 unexplained absences");
  });
});

// Task 4 additions (2026-09-16) — HR Command Centre D/G/H/I subsections.
describe("summarizeOnboardingProgress — real assertions", () => {
  it("groups by pipeline + stage, excluding completed and cancelled records", () => {
    const rows = summarizeOnboardingProgress([
      { pipeline: "employee", stage: "management_review", status: "active" },
      { pipeline: "employee", stage: "management_review", status: "active" },
      { pipeline: "employee", stage: "active", status: "completed" },
      { pipeline: "external_contractor", stage: "proposed", status: "active" },
    ]);
    expect(rows.find((r) => r.pipeline === "employee" && r.stage === "management_review")?.count).toBe(2);
    expect(rows.find((r) => r.stage === "active")).toBeUndefined();
    expect(rows.find((r) => r.pipeline === "external_contractor")?.count).toBe(1);
  });
});

describe("summarizeWorkforceAnalytics — real assertions", () => {
  it("counts only active users, grouped by department and engagement type", () => {
    const { byDepartment, byEngagementType } = summarizeWorkforceAnalytics([
      { accessStatus: "active", departmentName: "Photography", engagementTypeName: "Full-Time" },
      { accessStatus: "active", departmentName: "Photography", engagementTypeName: "Full-Time" },
      { accessStatus: "suspended", departmentName: "Photography", engagementTypeName: "Full-Time" },
      { accessStatus: "active", departmentName: null, engagementTypeName: null },
    ]);
    expect(byDepartment.find((r) => r.label === "Photography")?.count).toBe(2);
    expect(byDepartment.find((r) => r.label === "Unassigned")?.count).toBe(1);
    expect(byEngagementType.find((r) => r.label === "Unclassified")?.count).toBe(1);
  });
});

describe("summarizeAttendanceLeaveSnapshot — real assertions", () => {
  it("counts present/remote as present, tallies late and unexplained separately, passes onLeaveToday through", () => {
    const snapshot = summarizeAttendanceLeaveSnapshot(
      [
        { attendanceStatus: "present", isLate: false },
        { attendanceStatus: "remote", isLate: true },
        { attendanceStatus: "absent_unexplained", isLate: false },
      ],
      3
    );
    expect(snapshot.presentToday).toBe(2);
    expect(snapshot.lateToday).toBe(1);
    expect(snapshot.unexplainedAbsencesToday).toBe(1);
    expect(snapshot.onLeaveToday).toBe(3);
  });
});

describe("summarizeUpcomingPeopleEvents — real assertions", () => {
  it("merges and sorts upcoming leave and onboarding starts by date", () => {
    const events = summarizeUpcomingPeopleEvents({
      upcomingLeave: [{ id: "l1", profileFullName: "Kelvin Acheampong", startDate: "2026-09-20" }],
      upcomingOnboardingStarts: [{ id: "o1", profileId: "p1", startDate: "2026-09-18", pipeline: "employee" }],
    });
    expect(events.map((e) => e.key)).toEqual(["onboarding-o1", "leave-l1"]);
  });

  it("empty input produces an empty list, never a fabricated event", () => {
    expect(summarizeUpcomingPeopleEvents({ upcomingLeave: [], upcomingOnboardingStarts: [] })).toEqual([]);
  });
});
