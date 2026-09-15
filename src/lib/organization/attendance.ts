import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { classifyAttendance, type AttendanceDayType, type AttendanceStatus } from "@/lib/organization/attendanceClassification";

export type { AttendanceDayType };

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 3 (2026-09-14) —
// attendance record I/O. The actual classification decision lives in
// attendanceClassification.ts (pure, fully unit-tested); this file only
// wires it to real data. Authorization reuses the same Super-Admin/
// operations.administer tier already established for assignStaffPosition/
// onboarding/leave — no new concept.

export interface AttendanceRecord {
  id: string;
  profileId: string;
  attendanceDate: string;
  dayType: AttendanceDayType;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  attendanceStatus: AttendanceStatus | "absent_authorized" | "absent_unauthorized_confirmed";
  isLate: boolean;
  isEarlyDeparture: boolean;
  isRestDayWorked: boolean;
  isPublicHolidayWorked: boolean;
  isOnCall: boolean;
  leaveRequestId: string | null;
  explanationNotes: string | null;
  falsificationFlagged: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

function mapRow(r: {
  id: string;
  profile_id: string;
  attendance_date: string;
  day_type: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
  attendance_status: string;
  is_late: boolean;
  is_early_departure: boolean;
  is_rest_day_worked: boolean;
  is_public_holiday_worked: boolean;
  is_on_call: boolean;
  leave_request_id: string | null;
  explanation_notes: string | null;
  falsification_flagged: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
}): AttendanceRecord {
  return {
    id: r.id,
    profileId: r.profile_id,
    attendanceDate: r.attendance_date,
    dayType: r.day_type as AttendanceDayType,
    scheduledStartTime: r.scheduled_start_time,
    scheduledEndTime: r.scheduled_end_time,
    actualCheckIn: r.actual_check_in,
    actualCheckOut: r.actual_check_out,
    attendanceStatus: r.attendance_status as AttendanceRecord["attendanceStatus"],
    isLate: r.is_late,
    isEarlyDeparture: r.is_early_departure,
    isRestDayWorked: r.is_rest_day_worked,
    isPublicHolidayWorked: r.is_public_holiday_worked,
    isOnCall: r.is_on_call,
    leaveRequestId: r.leave_request_id,
    explanationNotes: r.explanation_notes,
    falsificationFlagged: r.falsification_flagged,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  };
}

const SELECT =
  "id, profile_id, attendance_date, day_type, scheduled_start_time, scheduled_end_time, actual_check_in, actual_check_out, attendance_status, is_late, is_early_departure, is_rest_day_worked, is_public_holiday_worked, is_on_call, leave_request_id, explanation_notes, falsification_flagged, reviewed_by, reviewed_at";

async function canManageAttendance(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

async function findApprovedLeaveForDate(profileId: string, date: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leave_requests")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "approved")
    // A superseded row (2026-09-15, Leave Swap) is historical only — its
    // dates no longer reflect this person's real approved leave; the
    // replacement row (created by decideLeaveSwap()) is what's queried
    // for its own, different dates instead.
    .is("superseded_by_leave_request_id", null)
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// Idempotent — returns the existing row for (profileId, date) if one
// exists; otherwise creates it with attendance_status='pending' and
// classifies it immediately against whatever facts are already known
// (an approved leave for that date, primarily).
export async function getOrCreateAttendanceRecord(params: {
  profileId: string;
  attendanceDate: string;
  dayType: AttendanceDayType;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
}): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("attendance_records")
    .select(SELECT)
    .eq("profile_id", params.profileId)
    .eq("attendance_date", params.attendanceDate)
    .maybeSingle();
  if (existing) return { ok: true, record: mapRow(existing) };

  const leaveRequestId = await findApprovedLeaveForDate(params.profileId, params.attendanceDate);
  const classification = classifyAttendance({
    dayType: params.dayType,
    scheduledStartTime: params.scheduledStartTime ?? null,
    scheduledEndTime: params.scheduledEndTime ?? null,
    actualCheckIn: null,
    actualCheckOut: null,
    hasApprovedLeave: leaveRequestId !== null,
    isPastScheduledEnd: false,
  });

  const { data, error } = await admin
    .from("attendance_records")
    .insert({
      profile_id: params.profileId,
      attendance_date: params.attendanceDate,
      day_type: params.dayType,
      scheduled_start_time: params.scheduledStartTime ?? null,
      scheduled_end_time: params.scheduledEndTime ?? null,
      attendance_status: classification.attendanceStatus,
      leave_request_id: leaveRequestId,
    })
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create the attendance record." };
  return { ok: true, record: mapRow(data) };
}

// Re-runs the pure classifier against a record's current facts and
// writes the result back — but NEVER when the record's status is
// already 'absent_authorized' or 'absent_unauthorized_confirmed'
// (a human review decision), so an automatic recompute can never
// silently clobber one. This is the only place classification is
// (re)computed after creation — called after a check-in/check-out is
// recorded, or on demand (e.g. an end-of-day pass).
export async function recalculateAttendanceClassification(params: {
  recordId: string;
  isPastScheduledEnd: boolean;
  gracePeriodMinutes?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select(SELECT).eq("id", params.recordId).maybeSingle();
  if (!existing) return { ok: false, error: "Attendance record not found." };
  const record = mapRow(existing);
  if (record.attendanceStatus === "absent_authorized" || record.attendanceStatus === "absent_unauthorized_confirmed") {
    return { ok: true }; // a human review decision stands; no-op
  }

  const leaveRequestId = await findApprovedLeaveForDate(record.profileId, record.attendanceDate);
  const classification = classifyAttendance({
    dayType: record.dayType,
    scheduledStartTime: record.scheduledStartTime,
    scheduledEndTime: record.scheduledEndTime,
    actualCheckIn: record.actualCheckIn,
    actualCheckOut: record.actualCheckOut,
    hasApprovedLeave: leaveRequestId !== null,
    gracePeriodMinutes: params.gracePeriodMinutes,
    isPastScheduledEnd: params.isPastScheduledEnd,
  });

  const { error } = await admin
    .from("attendance_records")
    .update({
      attendance_status: classification.attendanceStatus,
      is_late: classification.isLate,
      is_early_departure: classification.isEarlyDeparture,
      is_rest_day_worked: classification.isRestDayWorked,
      is_public_holiday_worked: classification.isPublicHolidayWorked,
      leave_request_id: leaveRequestId,
    })
    .eq("id", params.recordId)
    .not("attendance_status", "in", "(absent_authorized,absent_unauthorized_confirmed)"); // atomic re-guard against a concurrent review decision
  if (error) return { ok: false, error: "Failed to update the attendance classification." };
  return { ok: true };
}

export async function recordCheckIn(params: { profileId: string; attendanceDate: string; timestamp: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.actorUserId !== params.profileId && !(await canManageAttendance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record attendance on behalf of another person." };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select("id").eq("profile_id", params.profileId).eq("attendance_date", params.attendanceDate).maybeSingle();
  if (!existing) return { ok: false, error: "No attendance record exists for this date yet — create one first." };

  const { error } = await admin.from("attendance_records").update({ actual_check_in: params.timestamp }).eq("id", existing.id);
  if (error) return { ok: false, error: "Failed to record check-in." };
  return recalculateAttendanceClassification({ recordId: existing.id, isPastScheduledEnd: false });
}

export async function recordCheckOut(params: { profileId: string; attendanceDate: string; timestamp: string; actorUserId: string; isPastScheduledEnd?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.actorUserId !== params.profileId && !(await canManageAttendance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record attendance on behalf of another person." };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select("id").eq("profile_id", params.profileId).eq("attendance_date", params.attendanceDate).maybeSingle();
  if (!existing) return { ok: false, error: "No attendance record exists for this date yet — create one first." };

  const { error } = await admin.from("attendance_records").update({ actual_check_out: params.timestamp }).eq("id", existing.id);
  if (error) return { ok: false, error: "Failed to record check-out." };
  return recalculateAttendanceClassification({ recordId: existing.id, isPastScheduledEnd: params.isPastScheduledEnd ?? true });
}

// Self-service — an employee (or admin on their behalf) attaches an
// explanation to an unexplained absence. Does NOT itself resolve the
// exception — see reviewAttendanceException() for the human decision.
export async function recordAttendanceExplanation(params: {
  recordId: string;
  explanationNotes: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select("profile_id").eq("id", params.recordId).maybeSingle();
  if (!existing) return { ok: false, error: "Attendance record not found." };
  if (params.actorUserId !== existing.profile_id && !(await canManageAttendance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to add an explanation on behalf of another person." };
  }

  const { error } = await admin.from("attendance_records").update({ explanation_notes: params.explanationNotes }).eq("id", params.recordId);
  if (error) return { ok: false, error: "Failed to record the explanation." };
  return { ok: true };
}

// THE ONLY code path that can set attendance_status to
// 'absent_authorized' or 'absent_unauthorized_confirmed' — a deliberate
// human decision by an authorized reviewer, never automatic (OS-HR-GH-002
// 7.2: "Ordift should make reasonable contact and allow explanation...
// Confirmed unauthorized absence... may progress through discipline").
export async function reviewAttendanceException(params: {
  recordId: string;
  decision: "authorized" | "unauthorized_confirmed";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageAttendance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to review an attendance exception." };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select("id, profile_id, attendance_status").eq("id", params.recordId).maybeSingle();
  if (!existing) return { ok: false, error: "Attendance record not found." };
  if (existing.attendance_status !== "absent_unexplained") {
    return { ok: false, error: `Cannot review a record currently in status "${existing.attendance_status}" — only an unexplained absence can be reviewed.` };
  }

  const newStatus = params.decision === "authorized" ? "absent_authorized" : "absent_unauthorized_confirmed";
  const { error } = await admin
    .from("attendance_records")
    .update({
      attendance_status: newStatus,
      explanation_notes: params.decisionNotes ?? null,
      reviewed_by: params.actorUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.recordId)
    .eq("attendance_status", "absent_unexplained"); // atomic: only reviews a still-unexplained record
  if (error) return { ok: false, error: "Failed to record the review decision." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "attendance.exception_reviewed",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { recordId: params.recordId, decision: params.decision },
  });
  return { ok: true };
}

// A separate misconduct flag — never itself a classification or a
// consequence (OS-HR-GH-002 2.4). Purely additive metadata for a
// not-yet-built discipline workflow to reference.
export async function flagAttendanceFalsification(params: { recordId: string; notes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageAttendance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to flag attendance falsification." };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("attendance_records").select("profile_id").eq("id", params.recordId).maybeSingle();
  if (!existing) return { ok: false, error: "Attendance record not found." };

  const { error } = await admin.from("attendance_records").update({ falsification_flagged: true, explanation_notes: params.notes }).eq("id", params.recordId);
  if (error) return { ok: false, error: "Failed to flag the record." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "attendance.falsification_flagged",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { recordId: params.recordId },
  });
  return { ok: true };
}

export async function listAttendanceRecordsForProfile(profileId: string, fromDate?: string, toDate?: string): Promise<AttendanceRecord[]> {
  const admin = createAdminClient();
  let query = admin.from("attendance_records").select(SELECT).eq("profile_id", profileId).order("attendance_date", { ascending: false });
  if (fromDate) query = query.gte("attendance_date", fromDate);
  if (toDate) query = query.lte("attendance_date", toDate);
  const { data, error } = await query;
  if (error) {
    console.error("[organization] failed to load attendance_records", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export interface AttendanceRecordWithProfile extends AttendanceRecord {
  profileFullName: string | null;
}

function mapRowWithProfile(r: Parameters<typeof mapRow>[0] & { profiles: { full_name: string | null } | null }): AttendanceRecordWithProfile {
  return { ...mapRow(r), profileFullName: r.profiles?.full_name ?? null };
}

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 3 (2026-09-14) —
// the Admin-wide Attendance workspace. Every record for the given date
// across every person who has one — a day with no records yet for
// anyone shows an empty list, never a fabricated roster of "present"
// rows for people who haven't been recorded.
export async function listAttendanceRecordsForDateAcrossStaff(attendanceDate: string): Promise<AttendanceRecordWithProfile[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendance_records")
    .select(`${SELECT}, profiles!attendance_records_profile_id_fkey(full_name)`)
    .eq("attendance_date", attendanceDate)
    .order("attendance_date", { ascending: false });
  if (error) {
    console.error("[organization] failed to load attendance_records for date", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRowWithProfile(r as unknown as Parameters<typeof mapRowWithProfile>[0]));
}

// The exceptions queue — every record still awaiting the one human
// decision reviewAttendanceException() can make, across every person.
export async function listUnexplainedAbsencesAcrossStaff(): Promise<AttendanceRecordWithProfile[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendance_records")
    .select(`${SELECT}, profiles!attendance_records_profile_id_fkey(full_name)`)
    .eq("attendance_status", "absent_unexplained")
    .order("attendance_date", { ascending: true });
  if (error) {
    console.error("[organization] failed to load unexplained absences", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRowWithProfile(r as unknown as Parameters<typeof mapRowWithProfile>[0]));
}

export { canManageAttendance };
