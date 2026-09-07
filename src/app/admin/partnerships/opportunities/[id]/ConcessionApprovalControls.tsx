"use client";

import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { approveConcessionAction, rejectValueAssessmentAction } from "../../actions";

// Partnerships & Collaborations V1 (2026-09-07) — concession approval
// is the single most safety-critical action in this system: it is the
// only thing that ever marks a value assessment "approved". The
// server-side approveConcessionAssessment() re-checks the exact tiered
// authorization for the assessment's band regardless of what this
// button shows — this UI-level confirmation is a human guard-rail on
// top of that real boundary, same established pattern as every other
// high-consequence action in this codebase (ConfirmSubmitButton).
export default function ConcessionApprovalControls({ assessmentId, opportunityId }: { assessmentId: string; opportunityId: string }) {
  return (
    <div className="flex gap-2 mt-2">
      <form action={approveConcessionAction}>
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <ConfirmSubmitButton
          confirmMessage="Approve this concession? The server will independently verify you hold the exact authority required for this concession band — a lower-tier approval can never be used for a higher band."
          pendingLabel="Approving…"
          className="rounded-lg border border-green-600 text-green-700 px-3 py-1.5 font-sans text-caption"
        >
          Approve
        </ConfirmSubmitButton>
      </form>
      <form action={rejectValueAssessmentAction}>
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <button type="submit" className="rounded-lg border border-red-600 text-red-700 px-3 py-1.5 font-sans text-caption">Reject</button>
      </form>
    </div>
  );
}
