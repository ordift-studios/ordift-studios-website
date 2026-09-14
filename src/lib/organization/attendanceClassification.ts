// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 3 (2026-09-14) —
// pure attendance classification. No database dependency, no clock
// dependency (the caller supplies "now"-derived facts explicitly), so
// every branch is directly testable.
//
// FAIL-CLOSED / NO-JUDGMENT CONTRACT: this function only ever produces
// FACTUAL classifications derivable from schedule + actual data —
// "present", "pending", "absent_unexplained", "on_leave", "rest_day",
// "public_holiday". It can NEVER return "absent_authorized" or
// "absent_unauthorized_confirmed" — those are human review outcomes
// (see reviewAttendanceException() in attendance.ts) and appear nowhere
// in this file's return type at all, not merely "unreached" — a
// structural guarantee, not a runtime check.
//
// gracePeriodMinutes defaults to 0 — OS-HR-GH-002 2.5 states the system
// "may support a configurable role-specific attendance grace period,
// but no numeric grace period is adopted by this version." Passing a
// nonzero value is the caller's explicit choice once such a
// configuration is actually approved; this module invents no default
// grace period of its own.

export type AttendanceDayType = "working_day" | "rest_day" | "public_holiday";

export type AttendanceStatus = "pending" | "present" | "absent_unexplained" | "on_leave" | "rest_day" | "public_holiday";

export interface AttendanceClassificationResult {
  attendanceStatus: AttendanceStatus;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isRestDayWorked: boolean;
  isPublicHolidayWorked: boolean;
}

// "HH:MM" scheduled time + an actual ISO timestamp -> minutes actual is
// after scheduled, on that same calendar day. Uses UTC accessors
// deliberately, not local-time ones: Ghana (GMT, UTC+0, no DST) is
// numerically identical to UTC year-round, so this is both correct for
// the one jurisdiction this module currently serves AND immune to
// whatever timezone the Node process happens to run in (server or test
// runner) — a local-time accessor would silently shift every
// comparison by the host's offset.
function minutesAfterScheduled(actualIso: string, scheduledHHMM: string): number {
  const actual = new Date(actualIso);
  const actualMinutes = actual.getUTCHours() * 60 + actual.getUTCMinutes();
  const [schedH, schedM] = scheduledHHMM.split(":").map(Number);
  const scheduledMinutes = schedH * 60 + schedM;
  return actualMinutes - scheduledMinutes;
}

export function classifyAttendance(params: {
  dayType: AttendanceDayType;
  scheduledStartTime: string | null; // "HH:MM"
  scheduledEndTime: string | null; // "HH:MM"
  actualCheckIn: string | null; // ISO timestamp
  actualCheckOut: string | null; // ISO timestamp
  hasApprovedLeave: boolean;
  gracePeriodMinutes?: number;
  isPastScheduledEnd: boolean;
}): AttendanceClassificationResult {
  const gracePeriodMinutes = params.gracePeriodMinutes ?? 0;

  if (params.hasApprovedLeave) {
    return { attendanceStatus: "on_leave", isLate: false, isEarlyDeparture: false, isRestDayWorked: false, isPublicHolidayWorked: false };
  }

  if (params.dayType === "rest_day") {
    return {
      attendanceStatus: "rest_day",
      isLate: false,
      isEarlyDeparture: false,
      isRestDayWorked: params.actualCheckIn !== null,
      isPublicHolidayWorked: false,
    };
  }

  if (params.dayType === "public_holiday") {
    return {
      attendanceStatus: "public_holiday",
      isLate: false,
      isEarlyDeparture: false,
      isRestDayWorked: false,
      isPublicHolidayWorked: params.actualCheckIn !== null,
    };
  }

  // working_day
  if (!params.actualCheckIn) {
    return {
      attendanceStatus: params.isPastScheduledEnd ? "absent_unexplained" : "pending",
      isLate: false,
      isEarlyDeparture: false,
      isRestDayWorked: false,
      isPublicHolidayWorked: false,
    };
  }

  const isLate = Boolean(params.scheduledStartTime) && minutesAfterScheduled(params.actualCheckIn, params.scheduledStartTime!) > gracePeriodMinutes;
  const isEarlyDeparture =
    Boolean(params.scheduledEndTime) && Boolean(params.actualCheckOut) && minutesAfterScheduled(params.actualCheckOut!, params.scheduledEndTime!) < 0;

  return { attendanceStatus: "present", isLate, isEarlyDeparture, isRestDayWorked: false, isPublicHolidayWorked: false };
}
