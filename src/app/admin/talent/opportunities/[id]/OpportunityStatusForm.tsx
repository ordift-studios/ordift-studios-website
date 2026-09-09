"use client";

import { useActionState } from "react";
import { transitionOpportunityStatusAction, type TransitionOpportunityStatusState } from "../../actions";
import { TALENT_OPPORTUNITY_STATUSES } from "@/lib/talent/talentOpportunityLifecycle";

// Opportunities Admin (2026-09-09) — same useActionState pending/
// success/error pattern as every other form built this milestone.
// Shows every status in the dropdown (not just the valid next ones)
// deliberately, matching the existing precedent already established by
// the Representation/Publication status forms on
// /admin/talent/[id]/page.tsx — an invalid jump is refused by
// transitionOpportunityStatus()'s own isValidOpportunityTransition()
// check, surfaced here as a clear error rather than a silent failure
// (an improvement over those older forms, which predate the
// useActionState feedback pattern — not a redesign of them).
export function OpportunityStatusForm({ opportunityId, currentStatus }: { opportunityId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState<TransitionOpportunityStatusState, FormData>(transitionOpportunityStatusAction, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">New status</span>
        <select
          name="toStatus"
          defaultValue={currentStatus}
          disabled={pending}
          className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink bg-white disabled:opacity-60"
        >
          {TALENT_OPPORTUNITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-ordift-navy-950 text-ordift-gold px-4 py-2 font-sans text-caption font-semibold disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update status"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Status updated.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}
