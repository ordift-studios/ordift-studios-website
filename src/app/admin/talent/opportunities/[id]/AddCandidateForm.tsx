"use client";

import { useActionState } from "react";
import { addCandidateToOpportunityAction, type AddCandidateState } from "../../actions";
import type { TalentCandidateOption } from "@/lib/talent/talentOverview";

// Opportunities Admin (2026-09-09) — same useActionState pending/
// success/error pattern as AssignCategoryForm.tsx. `candidates` is
// already filtered upstream (listAvailableCandidatesForOpportunity())
// to only people not already a candidate for this opportunity — the
// primary duplicate-protection layer; a rare race-condition duplicate
// still surfaces here as a clear message via addCandidateToOpportunity()'s
// 23505 handling, same two-layer pattern already used for Categories.
export function AddCandidateForm({ opportunityId, candidates }: { opportunityId: string; candidates: TalentCandidateOption[] }) {
  const [state, formAction, pending] = useActionState<AddCandidateState, FormData>(addCandidateToOpportunityAction, null);

  if (candidates.length === 0) {
    return (
      <p className="font-sans text-body-small text-ordift-ink-muted italic">
        Every existing talent is already a candidate for this opportunity, or no talent profiles exist yet.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap pt-2 border-t border-black/10">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Add candidate</span>
        <select name="profileId" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60">
          {candidates.map((c) => (
            <option key={c.profileId} value={c.profileId}>
              {c.memberNumber ?? c.name ?? c.profileId}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-ordift-navy-950 text-white px-4 py-2 font-sans text-caption font-semibold disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add candidate"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Candidate added.</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}
