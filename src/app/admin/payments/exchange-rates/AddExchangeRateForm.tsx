"use client";

import { useId, useState } from "react";
import { addExchangeRateAction } from "../actions";

type Step = "input" | "confirm";

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-rate": "Please enter a valid rate greater than zero.",
  "insert-failed": "We couldn't save the new rate. Please try again.",
};

function formatGhs(amount: number): string {
  return amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AddExchangeRateForm({
  currencyCode,
  currentRate,
  initialError,
}: {
  currencyCode: string;
  currentRate: number | null;
  initialError: string | null;
}) {
  const rateInputId = useId();
  const reasonInputId = useId();
  const [step, setStep] = useState<Step>("input");
  const [rateInput, setRateInput] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? "Something went wrong — please try again.") : null
  );

  const newRate = Number(rateInput);
  const rateValid = Number.isFinite(newRate) && newRate > 0;

  function handleReview() {
    if (!rateValid) {
      setError("Please enter a valid rate greater than zero.");
      return;
    }
    setError(null);
    setStep("confirm");
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
      <h2 className="font-serif font-medium text-lg text-ordift-ink">Add New Rate</h2>

      {error && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {step === "input" && (
        <div className="space-y-4">
          <div>
            <label htmlFor={rateInputId} className="font-sans text-caption text-ordift-ink-muted block mb-1">
              New USD → {currencyCode} rate
            </label>
            <div className="flex items-center gap-2">
              <span className="font-sans text-body text-ordift-ink-muted">1 USD =</span>
              <input
                id={rateInputId}
                type="number"
                min={0}
                step="0.0001"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="0.0000"
                className="min-h-11 w-40 rounded-lg border border-black/15 bg-white px-3 font-sans text-body text-ordift-ink"
              />
              <span className="font-sans text-body text-ordift-ink-muted">{currencyCode}</span>
            </div>
          </div>
          <div>
            <label htmlFor={reasonInputId} className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Reason (optional)
            </label>
            <input
              id={reasonInputId}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. aligning with today's Bank of Ghana mid-rate"
              className="min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <button
            type="button"
            onClick={handleReview}
            disabled={!rateValid}
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            Review Change
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-5">
          <div className="rounded-lg bg-ordift-offwhite p-5 space-y-4">
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
              Example — USD 100.00
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-sans text-caption text-ordift-ink-muted">Current rate</p>
                <p className="font-sans text-body text-ordift-ink">
                  {currentRate != null ? `1 USD = ${currentRate.toFixed(4)} ${currencyCode}` : "Not set yet"}
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
                  {currentRate != null ? `≈ ${currencyCode} ${formatGhs(currentRate * 100)}` : "—"}
                </p>
              </div>
              <div>
                <p className="font-sans text-caption text-ordift-ink-muted">New rate</p>
                <p className="font-sans text-body font-medium text-ordift-ink">
                  1 USD = {newRate.toFixed(4)} {currencyCode}
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
                  ≈ {currencyCode} {formatGhs(newRate * 100)}
                </p>
              </div>
            </div>
          </div>

          <p className="font-sans text-caption text-ordift-ink-muted">
            This adds a new rate, effective immediately — it never changes rates already locked into past
            checkouts, payments, or receipts.
          </p>

          <form action={addExchangeRateAction} className="flex flex-col sm:flex-row gap-3">
            <input type="hidden" name="rateToUsd" value={rateInput} />
            <input type="hidden" name="reason" value={reason} />
            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover"
            >
              Confirm &amp; Activate New Rate
            </button>
            <button
              type="button"
              onClick={() => setStep("input")}
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
            >
              Edit
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
