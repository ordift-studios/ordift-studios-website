"use client";

import { useActionState } from "react";
import { createDeliverableAction, type CreateDeliverableState } from "@/app/admin/deliverables/actions";
import type { DeliverableCategory, DeliverableEntityType } from "@/lib/admin/deliverables";

// CRM Lifecycle Automation Phase 1, Batch 5 (2026-08-20) — extracted
// from DeliverablesManager.tsx (a server component) into its own small
// client component, the same pattern already used for
// UpdateStageForm/SetAmountDueForm/StartHandlingButton, so only this
// one form needs client-side interactivity rather than converting the
// whole deliverables list/delete/category UI. Disables the submit
// button (and every field) while a submission is pending — the
// primary defense against an accidental double-publish now that
// publishing also sends a client-facing email, matching the
// established useActionState save-feedback pattern.
export default function PublishDeliverableForm({
  entityType,
  entityId,
  categories,
}: {
  entityType: DeliverableEntityType;
  entityId: string;
  categories: DeliverableCategory[];
}) {
  const [state, formAction, pending] = useActionState<CreateDeliverableState, FormData>(
    createDeliverableAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-60">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deliverable-title" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Title
            </label>
            <input
              id="deliverable-title"
              type="text"
              name="title"
              required
              placeholder="e.g. Final Edited Gallery"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <div>
            <label htmlFor="deliverable-category" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Category
            </label>
            <select
              id="deliverable-category"
              name="categoryId"
              required
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="deliverable-description" className="font-sans text-caption text-ordift-ink-muted block mb-1">
            Description (optional)
          </label>
          <input
            id="deliverable-description"
            type="text"
            name="description"
            className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deliverable-url" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Link
            </label>
            <input
              id="deliverable-url"
              type="url"
              name="url"
              required
              placeholder="https://…"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <div>
            <label htmlFor="deliverable-thumbnail" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Thumbnail URL (optional)
            </label>
            <input
              id="deliverable-thumbnail"
              type="url"
              name="thumbnailUrl"
              placeholder="https://…"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Publishing…" : "Publish Deliverable"}
      </button>
      {state?.ok === false && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
