"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createAnnouncementAction, createBriefAction, type ActionState } from "./actions";

export type AnnouncementRow = { id: string; title: string; message: string; createdAt: string };
export type BriefRow = { id: string; title: string; instructions: string; dueAt: string | null };

export function AnnouncementsPanel({ workshopId, announcements }: { workshopId: string; announcements: AnnouncementRow[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createAnnouncementAction, null);
  return (
    <div className="space-y-4">
      {announcements.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No announcements posted yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {announcements.map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small font-medium text-ordift-ink">{a.title || "Announcement"}</p>
              <p className="font-sans text-body-small text-ordift-ink-muted">{a.message}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">{new Date(a.createdAt).toLocaleString("en-GB")}</p>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="workshopId" value={workshopId} />
        <input name="title" placeholder="Announcement title (optional)" className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
        <textarea name="message" required rows={2} placeholder="e.g. Venue changed to Studio B for tomorrow's session." className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <button type="submit" disabled={pending} aria-busy={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Posting…" : "Post Announcement"}
        </button>
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Posted.</p>}
      </form>
    </div>
  );
}

export function BriefsPanel({ workshopId, briefs }: { workshopId: string; briefs: BriefRow[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBriefAction, null);
  return (
    <div className="space-y-4">
      {briefs.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No creative briefs yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {briefs.map((b) => (
            <li key={b.id} className="px-4 py-2.5">
              <Link href={`/admin/workshops/${workshopId}/briefs/${b.id}`} className="font-sans text-body-small font-medium text-ordift-gold-pressed underline underline-offset-4">
                {b.title}
              </Link>
              <p className="font-sans text-caption text-ordift-ink-muted">{b.dueAt ? `Due ${new Date(b.dueAt).toLocaleString("en-GB")}` : "No due date"}</p>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="workshopId" value={workshopId} />
        <input name="title" required placeholder="Brief title (e.g. Golden Hour Portrait Exercise)" className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
        <textarea name="instructions" required rows={3} placeholder="Instructions…" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <input name="dueAt" type="datetime-local" title="Due date (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
        <button type="submit" disabled={pending} aria-busy={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Creating…" : "Create Brief"}
        </button>
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Brief created.</p>}
      </form>
    </div>
  );
}
