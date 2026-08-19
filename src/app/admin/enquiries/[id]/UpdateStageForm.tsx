"use client";

import { useActionState, useState } from "react";
import { updateStageAction, type UpdateStageState } from "../actions";

// Admin Platform save-feedback audit (2026-08-19) — a real attempt to
// change ENQ-2026-000007 to "Booked" appeared to silently revert, with
// no indication of whether it was saving, saved, or failed. Two
// compounding causes in the previous plain <form action={updateStageAction}>:
// the action returned void (no useActionState, so no success/error
// state existed to show at all), and the <select> used an uncontrolled
// defaultValue, which React never re-applies to an already-mounted
// element when its prop changes — so even a genuinely successful save
// had no reliable way to make the visible selection catch up with the
// new server-confirmed value.
//
// Fixed by making this a fully controlled select: `selected` is local
// state the admin's own onChange drives while composing a pick, but
// every time a submission resolves (success OR failure) it's
// explicitly resynced to `currentStage` — the prop passed down from
// the server component, which only changes after a real successful
// write + revalidation. On success this shows the newly persisted
// value; on failure (currentStage unchanged) it snaps back to the
// last real server-confirmed value rather than leaving a rejected
// attempt looking like it might have saved.
export default function UpdateStageForm({
  enquiryId,
  currentStage,
  stageOptions,
}: {
  enquiryId: string;
  currentStage: string;
  stageOptions: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<UpdateStageState, FormData>(updateStageAction, null);
  const [selected, setSelected] = useState(currentStage);

  // Resync to the server-confirmed value the instant a submission
  // resolves (success or failure) — computed during render, not in an
  // effect (React's own recommended pattern for "adjust state when a
  // prop changes"), so there's no extra render where a rejected
  // attempt still looks selected.
  const [resolvedState, setResolvedState] = useState(state);
  if (state !== resolvedState) {
    setResolvedState(state);
    setSelected(currentStage);
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <select
        name="stage"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        aria-busy={pending}
        className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink disabled:opacity-60"
      >
        {stageOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full min-h-11 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-body-small disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Saving…" : "Update Stage"}
      </button>
      {state?.ok === true && (
        <p
          role="status"
          aria-live="polite"
          className="font-sans text-body-small text-green-700 bg-green-50 rounded-lg px-4 py-3"
        >
          Stage updated{state.stageLabel ? ` to ${state.stageLabel}` : ""}.
        </p>
      )}
      {state?.ok === false && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
