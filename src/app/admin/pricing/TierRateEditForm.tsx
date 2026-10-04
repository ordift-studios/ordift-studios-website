"use client";

import { useActionState } from "react";
import { createWeddingEventTierRateVersionAction } from "./actions";
import type { TierRateSaveState } from "./tierRateSave";

// Same useActionState pattern as the Workshop dashboard forms: the
// button disables while the save is in flight (no accidental repeat
// submission), and the result is shown only after the server action
// actually returns — success on a real write, a plain error otherwise.
export default function TierRateEditForm({
  marketSlug,
  category,
  serviceMode,
  tierSlug,
  currentPriceUsd,
}: {
  marketSlug: string;
  category: string;
  serviceMode: string;
  tierSlug: string;
  currentPriceUsd: number | undefined;
}) {
  const [state, formAction, pending] = useActionState<TierRateSaveState, FormData>(createWeddingEventTierRateVersionAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
      <input type="hidden" name="marketSlug" value={marketSlug} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="serviceMode" value={serviceMode} />
      <input type="hidden" name="tierSlug" value={tierSlug} />
      <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={currentPriceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      <button type="submit" disabled={pending} className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small disabled:opacity-50">
        {pending ? "Saving…" : "Save new version"}
      </button>
      {!pending && state?.ok === true && (
        <p role="status" className="sm:col-span-4 font-sans text-caption text-green-700">{state.message}</p>
      )}
      {!pending && state?.ok === false && (
        <p role="alert" className="sm:col-span-4 font-sans text-caption text-red-700">{state.error}</p>
      )}
    </form>
  );
}
