"use client";

import { useActionState } from "react";
import { checkInNowAction, checkOutNowAction, addOwnAttendanceExplanationAction, type ActionState } from "./actions";

export interface MyAttendanceRecordView {
  id: string;
  attendanceDate: string;
  dayType: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  attendanceStatus: string;
  isLate: boolean;
  isEarlyDeparture: boolean;
  explanationNotes: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  present: "bg-green-100 text-green-800",
  absent_authorized: "bg-black/5 text-ordift-ink-muted",
  absent_unauthorized_confirmed: "bg-red-100 text-red-800",
  absent_unexplained: "bg-amber-100 text-amber-800",
  pending: "bg-black/5 text-ordift-ink-muted",
};

function TodayCard({ today, todayRecord }: { today: string; todayRecord: MyAttendanceRecordView | null }) {
  const [checkInState, checkInAction, checkInPending] = useActionState<ActionState, FormData>(checkInNowAction, null);
  const [checkOutState, checkOutAction, checkOutPending] = useActionState<ActionState, FormData>(checkOutNowAction, null);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Today — {today}</h2>
      {todayRecord ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Check-in: {todayRecord.actualCheckIn ? new Date(todayRecord.actualCheckIn).toLocaleTimeString() : "not yet"}
          {" · "}
          Check-out: {todayRecord.actualCheckOut ? new Date(todayRecord.actualCheckOut).toLocaleTimeString() : "not yet"}
        </p>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">No attendance record yet for today.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!todayRecord?.actualCheckIn && (
          <form action={checkInAction} className="flex items-center gap-2">
            <input type="hidden" name="attendanceDate" value={today} />
            <select name="dayType" defaultValue="working_day" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
              <option value="working_day">Working day</option>
              <option value="rest_day">Rest day</option>
              <option value="public_holiday">Public holiday</option>
            </select>
            <button type="submit" disabled={checkInPending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
              {checkInPending ? "Checking in…" : "Check In Now"}
            </button>
          </form>
        )}
        {todayRecord?.actualCheckIn && !todayRecord.actualCheckOut && (
          <form action={checkOutAction}>
            <input type="hidden" name="attendanceDate" value={today} />
            <button type="submit" disabled={checkOutPending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
              {checkOutPending ? "Checking out…" : "Check Out Now"}
            </button>
          </form>
        )}
      </div>
      {!checkInPending && checkInState?.ok === false && <p className="font-sans text-caption text-red-700">{checkInState.error}</p>}
      {!checkOutPending && checkOutState?.ok === false && <p className="font-sans text-caption text-red-700">{checkOutState.error}</p>}
    </section>
  );
}

function ExplanationForm({ recordId }: { recordId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addOwnAttendanceExplanationAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2 mt-2">
      <input type="hidden" name="recordId" value={recordId} />
      <input name="explanationNotes" required placeholder="Explain this absence" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Submit Explanation"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function RecordRow({ record }: { record: MyAttendanceRecordView }) {
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{record.attendanceDate} · {record.dayType.replace(/_/g, " ")}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {record.actualCheckIn ? new Date(record.actualCheckIn).toLocaleTimeString() : "—"} → {record.actualCheckOut ? new Date(record.actualCheckOut).toLocaleTimeString() : "—"}
            {record.isLate ? " · late" : ""}
            {record.isEarlyDeparture ? " · early departure" : ""}
          </p>
          {record.explanationNotes && <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{record.explanationNotes}&rdquo;</p>}
        </div>
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${STATUS_STYLES[record.attendanceStatus] ?? "bg-black/5 text-ordift-ink-muted"}`}>
          {record.attendanceStatus.replace(/_/g, " ")}
        </span>
      </div>
      {record.attendanceStatus === "absent_unexplained" && !record.explanationNotes && <ExplanationForm recordId={record.id} />}
    </li>
  );
}

export function MyAttendanceWorkspace({ today, todayRecord, records }: { today: string; todayRecord: MyAttendanceRecordView | null; records: MyAttendanceRecordView[] }) {
  return (
    <div className="space-y-8">
      <TodayCard today={today} todayRecord={todayRecord} />

      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Recent Attendance</h2>
        {records.length > 0 ? (
          <ul className="space-y-3">
            {records.map((r) => (
              <RecordRow key={r.id} record={r} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No attendance records yet.</p>
        )}
      </section>
    </div>
  );
}
