import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/workspace";
import { getWorkshopRegistrationByIdForUser } from "@/lib/portal/data";
import { listSessionsForParticipant } from "@/lib/workshops/sessions";

function formatTime(t: string): string {
  return t.slice(0, 5);
}

// Workshop Learning Infrastructure V1 (2026-09-19) — the real, dated
// session schedule for a workshop the caller is genuinely registered
// on. listSessionsForParticipant() re-verifies registration ownership
// independently of this route's own kind/id params.
export default async function ScheduleTabPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isProjectKind(kind) || kind !== "workshop") notFound();
  const user = await getCurrentUser();
  if (!user) return null;

  const registration = await getWorkshopRegistrationByIdForUser(id, user.id);
  if (!registration) return null;

  const sessions = await listSessionsForParticipant(registration.workshopId, user.id);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      {sessions.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          No detailed session schedule has been published yet — see Booking Details for the overall workshop dates.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {sessions.map((s) => (
            <li key={s.id} className="py-3">
              <p className="font-sans text-body-small font-medium text-ordift-ink">
                {s.sessionDate} · {formatTime(s.startTime)}
                {s.endTime ? `–${formatTime(s.endTime)}` : ""} — {s.title}
              </p>
              {s.description && <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{s.description}</p>}
              {s.locationOverride && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{s.locationOverride}</p>}
              {s.participantNotes && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{s.participantNotes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
