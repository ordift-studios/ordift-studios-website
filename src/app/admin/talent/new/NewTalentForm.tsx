"use client";

import { useActionState } from "react";
import { createTalentProfileAction, type CreateTalentProfileState } from "../actions";
import type { TalentOnboardingCandidate } from "@/lib/talent/talentOverview";
import type { TalentCategory } from "@/lib/talent/talentProfiles";

// Admin onboarding, "Add Talent" (2026-09-09) — same useActionState
// pending/disabled/success-or-error pattern already established for
// AddCategoryForm.tsx/SourceEditForm.tsx, reused rather than invented
// fresh. On success the action itself redirects to
// /admin/talent/[id] (createTalentProfileAction calls redirect()), so
// there's no separate "Created" state to render here — the redirect
// away IS the success confirmation; only the pending/error states are
// this component's own responsibility.
export function NewTalentForm({
  candidates,
  categories,
  representationStatuses,
}: {
  candidates: TalentOnboardingCandidate[];
  categories: TalentCategory[];
  representationStatuses: string[];
}) {
  const [state, formAction, pending] = useActionState<CreateTalentProfileState, FormData>(createTalentProfileAction, null);

  return (
    <form action={formAction} className="max-w-xl space-y-5 bg-white rounded-lg border border-ordift-ink/10 p-6">
      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Person</label>
        <select name="profileId" required disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white">
          {candidates.map((c) => (
            <option key={c.profileId} value={c.profileId}>
              {c.memberNumber ?? c.name ?? c.profileId}
            </option>
          ))}
        </select>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Only people who already hold the Model account role are listed.</p>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Category (optional)</label>
        <select name="categoryId" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white">
          <option value="">— None yet —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Representation status</label>
        <select
          name="representationStatus"
          defaultValue="unrepresented"
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white"
        >
          {representationStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted italic">
        Created as Draft. Never publicly visible — publication is a separate, deliberate step on the talent&apos;s own page afterward.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create Talent"}
        </button>
        {state?.ok === false && <span className="font-sans text-body-small text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
