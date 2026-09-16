"use client";

import { useActionState } from "react";
import { recordWorkshopAttendanceAction, type ActionState } from "./actions";

export type RosterRow = { id: string; fullName: string; registrationStatus: string; attendanceStatus: string | null };

function AttendanceButton({ workshopId, registrationId, targetStatus, label, active }: { workshopId: string; registrationId: string; targetStatus: "checked_in" | "no_show"; label: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordWorkshopAttendanceAction, null);
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="workshopId" value={workshopId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="attendanceStatus" value={targetStatus} />
      <button
        type="submit"
        disabled={pending}
        className={`font-sans text-caption font-semibold px-2.5 py-1 rounded-md disabled:opacity-50 ${
          active ? "bg-ordift-navy-950 text-white" : "border border-black/15 text-ordift-ink-muted"
        }`}
      >
        {pending ? "…" : label}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700 mt-0.5">{state.error}</p>}
    </form>
  );
}

export function AttendanceRoster({ workshopId, registrations }: { workshopId: string; registrations: RosterRow[] }) {
  if (registrations.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted">No registrations for this workshop yet.</p>;
  }
  return (
    <ul className="divide-y divide-black/5">
      {registrations.map((r) => (
        <li key={r.id} className="py-2 flex items-center justify-between gap-3">
          <span className="font-sans text-body-small text-ordift-ink">
            {r.fullName} <span className="text-ordift-ink-muted">({r.registrationStatus})</span>
          </span>
          <div className="flex gap-1.5 shrink-0">
            <AttendanceButton workshopId={workshopId} registrationId={r.id} targetStatus="checked_in" label="Checked In" active={r.attendanceStatus === "checked_in"} />
            <AttendanceButton workshopId={workshopId} registrationId={r.id} targetStatus="no_show" label="No Show" active={r.attendanceStatus === "no_show"} />
          </div>
        </li>
      ))}
    </ul>
  );
}
