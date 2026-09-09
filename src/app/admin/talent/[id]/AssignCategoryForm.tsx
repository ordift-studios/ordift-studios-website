"use client";

import { useActionState, useState } from "react";
import { assignTalentCategoryAction, type AssignCategoryState } from "../actions";

const inputClass = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink disabled:opacity-60";

// Assign-category button feedback (2026-09-09) — same narrow UX fix as
// AddCategoryForm.tsx/NewTalentForm.tsx: this form previously bound
// directly to the server action with no client wrapper, so a click
// gave no pending/disabled state and no success/error confirmation —
// the assignment simply appeared later on next render, or failed
// silently. assignTalentCategory()'s own logic — authorization,
// insert, duplicate protection, audit log — is untouched; this
// component only renders what the (now feedback-shaped) action
// returns.
//
// `confirmedCategoryName` is captured from the submitted FormData at
// the moment of submit, not looked up live from the `categories` prop
// — after a successful assignment the parent server component
// re-renders with a NARROWED `categories` list (the just-assigned
// category is no longer "unassigned"), which would otherwise make a
// live lookup fail right when the success message needs to show it.
export function AssignCategoryForm({
  profileId,
  categories,
}: {
  profileId: string;
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<AssignCategoryState, FormData>(assignTalentCategoryAction, null);
  const [confirmedCategoryName, setConfirmedCategoryName] = useState<string | null>(null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const categoryId = new FormData(event.currentTarget).get("categoryId");
        setConfirmedCategoryName(categories.find((c) => c.id === categoryId)?.name ?? null);
      }}
      className="flex items-end gap-3 flex-wrap pt-2 border-t border-black/10"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Assign category</span>
        <select name="categoryId" disabled={pending} className={inputClass}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg border border-black/15 px-4 py-2 font-sans text-caption font-semibold text-ordift-ink disabled:opacity-60"
      >
        {pending ? "Assigning…" : "Assign"}
      </button>
      {!pending && state?.ok === true && confirmedCategoryName && (
        <span className="font-sans text-caption text-green-700">{confirmedCategoryName} assigned successfully.</span>
      )}
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
    </form>
  );
}
