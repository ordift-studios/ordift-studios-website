"use client";

import { useActionState } from "react";
import type { AttendanceRecordWithProfile } from "@/lib/organization/attendance";
import { createAttendanceRecordAction, recordCheckInAction, recordCheckOutAction, reviewAttendanceExceptionAction, type ActionState } from "./actions";

const STATUS_STYLES: Record<string, string> = {
  present: "bg-green-100 text-green-800",
  pending: "bg-ordift-offwhite text-ordift-ink-muted",
  absent_unexplained: "bg-amber-100 text-amber-800",
  absent_authorized: "bg-blue-100 text-blue-800",
  absent_unauthorized_confirmed: "bg-red-100 text-red-800",
  on_leave: "bg-blue-100 text-blue-800",
  rest_day: "bg-ordift-offwhite text-ordift-ink-muted",
  public_holiday: "bg-ordift-offwhite text-ordift-ink-muted",
};

function StatusPill({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[status] ?? "bg-ordift-offwhite text-ordift-ink-muted"}`}>{status.replace(/_/g, " ")}</span>;
}

// Attendance FACTS and payroll TREATMENT are deliberately never
// combined in this UI — this row shows what happened (late/early/
// rest-day-worked), never a "deduct salary" or similar payroll action.
// Any lawful consequence flows through the separate compensation
// subsystem as its own explicit, later decision.
function AttendanceRow({ record }: { record: AttendanceRecordWithProfile }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div>
        <p className="font-sans text-body-small text-ordift-ink">{record.profileFullName ?? "(no name on record)"}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          {record.dayType.replace(/_/g, " ")}
          {record.scheduledStartTime ? ` · scheduled ${record.scheduledStartTime}–${record.scheduledEndTime ?? "?"}` : ""}
          {record.actualCheckIn ? ` · in ${new Date(record.actualCheckIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          {record.actualCheckOut ? ` · out ${new Date(record.actualCheckOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          {record.isLate ? " · late" : ""}
          {record.isEarlyDeparture ? " · early departure" : ""}
          {record.isRestDayWorked ? " · rest day worked" : ""}
          {record.isPublicHolidayWorked ? " · public holiday worked" : ""}
        </p>
      </div>
      <StatusPill status={record.attendanceStatus} />
    </li>
  );
}

function ReviewExceptionForm({ record }: { record: AttendanceRecordWithProfile }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reviewAttendanceExceptionAction, null);
  return (
    <form action={formAction} className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <input type="hidden" name="recordId" value={record.id} />
      <div>
        <p className="font-sans text-body-small font-medium text-ordift-ink">{record.profileFullName ?? "(no name on record)"}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">{record.attendanceDate} · scheduled {record.scheduledStartTime ?? "?"}–{record.scheduledEndTime ?? "?"}</p>
      </div>
      <input name="decisionNotes" placeholder="Decision notes (optional)" className="w-full rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="authorized" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Saving…" : "Mark Authorized"}
        </button>
        <button type="submit" name="decision" value="unauthorized_confirmed" disabled={pending} className="font-sans text-caption text-red-700 underline underline-offset-4 disabled:opacity-50">
          Confirm Unauthorized
        </button>
      </div>
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Decision recorded.</p>}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function CreateRecordForm({ staffOptions, today }: { staffOptions: { id: string; name: string }[]; today: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAttendanceRecordAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="profileId" required defaultValue="" aria-label="Staff member" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Staff member…</option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input name="attendanceDate" type="date" required defaultValue={today} aria-label="Attendance date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <select name="dayType" required defaultValue="working_day" aria-label="Day type" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="working_day">Working day</option>
        <option value="rest_day">Rest day</option>
        <option value="public_holiday">Public holiday</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="scheduledStartTime" type="time" aria-label="Scheduled start time" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        <input name="scheduledEndTime" type="time" aria-label="Scheduled end time" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      </div>
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create Attendance Record"}
      </button>
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Record created.</p>}
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function CheckInOutForm({ staffOptions, today }: { staffOptions: { id: string; name: string }[]; today: string }) {
  const [checkInState, checkInAction, checkInPending] = useActionState<ActionState, FormData>(recordCheckInAction, null);
  const [checkOutState, checkOutAction, checkOutPending] = useActionState<ActionState, FormData>(recordCheckOutAction, null);
  const now = new Date().toISOString().slice(0, 16);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <form action={checkInAction} className="space-y-2">
        <p className="font-sans text-caption font-semibold text-ordift-ink-muted uppercase tracking-wide">Record Check-In</p>
        <select name="profileId" required defaultValue="" aria-label="Staff member" className="w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="" disabled>Staff member…</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input name="attendanceDate" type="date" required defaultValue={today} aria-label="Attendance date" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        <input name="timestamp" type="datetime-local" required defaultValue={now} aria-label="Check-in time" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        <button type="submit" disabled={checkInPending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {checkInPending ? "Saving…" : "Record Check-In"}
        </button>
        {!checkInPending && checkInState?.ok === true && <p className="font-sans text-caption text-green-700">Recorded.</p>}
        {!checkInPending && checkInState?.ok === false && <p className="font-sans text-caption text-red-700">{checkInState.error}</p>}
      </form>
      <form action={checkOutAction} className="space-y-2">
        <p className="font-sans text-caption font-semibold text-ordift-ink-muted uppercase tracking-wide">Record Check-Out</p>
        <select name="profileId" required defaultValue="" aria-label="Staff member" className="w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="" disabled>Staff member…</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input name="attendanceDate" type="date" required defaultValue={today} aria-label="Attendance date" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        <input name="timestamp" type="datetime-local" required defaultValue={now} aria-label="Check-out time" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
        <button type="submit" disabled={checkOutPending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {checkOutPending ? "Saving…" : "Record Check-Out"}
        </button>
        {!checkOutPending && checkOutState?.ok === true && <p className="font-sans text-caption text-green-700">Recorded.</p>}
        {!checkOutPending && checkOutState?.ok === false && <p className="font-sans text-caption text-red-700">{checkOutState.error}</p>}
      </form>
    </div>
  );
}

export function AttendanceWorkspace({
  todayRecords,
  unexplainedAbsences,
  staffOptions,
  today,
}: {
  todayRecords: AttendanceRecordWithProfile[];
  unexplainedAbsences: AttendanceRecordWithProfile[];
  staffOptions: { id: string; name: string }[];
  today: string;
}) {
  return (
    <div className="space-y-8">
      {unexplainedAbsences.length > 0 && (
        <section>
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Unexplained Absences Needing Review ({unexplainedAbsences.length})</h2>
          <div className="space-y-3">
            {unexplainedAbsences.map((r) => (
              <ReviewExceptionForm key={r.id} record={r} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Today ({today})</h2>
        {todayRecords.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No attendance records exist for today yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {todayRecords.map((r) => (
              <AttendanceRow key={r.id} record={r} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Create Today&rsquo;s Record</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">A person needs an attendance record for a date before a check-in/check-out can be recorded against it.</p>
        <CreateRecordForm staffOptions={staffOptions} today={today} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Record Check-In / Check-Out</h2>
        <CheckInOutForm staffOptions={staffOptions} today={today} />
      </section>
    </div>
  );
}
