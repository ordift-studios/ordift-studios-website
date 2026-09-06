"use client";

import { useMemo, useState } from "react";
import { applyDiscount } from "@/lib/pricing/discountMath";

// Admin Pricing UX Refinement (2026-09-06) — reuses the existing,
// already-tested applyDiscount() pure function from discounts.ts
// purely for a live, in-browser preview. This component never submits
// anything itself while typing — no request is made, no row is
// written, nothing is audited — until the Admin explicitly clicks
// "Apply & Record", which submits the real <form> below to the
// existing applyManualDiscountAction (unchanged authorization/audit
// behavior).
export default function ManualDiscountForm({ action }: { action: (formData: FormData) => void }) {
  const [originalAmountUsd, setOriginalAmountUsd] = useState("");
  const [value, setValue] = useState("");

  const preview = useMemo(() => {
    const original = Number(originalAmountUsd);
    const percent = Number(value);
    if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(percent) || percent <= 0) return null;
    const { discountAmountUsd, finalAmountUsd } = applyDiscount(original, { discountType: "percentage", value: percent });
    return { original, percent, discountAmountUsd, finalAmountUsd };
  }, [originalAmountUsd, value]);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Original Amount (USD)</label>
          <input
            name="originalAmountUsd"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={originalAmountUsd}
            onChange={(e) => setOriginalAmountUsd(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Percentage Off</label>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Enquiry / Booking Reference</label>
          <input name="referenceId" placeholder="e.g. ENQ-2026-000123" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Reason (required)</label>
          <input name="reason" required placeholder="Why this discount is being applied" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        </div>
      </div>
      <input type="hidden" name="referenceType" value="enquiry" />

      {preview && (
        <div className="rounded-lg bg-ordift-offwhite p-4 font-sans text-body-small text-ordift-ink space-y-1">
          <p className="text-ordift-ink-muted text-caption uppercase tracking-wide">Preview — not yet recorded</p>
          <div className="flex justify-between"><span>Original</span><span>${preview.original.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Discount ({preview.percent}%)</span><span>-${preview.discountAmountUsd.toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t border-black/10 pt-1 mt-1"><span>Final</span><span>${preview.finalAmountUsd.toFixed(2)}</span></div>
        </div>
      )}

      <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Apply &amp; Record</button>
      <p className="font-sans text-caption text-ordift-ink-muted">This preview is calculated in your browser only — nothing is saved or audited until you click Apply &amp; Record.</p>
    </form>
  );
}
