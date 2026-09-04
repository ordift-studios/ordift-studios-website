"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

// Payable Safety Hardening (2026-09-04), Part B/D — the reversibility/
// correction UI for a payable, using the existing status vocabulary
// (cancelled/reversed) rather than any destructive delete. Shared
// between Cancel (pending_approval/approved -> cancelled) and Reverse
// (approved/paid -> reversed) since both need the identical shape: a
// required reason, a confirm-before-submit guard naming the exact
// amount, and inline server-error feedback via useActionState — the
// only difference between the two call sites is which action/label is
// passed in.

type CorrectionState = { ok: boolean; error?: string } | null;

export default function PayableCorrectionForm({
  obligationId,
  amount,
  currency,
  action,
  actionLabel,
  pendingLabel,
  description,
}: {
  obligationId: string;
  amount: number;
  currency: string;
  action: (prevState: CorrectionState, formData: FormData) => Promise<CorrectionState>;
  actionLabel: string;
  pendingLabel: string;
  description: string;
}) {
  const [state, formAction] = useActionState<CorrectionState, FormData>(action, null);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-body-small text-green-800">{actionLabel} recorded.</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
        if (!reason) return; // let the required-field validation handle it
        const confirmed = window.confirm(`${actionLabel} this payable (${currency} ${amount})? This is recorded in the audit trail and cannot be undone from this screen.`);
        if (!confirmed) e.preventDefault();
      }}
      className="grid grid-cols-1 gap-3"
    >
      <input type="hidden" name="obligationId" value={obligationId} />

      {state?.ok === false && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}

      <p className="font-sans text-caption text-ordift-ink-muted">{description}</p>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Reason (required)</span>
        <textarea name="reason" required rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>

      <div>
        <SubmitCorrectionButton pendingLabel={pendingLabel}>{actionLabel}</SubmitCorrectionButton>
      </div>
    </form>
  );
}

// Local, tiny useFormStatus button — deliberately not reusing
// SubmitButton.tsx's styling defaults, since this action always needs
// the destructive-leaning red-bordered treatment, never the neutral
// black one every other Payables mutation button uses.
function SubmitCorrectionButton({ pendingLabel, children }: { pendingLabel: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg border border-red-300 text-red-700 px-4 py-2 font-sans text-body-small hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
