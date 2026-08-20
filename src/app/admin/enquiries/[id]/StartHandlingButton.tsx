"use client";

import { useActionState } from "react";
import { startHandlingAction, type StartHandlingState } from "../actions";

// CRM Lifecycle Automation Phase 1, Batch 4 (2026-08-20) — a single
// deliberate action, not a dropdown: available to Staff (unlike the
// general CRM Stage editor above, which is Admin/Super Admin only),
// but hard-scoped server-side to exactly one transition
// (new_lead -> contacted). Same useActionState save-feedback pattern
// as UpdateStageForm.tsx, since a plain fire-and-forget action here
// would repeat the exact silent-revert problem that fix addressed.
export default function StartHandlingButton({ enquiryId }: { enquiryId: string }) {
  const [state, formAction, pending] = useActionState<StartHandlingState, FormData>(startHandlingAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full min-h-11 rounded-full bg-ordift-navy-950 text-white font-sans font-semibold text-body-small disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Starting…" : "Start Handling"}
      </button>
      {state?.ok === false && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
