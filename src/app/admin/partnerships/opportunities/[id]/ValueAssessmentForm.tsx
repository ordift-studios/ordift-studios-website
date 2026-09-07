"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createValueAssessmentAction } from "../../actions";

// Partnerships & Collaborations V1 (2026-09-07) — records a new
// NCV/PCV/RCV/Cash assessment. Always creates a NEW row (see
// createValueAssessment()'s append-only doc comment) — this form never
// edits a prior approved assessment in place. Client-side wrapper only
// so the inline error/refusal message (e.g. "NCV must be greater than
// zero") is genuinely surfaced rather than silently logged server-side.
export default function ValueAssessmentForm({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData: FormData) => {
        setBusy(true);
        setError(null);
        const result = await createValueAssessmentAction(formData);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
        }
        setBusy(false);
      }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />

      <fieldset className="sm:col-span-2 rounded-lg border border-black/10 p-3 space-y-2">
        <legend className="font-sans text-caption font-medium text-ordift-ink px-1">Normal Commercial Value (NCV) — what Ordift would normally charge</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="ncvAmount" type="number" step="0.01" min="0.01" required placeholder="NCV amount (USD)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="ncvBasis" placeholder="Basis (e.g. which pricing engine)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        </div>
        <input name="ncvSourceReference" placeholder="Source reference (link to a specific estimate, if applicable)" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <textarea name="ncvExplanation" placeholder="Explanation" rows={2} className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </fieldset>

      <fieldset className="sm:col-span-2 rounded-lg border border-black/10 p-3 space-y-2">
        <legend className="font-sans text-caption font-medium text-ordift-ink px-1">Partner Claimed Value (PCV) — what the partner says it&rsquo;s worth (optional)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="pcvAmount" type="number" step="0.01" min="0" placeholder="PCV amount (USD)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="pcvDescription" placeholder="What the partner claims" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">Never automatically becomes RCV below.</p>
      </fieldset>

      <fieldset className="sm:col-span-2 rounded-lg border border-black/10 p-3 space-y-2">
        <legend className="font-sans text-caption font-medium text-ordift-ink px-1">Recognised Collaboration Value (RCV) — what Ordift formally recognises</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="rcvAmount" type="number" step="0.01" min="0" required placeholder="RCV amount (USD) — ignored if Class C" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <select name="rcvValueClass" required defaultValue="class_c_speculative" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="class_a_hard_replacement">Class A — Hard / Replacement Value</option>
            <option value="class_b_measurable_commercial">Class B — Measurable Commercial Value (auto-recognisable up to 50% of NCV)</option>
            <option value="class_c_speculative">Class C — Speculative (exposure, followers, etc.) — always $0</option>
          </select>
        </div>
        <input name="rcvValuationMethod" placeholder="Valuation method" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <input name="rcvEvidenceReference" placeholder="Evidence/reference" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <textarea name="rcvReason" placeholder="Reason" rows={2} className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </fieldset>

      <input name="cashConsiderationAmount" type="number" step="0.01" min="0" required defaultValue="0" placeholder="Cash consideration (USD)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />

      {error && <p className="font-sans text-caption text-red-700 sm:col-span-2">{error}</p>}

      <button type="submit" disabled={busy} className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2 disabled:opacity-50">
        {busy ? "Saving…" : "Save Value Assessment"}
      </button>
    </form>
  );
}
