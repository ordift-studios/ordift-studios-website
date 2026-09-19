"use client";

import { useActionState } from "react";
import { giveFeedbackAsAdminAction, type ActionState } from "../../../actions";

export function GiveFeedbackForm({ workshopId, briefId, submissionId }: { workshopId: string; briefId: string; submissionId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(giveFeedbackAsAdminAction, null);
  return (
    <form action={formAction} className="space-y-2 pt-2 border-t border-black/5">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <input type="hidden" name="briefId" value={briefId} />
      <textarea name="feedbackText" required rows={2} placeholder="Critique / feedback…" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      <div className="flex items-center gap-2">
        <select name="status" defaultValue="reviewed" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-caption">
          <option value="reviewed">Reviewed</option>
          <option value="revision_requested">Revision Requested</option>
        </select>
        <button type="submit" disabled={pending} aria-busy={pending} className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Saving…" : "Give Feedback"}
        </button>
      </div>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
      {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Feedback recorded.</p>}
    </form>
  );
}
