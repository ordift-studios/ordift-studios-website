"use client";

import { useActionState, useState } from "react";
import { setCommercialTermsAction, type SetCommercialTermsState } from "../actions";
import { TALENT_COMMISSION_TYPES, type TalentCommissionType } from "@/lib/talent/talentCommercialTerms";

const inputClass = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink disabled:opacity-60";

// Commercial Terms Admin UI (2026-09-09) — same useActionState
// pending/success/error pattern as AssignCategoryForm.tsx/
// NewTalentForm.tsx, applied from the start (this section never had an
// earlier no-feedback version to fix). setCommercialTerms()'s own
// logic — authorization, validateCommercialTerms()'s rules (no default
// value, currency required for flat_fee, percentage capped at 100),
// the talent_commercial_terms upsert, and the activity log — is
// entirely unchanged; this component only collects form input and
// renders what the action returns.
//
// commissionValue/currency are disabled (not just hidden) whenever
// "none" is selected — a disabled field is never included in the
// submitted FormData, so selecting "none" naturally submits `null` for
// both without any client-side clearing logic, and without ever
// silently dropping a value the person actually typed for a real
// commission type.
export function CommercialTermsForm({
  profileId,
  current,
}: {
  profileId: string;
  current: { commissionType: string; commissionValue: string | null; currency: string | null; notes: string | null } | null;
}) {
  const [state, formAction, pending] = useActionState<SetCommercialTermsState, FormData>(setCommercialTermsAction, null);
  const [commissionType, setCommissionType] = useState<TalentCommissionType>((current?.commissionType as TalentCommissionType) ?? "none");
  const valueFieldsDisabled = pending || commissionType === "none";

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-black/10">
      <input type="hidden" name="profileId" value={profileId} />

      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Commission type</span>
        <select
          name="commissionType"
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value as TalentCommissionType)}
          disabled={pending}
          className={inputClass}
        >
          {TALENT_COMMISSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">
          Commission value{commissionType === "percentage" ? " (%)" : ""}
        </span>
        <input
          name="commissionValue"
          type="number"
          step="0.01"
          min="0"
          defaultValue={current?.commissionValue ?? ""}
          disabled={valueFieldsDisabled}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Currency</span>
        <input
          name="currency"
          type="text"
          placeholder="e.g. GHS"
          defaultValue={current?.currency ?? ""}
          disabled={valueFieldsDisabled}
          className={inputClass}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted block mb-1">Notes</span>
        <textarea name="notes" rows={2} defaultValue={current?.notes ?? ""} disabled={pending} className={inputClass} />
      </label>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-ordift-navy-950 text-ordift-gold px-4 py-2 font-sans text-caption font-semibold disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save commercial terms"}
        </button>
        {!pending && state?.ok === true && <span className="font-sans text-caption text-green-700">Commercial terms saved successfully.</span>}
        {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
