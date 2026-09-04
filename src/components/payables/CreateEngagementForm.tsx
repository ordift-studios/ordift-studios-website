"use client";

import { useActionState, useState } from "react";
import type { CurrencyOption } from "@/lib/payments/currency";
import SubmitButton from "@/components/admin/SubmitButton";

// Phase F.1 (2026-09-04), Part D — replaces the plain void-action form
// that let Sylvia's real first engagement save with agreed_amount set
// and currency silently left null (the currency <select>'s blank
// default was easy to leave unselected, and nothing surfaced an
// error). Two changes from that version: (1) useActionState feedback,
// so a rejected submission is actually visible instead of only
// console.error'd; (2) currency becomes `required` the moment an
// amount is typed, tracked via local state — an admin can still leave
// BOTH blank (an engagement with no financial terms yet is valid), but
// can no longer submit an amount with no currency. Server-side,
// createEngagement()'s isCompleteFinancialTerms() check is the real
// enforcement; this is the matching UI-side guardrail.

type CreateEngagementState = { ok: boolean; error?: string } | null;

type EngagementType = { id: string; name: string };
type OperationalTitle = { id: string; name: string };

export default function CreateEngagementForm({
  payeeProfileId,
  currencies,
  engagementTypes,
  operationalTitles,
  createAction,
}: {
  payeeProfileId: string;
  currencies: CurrencyOption[];
  engagementTypes: EngagementType[];
  operationalTitles: OperationalTitle[];
  createAction: (prevState: CreateEngagementState, formData: FormData) => Promise<CreateEngagementState>;
}) {
  const [state, formAction] = useActionState<CreateEngagementState, FormData>(createAction, null);
  const [agreedAmount, setAgreedAmount] = useState("");
  const currencyRequired = agreedAmount.trim() !== "";

  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-body-small text-green-800">Engagement created.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
      <input type="hidden" name="payeeProfileId" value={payeeProfileId} />

      {state?.ok === false && (
        <div role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Engagement type</span>
        <select name="engagementTypeId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {engagementTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Service / role</span>
        <select name="operationalTitleId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
          <option value="">—</option>
          {operationalTitles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Role note (optional)</span>
        <input name="roleNote" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Agreed amount (optional)</span>
        <input
          name="agreedAmount"
          type="number"
          step="0.01"
          min="0"
          value={agreedAmount}
          onChange={(e) => setAgreedAmount(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">
          Currency{currencyRequired ? " (required — an amount was entered)" : " (optional)"}
        </span>
        <select
          name="currency"
          required={currencyRequired}
          defaultValue=""
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="" disabled={currencyRequired}>
            {currencyRequired ? "Select a currency…" : "—"}
          </option>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Due date (optional)</span>
        <input name="dueDate" type="date" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Creating…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          Create Engagement
        </SubmitButton>
      </div>
    </form>
  );
}
