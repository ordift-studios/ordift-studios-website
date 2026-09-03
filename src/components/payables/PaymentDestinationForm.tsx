"use client";

import { useActionState, useState } from "react";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  METHOD_FIELD_LABELS,
  COUNTRIES,
  suggestedMobileMoneyProviders,
  type PaymentMethod,
} from "@/lib/payables/paymentDestinationShared";
import type { CurrencyOption } from "@/lib/payments/currency";
import SubmitButton from "@/components/admin/SubmitButton";

// Payment Destination UX (2026-09-04) — method-aware form, shared
// between the admin payee page and the self-service portal page (the
// server action passed in as a prop decides the authorization/target —
// this component makes no distinction of its own between the two
// contexts). Same useActionState()/SubmitButton pattern as
// AddPayeeForm.tsx: pending state, disabled-while-pending, a visible
// success confirmation, and an inline error that never clears what was
// typed. Country/currency render as human-readable names in <select>
// options while the underlying <option value> stays the ISO/DB code —
// nothing here ever asks anyone to type or interpret a raw code.

type PaymentDestinationState = { ok: boolean; error?: string } | null;

export default function PaymentDestinationForm({
  targetProfileId,
  currencies,
  createAction,
  onSuccessMessage = "Payment destination saved.",
}: {
  targetProfileId: string;
  currencies: CurrencyOption[];
  createAction: (prevState: PaymentDestinationState, formData: FormData) => Promise<PaymentDestinationState>;
  onSuccessMessage?: string;
}) {
  const [state, formAction] = useActionState<PaymentDestinationState, FormData>(createAction, null);
  const [method, setMethod] = useState<PaymentMethod>("bank_account");
  const [country, setCountry] = useState("GH");
  const labels = METHOD_FIELD_LABELS[method];
  const providerSuggestions = method === "mobile_money" ? suggestedMobileMoneyProviders(country) : [];

  if (state?.ok) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-body-small text-green-800">{onSuccessMessage}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="profileId" value={targetProfileId} />

      {state?.ok === false && (
        <div role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-800">{state.error}</p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Payment Method</span>
        <select
          name="method"
          required
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Country</span>
        <select
          name="country"
          required
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Currency</span>
        <select name="currency" required defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
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

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">Account Holder Name</span>
        <input name="accountHolderName" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">{labels.institutionLabel}</span>
        <input
          name="institutionName"
          required
          list={providerSuggestions.length > 0 ? "mobile-money-providers" : undefined}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        {providerSuggestions.length > 0 && (
          <datalist id="mobile-money-providers">
            {providerSuggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-sans text-caption text-ordift-ink-muted">{labels.accountIdentifierLabel}</span>
        <input name="accountIdentifier" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      </label>

      {labels.routingLabel && (
        <label className="flex flex-col gap-1">
          <span className="font-sans text-caption text-ordift-ink-muted">{labels.routingLabel}</span>
          <input name="routingIdentifier" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
        </label>
      )}

      <label className="flex items-center gap-2 mt-6">
        <input type="checkbox" name="makeDefault" />
        <span className="font-sans text-caption text-ordift-ink-muted">Make default</span>
      </label>

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving…" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
          Save Destination
        </SubmitButton>
      </div>

      <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">
        Full account numbers are never shown again after saving — only the last 4 characters.
      </p>
    </form>
  );
}
