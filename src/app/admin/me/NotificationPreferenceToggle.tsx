"use client";

import { useActionState } from "react";
import { setOwnNotificationPreferenceAction, type ActionState } from "./actions";

// My Workspace Notifications section (2026-09-16) — the only wired
// preference today. Never rendered for someone the toggle doesn't
// apply to (see page.tsx's own gate) — no fabricated categories.
export function NotificationPreferenceToggle({ category, label, initialEnabled }: { category: string; label: string; initialEnabled: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setOwnNotificationPreferenceAction, null);
  return (
    <form action={formAction} className="flex items-center justify-between gap-3 py-2">
      <span className="font-sans text-body-small text-ordift-ink">{label}</span>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="enabled" value={String(!initialEnabled)} />
      <button
        type="submit"
        disabled={pending}
        className={`shrink-0 font-sans text-caption font-semibold px-3 py-1.5 rounded-md disabled:opacity-50 ${
          initialEnabled ? "bg-ordift-navy-950 text-white" : "border border-black/15 text-ordift-ink-muted"
        }`}
      >
        {pending ? "Saving…" : initialEnabled ? "On" : "Off"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}
