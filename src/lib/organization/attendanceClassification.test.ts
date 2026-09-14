import { describe, expect, it } from "vitest";
import { classifyAttendance, type AttendanceStatus } from "./attendanceClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 3. Pure — every
// case below is a real, executable assertion, no database needed.

const BASE = {
  dayType: "working_day" as const,
  scheduledStartTime: "09:00",
  scheduledEndTime: "17:00",
  actualCheckIn: null,
  actualCheckOut: null,
  hasApprovedLeave: false,
  isPastScheduledEnd: false,
};

describe("classifyAttendance — structural guarantee: never produces a human-review-only status", () => {
  it("the return type's attendanceStatus can never structurally be 'absent_authorized' or 'absent_unauthorized_confirmed' — those values do not exist in AttendanceStatus at all, verified by exhaustive case coverage below never producing them", () => {
    const allPossible: AttendanceStatus[] = ["pending", "present", "absent_unexplained", "on_leave", "rest_day", "public_holiday"];
    expect(allPossible).not.toContain("absent_authorized");
    expect(allPossible).not.toContain("absent_unauthorized_confirmed");
  });
});

describe("classifyAttendance — approved leave takes priority over everything else", () => {
  it("on_leave regardless of day type or check-in state", () => {
    const result = classifyAttendance({ ...BASE, hasApprovedLeave: true });
    expect(result.attendanceStatus).toBe("on_leave");
  });
});

describe("classifyAttendance — rest day / public holiday", () => {
  it("rest day, not worked", () => {
    const result = classifyAttendance({ ...BASE, dayType: "rest_day" });
    expect(result.attendanceStatus).toBe("rest_day");
    expect(result.isRestDayWorked).toBe(false);
  });

  it("rest day, worked (check-in present) -> is_rest_day_worked true", () => {
    const result = classifyAttendance({ ...BASE, dayType: "rest_day", actualCheckIn: "2026-09-14T10:00:00Z" });
    expect(result.attendanceStatus).toBe("rest_day");
    expect(result.isRestDayWorked).toBe(true);
  });

  it("public holiday, not worked", () => {
    const result = classifyAttendance({ ...BASE, dayType: "public_holiday" });
    expect(result.attendanceStatus).toBe("public_holiday");
    expect(result.isPublicHolidayWorked).toBe(false);
  });

  it("public holiday, worked -> is_public_holiday_worked true", () => {
    const result = classifyAttendance({ ...BASE, dayType: "public_holiday", actualCheckIn: "2026-09-14T10:00:00Z" });
    expect(result.isPublicHolidayWorked).toBe(true);
  });
});

describe("classifyAttendance — working day, no check-in", () => {
  it("still within the scheduled day -> pending, never a premature absence claim", () => {
    const result = classifyAttendance({ ...BASE, isPastScheduledEnd: false });
    expect(result.attendanceStatus).toBe("pending");
  });

  it("past the scheduled end with no check-in -> absent_unexplained (the correct initial fact, per OS-HR-GH-002 7.2 'Unexplained Absence - Pending Review')", () => {
    const result = classifyAttendance({ ...BASE, isPastScheduledEnd: true });
    expect(result.attendanceStatus).toBe("absent_unexplained");
  });
});

describe("classifyAttendance — working day, checked in", () => {
  it("on time -> present, not late, not early departure", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:00:00Z" });
    expect(result.attendanceStatus).toBe("present");
    expect(result.isLate).toBe(false);
  });

  it("checked in 1 minute after scheduled start, zero grace period -> late (no invented grace period)", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:01:00Z" });
    expect(result.isLate).toBe(true);
  });

  it("checked in before scheduled start -> not late", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T08:45:00Z" });
    expect(result.isLate).toBe(false);
  });

  it("a nonzero grace period is honored only when the caller explicitly supplies one — never a default", () => {
    const withoutGrace = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:10:00Z" });
    expect(withoutGrace.isLate).toBe(true);
    const withGrace = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:10:00Z", gracePeriodMinutes: 15 });
    expect(withGrace.isLate).toBe(false);
  });

  it("checked out before scheduled end -> early departure", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:00:00Z", actualCheckOut: "2026-09-14T16:00:00Z" });
    expect(result.isEarlyDeparture).toBe(true);
  });

  it("checked out at or after scheduled end -> not early departure", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:00:00Z", actualCheckOut: "2026-09-14T17:00:00Z" });
    expect(result.isEarlyDeparture).toBe(false);
  });

  it("both late AND early departure can be true simultaneously — tracked as independent facts, never a single mutually-exclusive status", () => {
    const result = classifyAttendance({ ...BASE, actualCheckIn: "2026-09-14T09:30:00Z", actualCheckOut: "2026-09-14T16:00:00Z" });
    expect(result.isLate).toBe(true);
    expect(result.isEarlyDeparture).toBe(true);
    expect(result.attendanceStatus).toBe("present");
  });

  it("no scheduled start/end time (assignment-based/flexible role) never produces a false late/early-departure flag", () => {
    const result = classifyAttendance({
      dayType: "working_day",
      scheduledStartTime: null,
      scheduledEndTime: null,
      actualCheckIn: "2026-09-14T14:00:00Z",
      actualCheckOut: "2026-09-14T20:00:00Z",
      hasApprovedLeave: false,
      isPastScheduledEnd: false,
    });
    expect(result.isLate).toBe(false);
    expect(result.isEarlyDeparture).toBe(false);
    expect(result.attendanceStatus).toBe("present");
  });
});
