"use client";

import { useActionState } from "react";
import { createOpportunityAction, type CreateOpportunityState } from "../../actions";
import type { TalentCategory } from "@/lib/talent/talentProfiles";

// Opportunities Admin (2026-09-09) — same useActionState pending/
// disabled/success-or-error pattern as NewTalentForm.tsx. On success
// createOpportunityAction itself redirects to the new opportunity's
// detail page, so there's no separate "Created" state to render here —
// only pending/error are this component's own responsibility.
export function NewOpportunityForm({ categories }: { categories: TalentCategory[] }) {
  const [state, formAction, pending] = useActionState<CreateOpportunityState, FormData>(createOpportunityAction, null);

  return (
    <form action={formAction} className="max-w-xl space-y-5 bg-white rounded-lg border border-ordift-ink/10 p-6">
      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Title</label>
        <input
          name="title"
          type="text"
          required
          disabled={pending}
          className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60"
        />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Description (optional)</label>
        <textarea name="description" rows={3} disabled={pending} className="w-full rounded-md border border-black/15 px-3 py-2 font-sans text-body-small bg-white disabled:opacity-60" />
      </div>

      <div>
        <label className="block font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Category (optional)</label>
        <select name="categoryId" disabled={pending} className="w-full min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60">
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="min-h-10 px-5 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create Opportunity"}
        </button>
        {!pending && state?.ok === false && <span className="font-sans text-body-small text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
