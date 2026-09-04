"use client";

import { useActionState, useState } from "react";
import { PAYMENT_METHOD_LABELS, verificationStatusLabel, type PaymentMethod } from "@/lib/payables/paymentDestinationShared";
import SubmitButton from "@/components/admin/SubmitButton";

// Phase G.4A (2026-09-04) — the required checkpoint between Approve
// and Record Payment: Ordift's first real paid payable must not reach
// "paid" with zero record of which verified destination it was
// actually paid to. This component never receives or displays a full
// account/routing identifier — only the same masked representation
// (`•••• 5345`) already used everywhere else in Payables — and never
// silently binds a destination on page load, even when there is
// exactly one candidate: an explicit click is always required, and
// with more than one candidate none is pre-selected, forcing a real
// choice rather than trusting a possibly-wrong default.

type SelectDestinationState = { ok: boolean; error?: string } | null;

export type DestinationOption = {
  id: string;
  method: string;
  institutionName: string | null;
  accountHolderName: string;
  maskedIdentifier: string | null;
};

export type CurrentDestinationSelection = {
  method: string;
  institutionName: string | null;
  accountHolderName: string;
  maskedIdentifier: string | null;
  verificationStatusAtSelection: string;
};

export default function PaymentDestinationSelector({
  obligationId,
  currentSelection,
  availableDestinations,
  selectAction,
}: {
  obligationId: string;
  currentSelection: CurrentDestinationSelection | null;
  availableDestinations: DestinationOption[];
  selectAction: (prevState: SelectDestinationState, formData: FormData) => Promise<SelectDestinationState>;
}) {
  const [state, formAction] = useActionState<SelectDestinationState, FormData>(selectAction, null);
  const [changing, setChanging] = useState(false);

  // Same established pattern as PaymentDestinationForm.tsx/
  // EditEngagementForm.tsx: a successful submission renders a plain
  // confirmation, not an attempt to reconstruct the just-selected
  // destination client-side. selectPayableDestinationAction's
  // revalidatePath() brings the definitive, server-verified selection
  // back into `currentSelection` on the next render of this route.
  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-body-small text-green-800">Destination confirmed.</p>
      </div>
    );
  }

  if (currentSelection && !changing) {
    return (
      <div className="rounded-lg border border-black/10 p-4">
        <p className="font-sans text-caption text-ordift-ink-muted mb-1">
          {PAYMENT_METHOD_LABELS[currentSelection.method as PaymentMethod] ?? currentSelection.method}
        </p>
        <p className="font-sans text-body-small text-ordift-ink">{currentSelection.institutionName ?? "—"}</p>
        <p className="font-sans text-body-small text-ordift-ink">{currentSelection.accountHolderName}</p>
        <p className="font-sans text-body-small text-ordift-ink">{currentSelection.maskedIdentifier ?? "—"}</p>
        <p className="font-sans text-caption text-green-700 mt-1">{verificationStatusLabel(currentSelection.verificationStatusAtSelection)}</p>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="mt-3 rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30"
        >
          Change destination
        </button>
      </div>
    );
  }

  if (availableDestinations.length === 0) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="font-sans text-body-small text-red-800">No active, verified payment destination exists for this payee. Verify or add one first.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-black/10 p-4">
      <input type="hidden" name="obligationId" value={obligationId} />

      {state?.ok === false && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {availableDestinations.map((d) => (
          <label key={d.id} className="flex items-start gap-2 rounded border border-black/10 p-3 cursor-pointer">
            <input type="radio" name="instructionId" value={d.id} defaultChecked={availableDestinations.length === 1} required className="mt-1" />
            <span>
              <span className="block font-sans text-caption text-ordift-ink-muted">{PAYMENT_METHOD_LABELS[d.method as PaymentMethod] ?? d.method}</span>
              <span className="block font-sans text-body-small text-ordift-ink">{d.institutionName ?? "—"}</span>
              <span className="block font-sans text-body-small text-ordift-ink">{d.accountHolderName}</span>
              <span className="block font-sans text-body-small text-ordift-ink">{d.maskedIdentifier ?? "—"}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Confirming…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          {availableDestinations.length === 1 ? "Confirm Destination" : "Select Destination"}
        </SubmitButton>
        {changing && (
          <button type="button" onClick={() => setChanging(false)} className="font-sans text-caption text-ordift-ink-muted underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
