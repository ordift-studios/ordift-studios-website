import { describe, expect, it } from "vitest";
import { summarizeHrCommandCentre } from "./hrCommandCentre";

const base = {
  users: [] as { roles: string[]; accessStatus: string }[],
  applications: [] as { status: string; id: string; fullName: string }[],
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

  it("accepted applications appear in Needs Attention, pipeline, and count as acceptedAwaitingHire", () => {
    const { summary, needsAttention, pipeline } = summarizeHrCommandCentre({
      ...base,
      applications: [
        { id: "a1", fullName: "Kelvin Acheampong", status: "accepted" },
        { id: "a2", fullName: "Someone Else", status: "new" },
      ],
    });
    expect(summary.acceptedAwaitingHire).toBe(1);
    expect(summary.newApplications).toBe(1);
    expect(needsAttention.some((n) => n.key === "accepted-a1" && n.href === "/admin/recruitment/a1")).toBe(true);
    expect(pipeline.find((s) => s.key === "accepted")?.count).toBe(1);
    expect(pipeline.find((s) => s.key === "new")?.count).toBe(1);
  });

  it("pipeline includes shortlisted+interview combined and onboarding/active stages", () => {
    const { pipeline } = summarizeHrCommandCentre({
      ...base,
      applications: [
        { id: "a1", fullName: "A", status: "shortlisted" },
        { id: "a2", fullName: "B", status: "interview" },
      ],
      onboardingInProgress: 2,
      users: [{ roles: ["staff"], accessStatus: "active" }],
    });
    expect(pipeline.find((s) => s.key === "shortlisted")?.count).toBe(2);
    expect(pipeline.find((s) => s.key === "onboarding")?.count).toBe(2);
    expect(pipeline.find((s) => s.key === "active")?.count).toBe(1);
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
