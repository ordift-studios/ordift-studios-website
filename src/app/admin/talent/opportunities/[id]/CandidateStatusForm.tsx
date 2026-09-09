"use client";

import { useActionState } from "react";
import { transitionCandidateStatusAction, type TransitionCandidateStatusState } from "../../actions";
import { TALENT_CANDIDACY_STATUSES } from "@/lib/talent/talentCandidacyLifecycle";

// Opportunities Admin (2026-09-09) — one instance per candidate row.
// Same useActionState pending/success/error pattern as every other
// form this milestone; shows every candidacy status in the dropdown
// (matching OpportunityStatusForm.tsx's own reasoning) — an invalid
// jump (e.g. "candidate" straight to "booked") is refused by
// transitionCandidateStatus()'s own isValidCandidacyTransition() check
// and surfaced here as a clear error, not silently dropped.
export function CandidateStatusForm({
  candidacyId,
  opportunityId,
  profileId,
  currentStatus,
}: {
  candidacyId: string;
  opportunityId: string;
  profileId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState<TransitionCandidateStatusState, FormData>(transitionCandidateStatusAction, null);

  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="profileId" value={profileId} />
      <select
        name="toStatus"
        defaultValue={currentStatus}
        disabled={pending}
        aria-label="Candidate status"
        className="rounded-md border border-black/15 px-2 py-1 font-sans text-caption text-ordift-ink bg-white disabled:opacity-60"
      >
        {TALENT_CANDIDACY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-black/15 px-3 py-1 font-sans text-caption font-semibold text-ordift-ink disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Updated.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}
