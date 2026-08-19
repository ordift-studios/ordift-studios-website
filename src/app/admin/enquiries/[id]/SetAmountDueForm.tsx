"use client";

import { useActionState } from "react";
import { setAmountDueAction, type SetAmountDueState } from "../actions";

// TD-043-era pattern (client-side half of the double-submit fix,
// mirroring CheckoutForm's own useActionState usage) — disables the
// button and shows a saving/error state for the duration of the
// pending request, so a slow response or an impatient click can't fire
// a second identical submission before the first one visibly resolves.
// The server-side half (setAmountDueAction's own no-op-on-unchanged-
// value guard) is the real backstop if this ever races anyway.
export default function SetAmountDueForm({
  enquiryId,
  currentAmountDue,
}: {
  enquiryId: string;
  currentAmountDue: number | null;
}) {
  const [state, formAction, pending] = useActionState<SetAmountDueState, FormData>(setAmountDueAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <div>
        <label htmlFor="amount-due" className="font-sans text-caption text-ordift-ink-muted block mb-1">
          Set Amount Due (USD)
        </label>
        <input
          id="amount-due"
          name="amountDue"
          type="number"
          step="0.01"
          min="0.01"
          max="1000000"
          required
          disabled={pending}
          defaultValue={currentAmountDue ?? ""}
          placeholder="e.g. 1500.00"
          className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full min-h-11 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-body-small disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Saving…" : currentAmountDue != null ? "Update Amount Due" : "Set Amount Due"}
      </button>
      {state?.ok === false && (
        <p role="alert" className="font-sans text-caption text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
