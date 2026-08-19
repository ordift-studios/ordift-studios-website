"use client";

import { useActionState, useState } from "react";
import { setAmountDueAction, type SetAmountDueState } from "../actions";

// TD-043-era pattern (client-side half of the double-submit fix,
// mirroring CheckoutForm's own useActionState usage) — disables the
// input/button and shows "Saving…" for the duration of the pending
// request, so a slow response or an impatient click can't fire a
// second identical submission before the first one visibly resolves.
// The server-side half (setAmountDueAction's own atomic conditional-
// UPDATE guard) is the real backstop if this ever races anyway.
//
// Admin Platform save-feedback audit (2026-08-19) — extended with the
// same resync-on-resolved-state behavior added to UpdateStageForm: the
// input is now controlled, and every time a submission resolves
// (success or failure) it's explicitly resynced to `currentAmountDue`,
// the prop passed down from the server component. On success this
// shows the newly persisted value (not just what was typed); on
// failure it snaps back to the last real server-confirmed value
// instead of leaving a rejected attempt looking like it might have
// saved — plus a success confirmation, which this form previously had
// no way to show at all.
export default function SetAmountDueForm({
  enquiryId,
  currentAmountDue,
}: {
  enquiryId: string;
  currentAmountDue: number | null;
}) {
  const [state, formAction, pending] = useActionState<SetAmountDueState, FormData>(setAmountDueAction, null);
  const [amount, setAmount] = useState(currentAmountDue != null ? String(currentAmountDue) : "");

  // Resync to the server-confirmed value the instant a submission
  // resolves (success or failure) — computed during render, not in an
  // effect; see UpdateStageForm.tsx for the full rationale.
  const [resolvedState, setResolvedState] = useState(state);
  if (state !== resolvedState) {
    setResolvedState(state);
    setAmount(currentAmountDue != null ? String(currentAmountDue) : "");
  }

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
          aria-busy={pending}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
      {state?.ok === true && (
        <p
          role="status"
          aria-live="polite"
          className="font-sans text-body-small text-green-700 bg-green-50 rounded-lg px-4 py-3"
        >
          Amount updated.
        </p>
      )}
      {state?.ok === false && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
