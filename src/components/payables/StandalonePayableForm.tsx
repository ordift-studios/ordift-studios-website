"use client";

import { useState } from "react";
import type { CurrencyOption } from "@/lib/payments/currency";
import SubmitButton from "@/components/admin/SubmitButton";

// Payable Safety Hardening (2026-09-04), Parts E/F — the standalone
// (no-engagement) payable creation form. Part E: currency is now a
// controlled <select> sourced from the same active-currencies list
// used everywhere else in Payables, not free text (server-side
// enforcement is isSupportedCurrency() in createPaymentObligation()
// itself — this is the matching UI-side guardrail). Part F: rather
// than a hardcoded amount ceiling (explicitly out of scope — see the
// Phase E.1 report), every submission is confirmed with the exact
// amount and currency just typed, read from this component's own
// controlled state so the confirmation text is always accurate.
export default function StandalonePayableForm({
  payeeProfileId,
  currencies,
  createAction,
}: {
  payeeProfileId: string;
  currencies: CurrencyOption[];
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");

  return (
    <form
      action={createAction}
      onSubmit={(e) => {
        const confirmed = window.confirm(`Create a payable for ${currency || "(no currency selected)"} ${amount || "0"}? This is a real financial obligation.`);
        if (!confirmed) e.preventDefault();
      }}
      className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4"
    >
      <input type="hidden" name="payeeProfileId" value={payeeProfileId} />
      <label className="flex flex-col gap-1 sm:col-span-3">
        <span className="font-sans text-caption text-ordift-ink-muted">Description</span>
        <input name="description" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Amount</span>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
        <select
          name="currency"
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="" disabled>
            Select a currency…
          </option>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <SubmitButton pendingLabel="Creating…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          Create Payable
        </SubmitButton>
      </div>
    </form>
  );
}
