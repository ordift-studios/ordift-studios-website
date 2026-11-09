"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { RESOLUTIONS, RESOLUTION_LABELS } from "@/lib/payments/reviewCases";
import { resolveReviewCaseAction } from "./reviewCaseActions";

// Keeps what was typed after a refusal (ActionForm restores it) and ignores a second press while one is running (SubmitButton).
export default function ResolveReviewCaseForm({ caseId }: { caseId: string }) {
  return (
    <ActionForm action={resolveReviewCaseAction} className="mt-3 grid gap-2 sm:grid-cols-3">
      <input type="hidden" name="caseId" value={caseId} />
      <select name="resolution" required defaultValue="" aria-label="How was it resolved" className="min-h-10 rounded-lg border border-black/15 bg-white px-2 font-sans text-caption sm:col-span-1">
        <option value="" disabled>How was it resolved…</option>
        {RESOLUTIONS.map((r) => <option key={r} value={r}>{RESOLUTION_LABELS[r]}</option>)}
      </select>
      <input name="note" required minLength={10} placeholder="What you checked and what you did" aria-label="Resolution note" className="min-h-10 rounded-lg border border-black/15 px-3 font-sans text-caption sm:col-span-2" />
      <div className="sm:col-span-3"><SubmitButton pendingLabel="Saving…">Record resolution</SubmitButton></div>
    </ActionForm>
  );
}
