"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createInstructorAnnouncementAction, createInstructorBriefAction, type ActionState } from "./actions";

export type AnnouncementRow = { id: string; title: string; message: string; createdAt: string };
export type BriefRow = { id: string; title: string; dueAt: string | null };
export type MaterialRow = { id: string; title: string; visibility: string; externalUrl: string | null };

export function InstructorMaterialsList({ materials }: { materials: MaterialRow[] }) {
  if (materials.length === 0) return <p className="font-sans text-caption text-ordift-ink-muted">No materials shared for this workshop yet.</p>;
  return (
    <ul className="space-y-1">
      {materials.map((m) => (
        <li key={m.id} className="font-sans text-body-small text-ordift-ink">
          {m.externalUrl ? (
            <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">{m.title}</a>
          ) : (
            m.title
          )}
          <span className="text-ordift-ink-muted"> · {m.visibility}</span>
        </li>
      ))}
    </ul>
  );
}

export function InstructorAnnouncementsBlock({ workshopId, announcements }: { workshopId: string; announcements: AnnouncementRow[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createInstructorAnnouncementAction, null);
  return (
    <div className="space-y-2">
      {announcements.length === 0 ? (
        <p className="font-sans text-caption text-ordift-ink-muted">No announcements yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {announcements.map((a) => (
            <li key={a.id} className="font-sans text-body-small text-ordift-ink">
              <span className="font-medium">{a.title || "Announcement"}:</span> {a.message}
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap gap-2 pt-1">
        <input type="hidden" name="workshopId" value={workshopId} />
        <input name="title" placeholder="Title (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
        <input name="message" required placeholder="Message to participants…" className="flex-1 min-w-[10rem] rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
        <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "…" : "Post"}
        </button>
      </form>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
    </div>
  );
}

export function InstructorBriefsBlock({ workshopId, briefs }: { workshopId: string; briefs: BriefRow[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createInstructorBriefAction, null);
  return (
    <div className="space-y-2">
      {briefs.length === 0 ? (
        <p className="font-sans text-caption text-ordift-ink-muted">No creative briefs yet.</p>
      ) : (
        <ul className="space-y-1">
          {briefs.map((b) => (
            <li key={b.id}>
              <Link href={`/portal/instructor/workshops/${workshopId}/briefs/${b.id}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
                {b.title}
              </Link>
              {b.dueAt && <span className="font-sans text-caption text-ordift-ink-muted"> · Due {new Date(b.dueAt).toLocaleDateString("en-GB")}</span>}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="font-sans text-caption text-ordift-gold-pressed cursor-pointer">+ New brief</summary>
        <form action={formAction} className="space-y-2 mt-2">
          <input type="hidden" name="workshopId" value={workshopId} />
          <input name="title" required placeholder="Brief title" className="w-full rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <textarea name="instructions" required rows={2} placeholder="Instructions…" className="w-full rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
          <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
            {pending ? "Creating…" : "Create Brief"}
          </button>
          {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
        </form>
      </details>
    </div>
  );
}
