"use client";

import { useActionState, useState } from "react";
import { advanceAgreementLifecycleStatusAction, type AgreementLifecycleActionState } from "./actions";
import type { AgreementLifecycleStatus } from "@/lib/legal/agreementLifecycle";

const STATUS_LABELS: Partial<Record<AgreementLifecycleStatus, string>> = {
  draft: "Draft",
  internal_review: "Internal Review",
  approved_for_issue: "Approved for Issue",
};

// A single forward step. draft -> internal_review is reversible
// (internal_review can still return to draft) so it gets a plain
// button; internal_review -> approved_for_issue has no path back to
// draft/internal_review in the canonical state machine
// (agreementLifecycle.ts's VALID_TRANSITIONS), so it gets the same
// expand-to-confirm pattern this codebase already uses for other
// one-way actions, proportionate to a status change rather than a data
// deletion (no retyping required, unlike DeleteProjectButton.tsx).
function LifecycleStepForm({
  agreementId,
  fromStatus,
  toStatus,
  buttonLabel,
  irreversible,
}: {
  agreementId: string;
  fromStatus: AgreementLifecycleStatus;
  toStatus: AgreementLifecycleStatus;
  buttonLabel: string;
  irreversible: boolean;
}) {
  const [state, formAction, pending] = useActionState<AgreementLifecycleActionState, FormData>(advanceAgreementLifecycleStatusAction, null);
  const [confirming, setConfirming] = useState(false);

  const succeeded = !pending && state?.ok === true;

  const form = (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="fromStatus" value={fromStatus} />
      <input type="hidden" name="toStatus" value={toStatus} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : `Yes, ${buttonLabel}`}
      </button>
      {irreversible && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="font-sans text-caption font-medium px-3 py-1.5 rounded-md border border-black/15"
        >
          Cancel
        </button>
      )}
    </form>
  );

  if (succeeded) {
    return (
      <p role="status" aria-live="polite" className="font-sans text-caption text-green-700">
        Moved to {STATUS_LABELS[state.toStatus] ?? state.toStatus.replace(/_/g, " ")}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {irreversible && !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white"
        >
          {buttonLabel}
        </button>
      ) : irreversible ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="font-sans text-caption text-amber-800">
            This cannot be reversed back to Draft or Internal Review once approved. Confirm you want to proceed.
          </p>
          {form}
        </div>
      ) : (
        form
      )}
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

// Founder-facing lifecycle bridge (2026-09-15) — see actions.ts for the
// full rationale. Shows exactly one next step at a time, driven by the
// agreement's real current status, so an action disappears the moment
// it is no longer valid (the page revalidates after every successful
// transition). Never offers a status this component/action pair
// doesn't explicitly recognize.
export function AgreementLifecycleActions({ agreementId, status }: { agreementId: string; status: AgreementLifecycleStatus }) {
  if (status === "draft") {
    return (
      <div className="space-y-2">
        <p className="font-sans text-caption text-ordift-ink-muted">
          Next step: move this draft to Internal Review. This does not send, sign, or execute anything, and can be
          returned to Draft afterward if a correction is needed.
        </p>
        <LifecycleStepForm agreementId={agreementId} fromStatus="draft" toStatus="internal_review" buttonLabel="Move to Internal Review" irreversible={false} />
      </div>
    );
  }

  if (status === "internal_review") {
    return (
      <div className="space-y-2">
        <p className="font-sans text-caption text-ordift-ink-muted">
          Next step: approve this agreement for issue. Approving does not send, sign, or execute anything — it
          authorizes the next stage.
        </p>
        <LifecycleStepForm
          agreementId={agreementId}
          fromStatus="internal_review"
          toStatus="approved_for_issue"
          buttonLabel="Approve for Issue"
          irreversible={true}
        />
      </div>
    );
  }

  if (status === "approved_for_issue") {
    return (
      <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Approved for Issue. CONFIGURATION REQUIRED: real issuance (recording the issued document and sending it to
        Mishael for signature) requires a document-rendering/export pipeline that does not exist in this codebase yet
        — no further action is offered here rather than fabricating a Send/Sign/Execute control that would not
        actually deliver or sign anything.
      </p>
    );
  }

  return null;
}
