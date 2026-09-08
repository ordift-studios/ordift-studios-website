"use client";

import { useActionState } from "react";
import { createTalentCategoryAction, type CreateTalentCategoryState } from "./actions";

// Category-add button feedback (2026-09-09) — narrow UX fix only: the
// "Add category" form previously bound directly to the server action
// with no client wrapper, so a click gave no pending/disabled state and
// no success/error confirmation — the category simply appeared later
// on next render. Same useActionState pending/disabled/Saved-or-error
// pattern already established elsewhere in this Admin Portal (e.g.
// SourceEditForm.tsx, PolicyCheckPanel.tsx), reused rather than
// inventing a new one. createTalentCategory()'s own logic,
// authorization (requireProfileAdminister -> Super Admin override),
// and the talent_categories insert are completely unchanged — this
// component only renders what the action already returns.
export function AddCategoryForm() {
  const [state, formAction, pending] = useActionState<CreateTalentCategoryState, FormData>(createTalentCategoryAction, null);

  return (
    <form action={formAction} className="flex items-end gap-3 pt-2">
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">New category name</span>
        <input name="name" type="text" required disabled={pending} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink disabled:opacity-60" />
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg border border-black/15 px-4 py-2 font-sans text-caption font-semibold text-ordift-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add category"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Added</span>}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}
