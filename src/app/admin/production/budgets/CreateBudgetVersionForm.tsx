"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBudgetVersionAction } from "../actions";

const STATUS_OPTIONS = [
  { slug: "estimate", label: "Estimate" },
  { slug: "supplier_quoted", label: "Supplier-Quoted" },
  { slug: "internal_approved", label: "Internally Approved" },
  { slug: "client_presented", label: "Presented to Client" },
  { slug: "client_approved", label: "Client Approved" },
  { slug: "committed", label: "Committed" },
  { slug: "actual_final", label: "Actual / Final" },
] as const;

// Production Operations Admin — Create New Budget Version (2026-09-07).
// This form ALWAYS creates a new row (never edits the prior one) —
// matching the append-only architecture. If the prior version for this
// reference has already reached Client Approved/Committed/Actual-Final
// and the total materially changes, createBudgetVersion() refuses
// without a change reason — surfaced here inline so Admin can supply
// one and resubmit, rather than silently failing.
export default function CreateBudgetVersionForm({ referenceType, referenceId, isClientFacingWarning }: { referenceType: string; referenceId: string; isClientFacingWarning: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReason, setNeedsReason] = useState(false);

  return (
    <form
      action={async (formData: FormData) => {
        setBusy(true);
        setError(null);
        const result = await createBudgetVersionAction(formData);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
          setNeedsReason(Boolean(result.requiresChangeReason));
        }
        setBusy(false);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="referenceType" value={referenceType} />
      <input type="hidden" name="referenceId" value={referenceId} />

      {isClientFacingWarning && (
        <p className="font-sans text-caption text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The current latest version is already Client Approved (or later). If the total changes materially, a change/variation reason is required below.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select name="status" required defaultValue="estimate" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          {STATUS_OPTIONS.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <input name="totalUsd" type="number" step="0.01" min="0" placeholder="Total USD (leave blank if still To Be Quoted)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </div>

      <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
        <input type="checkbox" name="contingencyEnabled" value="true" className="w-4 h-4" /> Contingency enabled
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input name="contingencyPercentage" type="number" step="0.01" min="0" placeholder="Contingency % (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        <input name="contingencyAmountUsd" type="number" step="0.01" min="0" placeholder="Contingency amount USD (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </div>

      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Line items (JSON array — optional)</label>
        <textarea name="lineItemsJson" rows={3} placeholder='[{"label":"Production Management Fee","category":"ordift_fee","amountUsd":750}]' className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-caption" />
      </div>

      <textarea name="notes" placeholder="Notes (optional)" rows={2} className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />

      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">
          Change/variation reason {needsReason ? <span className="text-red-700">(required — see above)</span> : "(only required if the prior version was already Client Approved or later, and the total changes)"}
        </label>
        <input name="changeReason" placeholder="e.g. Supplier raised the location rental price" className={`w-full rounded-lg border px-3 py-2 font-sans text-body-small ${needsReason ? "border-red-400" : "border-black/15"}`} />
      </div>

      {error && <p className="font-sans text-caption text-red-700">{error}</p>}

      <button type="submit" disabled={busy} className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small disabled:opacity-50">
        {busy ? "Saving…" : "Create New Version"}
      </button>
    </form>
  );
}
