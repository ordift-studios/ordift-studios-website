import type { AttendanceRecord } from "./attendance";

// Backlog Phase 2 (2026-09-16) — weekly attendance reconciliation.
// Pure summarizer, same "classification logic is pure and fully
// testable, DB wiring stays separate" convention as
// attendanceClassification.ts. Purely INFORMATIONAL: a shortage figure
// here is a manager-review signal, never an automatic payroll
// deduction — nothing in this module writes to compensation/payroll in
// any way, and no caller anywhere is wired to do so from this output.

export interface AttendanceReconciliationSummary {
  scheduledDays: number;
  scheduledHours: number;
  actualHours: number;
  shortageHours: number;
  presentDays: number;
  lateDays: number;
  earlyDepartureDays: number;
  absentUnauthorizedDays: number;
  absentAuthorizedDays: number;
  onLeaveDays: number;
  restDayWorkedDays: number;
  publicHolidayWorkedDays: number;
  pendingDays: number;
}

function scheduledHoursFor(record: AttendanceRecord): number {
  if (!record.scheduledStartTime || !record.scheduledEndTime) return 0;
  const [startH, startM] = record.scheduledStartTime.split(":").map(Number);
  const [endH, endM] = record.scheduledEndTime.split(":").map(Number);
  const minutes = endH * 60 + endM - (startH * 60 + startM);
  return minutes > 0 ? minutes / 60 : 0;
}

function actualHoursFor(record: AttendanceRecord): number {
  if (!record.actualCheckIn || !record.actualCheckOut) return 0;
  const minutes = (new Date(record.actualCheckOut).getTime() - new Date(record.actualCheckIn).getTime()) / 60000;
  return minutes > 0 ? minutes / 60 : 0;
}

// A "scheduled day" only counts working_day-equivalent records that
// genuinely carry a schedule (scheduledStartTime set) — rest days and
// public holidays never count toward scheduled hours, matching
// attendanceClassification.ts's own dayType discipline.
export function summarizeAttendanceReconciliation(records: AttendanceRecord[]): AttendanceReconciliationSummary {
  const summary: AttendanceReconciliationSummary = {
    scheduledDays: 0,
    scheduledHours: 0,
    actualHours: 0,
    shortageHours: 0,
    presentDays: 0,
    lateDays: 0,
    earlyDepartureDays: 0,
    absentUnauthorizedDays: 0,
    absentAuthorizedDays: 0,
    onLeaveDays: 0,
    restDayWorkedDays: 0,
    publicHolidayWorkedDays: 0,
    pendingDays: 0,
  };

  for (const record of records) {
    if (record.scheduledStartTime && record.scheduledEndTime) {
      summary.scheduledDays += 1;
      summary.scheduledHours += scheduledHoursFor(record);
    }
    summary.actualHours += actualHoursFor(record);
    if (record.isLate) summary.lateDays += 1;
    if (record.isEarlyDeparture) summary.earlyDepartureDays += 1;
    if (record.isRestDayWorked) summary.restDayWorkedDays += 1;
    if (record.isPublicHolidayWorked) summary.publicHolidayWorkedDays += 1;

    switch (record.attendanceStatus) {
      case "present":
        summary.presentDays += 1;
        break;
      case "absent_unauthorized_confirmed":
        summary.absentUnauthorizedDays += 1;
        break;
      case "absent_authorized":
        summary.absentAuthorizedDays += 1;
        break;
      case "on_leave":
        summary.onLeaveDays += 1;
        break;
      case "pending":
      case "absent_unexplained":
        summary.pendingDays += 1;
        break;
      default:
        break;
    }
  }

  summary.shortageHours = Math.max(0, summary.scheduledHours - summary.actualHours);
  return summary;
}
