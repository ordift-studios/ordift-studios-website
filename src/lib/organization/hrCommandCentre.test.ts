import { describe, expect, it } from "vitest";
import { summarizeHrCommandCentre } from "./hrCommandCentre";

describe("summarizeHrCommandCentre — real assertions", () => {
  it("counts active employees and external workforce separately, ignoring inactive accounts", () => {
    const { summary } = summarizeHrCommandCentre({
      users: [
        { roles: ["staff"], accessStatus: "active" },
        { roles: ["staff"], accessStatus: "suspended" },
        { roles: ["vendor"], accessStatus: "active" },
        { roles: ["client"], accessStatus: "active" },
      ],
      applications: [],
      onboardingInProgress: 0,
      onLeaveToday: 0,
      pendingLeaveRequests: [],
      unexplainedAbsencesCount: 0,
    });
    expect(summary.activeEmployees).toBe(1);
    expect(summary.externalWorkforce).toBe(1);
  });

  it("accepted applications appear in Needs Attention and count as acceptedAwaitingHire", () => {
    const { summary, needsAttention } = summarizeHrCommandCentre({
      users: [],
      applications: [
        { id: "a1", fullName: "Kelvin Acheampong", status: "accepted" },
        { id: "a2", fullName: "Someone Else", status: "new" },
      ],
      onboardingInProgress: 0,
      onLeaveToday: 0,
      pendingLeaveRequests: [],
      unexplainedAbsencesCount: 0,
    });
    expect(summary.acceptedAwaitingHire).toBe(1);
    expect(summary.newApplications).toBe(1);
    expect(needsAttention.some((n) => n.key === "accepted-a1" && n.href === "/admin/recruitment/a1")).toBe(true);
  });

  it("empty input produces an empty Needs Attention list, never a fabricated entry", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      users: [],
      applications: [],
      onboardingInProgress: 0,
      onLeaveToday: 0,
      pendingLeaveRequests: [],
      unexplainedAbsencesCount: 0,
    });
    expect(needsAttention).toEqual([]);
  });

  it("onboardingInProgress passthrough produces one aggregate Needs Attention entry", () => {
    const { summary, needsAttention } = summarizeHrCommandCentre({
      users: [],
      applications: [],
      onboardingInProgress: 1,
      onLeaveToday: 0,
      pendingLeaveRequests: [],
      unexplainedAbsencesCount: 0,
    });
    expect(summary.onboardingInProgress).toBe(1);
    expect(needsAttention.filter((n) => n.key === "onboarding-in-progress")).toHaveLength(1);
  });

  it("unexplainedAbsencesCount aggregates into one Needs Attention entry with the real count", () => {
    const { needsAttention } = summarizeHrCommandCentre({
      users: [],
      applications: [],
      onboardingInProgress: 0,
      onLeaveToday: 0,
      pendingLeaveRequests: [],
      unexplainedAbsencesCount: 2,
    });
    const entry = needsAttention.find((n) => n.key === "attendance-exceptions");
    expect(entry?.label).toContain("2 unexplained absences");
  });
});
