"use client";

import { useActionState } from "react";
import { createSessionAction, deleteSessionAction, type ActionState } from "./actions";

export type SessionRow = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string | null;
  sessionType: string;
  instructorProfileId: string | null;
  locationOverride: string | null;
};

function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function SessionList({ workshopId, sessions, people }: { workshopId: string; sessions: SessionRow[]; people: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteSessionAction, null);
  const nameById = new Map(people.map((p) => [p.id, p.label] as const));

  return (
    <div className="space-y-3">
      {sessions.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          No sessions scheduled yet — a simple one-day workshop doesn&rsquo;t require any. The workshop&rsquo;s own
          start/end date (set on the Edit Workshop page) still governs the public-facing schedule.
        </p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {sessions.map((s) => (
            <li key={s.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="font-sans text-body-small text-ordift-ink">
                  {s.sessionDate} · {formatTime(s.startTime)}
                  {s.endTime ? `–${formatTime(s.endTime)}` : ""} — {s.title}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {s.sessionType}
                  {s.instructorProfileId ? ` · ${nameById.get(s.instructorProfileId) ?? "Unknown instructor"}` : ""}
                  {s.locationOverride ? ` · ${s.locationOverride}` : ""}
                </p>
              </div>
              <form action={formAction}>
                <input type="hidden" name="sessionId" value={s.id} />
                <input type="hidden" name="workshopId" value={workshopId} />
                <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-ink-muted hover:text-red-700 underline underline-offset-4 disabled:opacity-50 whitespace-nowrap">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

export function CreateSessionForm({ workshopId, people }: { workshopId: string; people: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createSessionAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input type="hidden" name="workshopId" value={workshopId} />
      <input type="date" name="sessionDate" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <div className="flex gap-2">
        <input type="time" name="startTime" required placeholder="Start" className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
        <input type="time" name="endTime" placeholder="End (optional)" className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      </div>
      <input name="title" placeholder="Title (e.g. Lighting Principles)" required className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <textarea name="description" rows={2} placeholder="Description (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      <select name="sessionType" defaultValue="session" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="session">Session</option>
        <option value="break">Break</option>
        <option value="practical">Practical</option>
        <option value="critique">Critique</option>
      </select>
      <select name="instructorProfileId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">No specific instructor for this block</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <input name="locationOverride" placeholder="Venue/room or online link override (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input name="participantNotes" placeholder="Note visible to participants (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <button type="submit" disabled={pending} aria-busy={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Adding…" : "Add Session"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-amber-700">{state.error}</p>}
      {!pending && state?.ok === true && <p className="sm:col-span-2 font-sans text-caption text-green-700">Session added.</p>}
    </form>
  );
}
