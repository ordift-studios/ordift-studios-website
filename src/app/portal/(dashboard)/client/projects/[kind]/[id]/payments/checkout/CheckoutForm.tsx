"use client";

import { useActionState, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { startGatewayCheckoutAction, type GatewayCheckoutState } from "../actions";
import type { BankAccountDisplay } from "@/lib/payments/bankAccounts";

const initialGatewayState: GatewayCheckoutState = { error: null };

type Method = "gateway" | "bank_transfer";
type AmountMode = "full" | "custom";
type Step = "select" | "confirm-gateway" | "bank-details" | "bank-upload" | "bank-submitted";

const ERROR_MESSAGES: Record<string, string> = {
  "checkout-already-in-progress": "You already have a payment in progress for this — check your payment history below, or try again in a moment.",
  "invalid-or-unavailable-amount": "That amount isn't available to pay right now — please refresh and try again.",
  "no-exchange-rate-set": "Card and Mobile Money payments aren't available in your currency yet — please use Bank Transfer, or contact us.",
  "gateway-init-failed": "We couldn't start your payment right now. Please try again shortly, or contact us if this continues.",
  "rate-limited": "Too many attempts. Please wait a few minutes and try again.",
};

export default function CheckoutForm({
  kind,
  id,
  balanceUsd,
  hasExistingPayment,
  currencyCode,
  rateToUsd,
  bankAccount,
  initialError,
}: {
  kind: string;
  id: string;
  balanceUsd: number;
  hasExistingPayment: boolean;
  currencyCode: string;
  rateToUsd: number | null;
  bankAccount: BankAccountDisplay | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const amountInputId = useId();
  const [step, setStep] = useState<Step>("select");
  const [method, setMethod] = useState<Method | null>(null);
  const [amountMode, setAmountMode] = useState<AmountMode>("full");
  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState<string | null>(initialError ? (ERROR_MESSAGES[initialError] ?? "Something went wrong — please try again.") : null);
  const [submitting, setSubmitting] = useState(false);

  const [bankPaymentId, setBankPaymentId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [referenceNote, setReferenceNote] = useState("");

  // TD-036 — the rate actually driving the displayed preview. Starts
  // as the page-render-time value, but is overwritten with the
  // server's authoritative rate whenever either checkout path reports
  // rate_changed, so the customer always sees (and next quotes) the
  // number that will actually be reconciled against.
  const [activeRateToUsd, setActiveRateToUsd] = useState<number | null>(rateToUsd);
  const [bankRateChanged, setBankRateChanged] = useState(false);

  const [gatewayState, gatewayFormAction, gatewayPending] = useActionState(startGatewayCheckoutAction, initialGatewayState);
  // Same "adjust state during render when a dependency changes"
  // pattern as LoginForm.tsx's Turnstile reset — avoids an extra
  // cascading render for what's ultimately synchronous, derived state.
  const [prevGatewayState, setPrevGatewayState] = useState(gatewayState);
  if (gatewayState !== prevGatewayState) {
    setPrevGatewayState(gatewayState);
    if (gatewayState.error === "rate_changed" && gatewayState.currentRateToUsd != null) {
      setActiveRateToUsd(gatewayState.currentRateToUsd);
    }
  }

  const paymentType = amountMode === "full" ? (hasExistingPayment ? "balance" : "full") : "partial";
  const amountUsd = amountMode === "full" ? balanceUsd : Number(customAmount) || 0;
  const amountValid = amountUsd > 0 && amountUsd <= balanceUsd;
  const convertedPreview = activeRateToUsd != null ? Math.round(amountUsd * activeRateToUsd * 100) / 100 : null;

  function handleContinue() {
    if (!amountValid) {
      setError("Please enter a valid amount, up to your remaining balance.");
      return;
    }
    setError(null);
    if (method === "gateway") setStep("confirm-gateway");
    if (method === "bank_transfer") setStep("bank-details");
  }

  async function handleStartBankTransfer() {
    if (convertedPreview == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/bank-transfer/proof", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: kind === "enquiry" ? "enquiry" : "workshop_registration",
          entityId: id,
          paymentType,
          country: "GH",
          amountUsd,
          quotedConvertedAmount: convertedPreview,
        }),
      });
      const body = await res.json();
      // TD-036 — a stale quote returns rate_changed rather than
      // succeeding or throwing; update the displayed amount and
      // require an explicit new click, never auto-resubmit.
      if (body.error === "rate_changed") {
        setActiveRateToUsd(body.rateToUsd);
        setBankRateChanged(true);
        return;
      }
      if (!body.ok) throw new Error(body.error ?? "failed");
      setBankRateChanged(false);
      setBankPaymentId(body.paymentId);
      setStep("bank-upload");
    } catch (err) {
      const code = err instanceof Error ? err.message : null;
      setError((code && ERROR_MESSAGES[code]) || "We couldn't start your bank transfer right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitProof() {
    if (!proofFile || !bankPaymentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", proofFile);
      formData.append("paymentId", bankPaymentId);
      if (referenceNote) formData.append("referenceNote", referenceNote);
      const res = await fetch("/api/payments/bank-transfer/proof", { method: "POST", body: formData });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "failed");
      setStep("bank-submitted");
    } catch {
      setError("We couldn't upload your proof of payment. Please check the file and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {step === "select" && (
        <>
          <fieldset className="rounded-xl border border-black/10 bg-white p-6">
            <legend className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3 px-1">Amount</legend>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="amountMode" checked={amountMode === "full"} onChange={() => setAmountMode("full")} className="h-4 w-4 accent-ordift-gold-pressed" />
                <span className="font-sans text-body text-ordift-ink">
                  Pay full balance — <strong>${balanceUsd.toFixed(2)}</strong>
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="amountMode" checked={amountMode === "custom"} onChange={() => setAmountMode("custom")} className="h-4 w-4 accent-ordift-gold-pressed" />
                <span className="font-sans text-body text-ordift-ink">Pay a different amount</span>
              </label>
              {amountMode === "custom" && (
                <div className="pl-7">
                  <label htmlFor={amountInputId} className="sr-only">
                    Amount in USD
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-body text-ordift-ink-muted">$</span>
                    <input
                      id={amountInputId}
                      type="number"
                      min={0}
                      max={balanceUsd}
                      step="0.01"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.00"
                      className="min-h-11 w-40 rounded-lg border border-black/15 bg-white px-3 font-sans text-body text-ordift-ink"
                    />
                  </div>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">Up to ${balanceUsd.toFixed(2)}</p>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-black/10 bg-white p-6">
            <legend className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3 px-1">Payment Method</legend>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-black/10 p-4 has-[:checked]:border-ordift-gold-pressed has-[:checked]:bg-ordift-offwhite/60">
                <input type="radio" name="method" checked={method === "gateway"} onChange={() => setMethod("gateway")} className="h-4 w-4 mt-0.5 accent-ordift-gold-pressed" />
                <span>
                  <span className="font-sans text-body font-medium text-ordift-ink block">Card or Mobile Money</span>
                  <span className="font-sans text-body-small text-ordift-ink-muted block mt-0.5">
                    MTN Mobile Money, Telecel Cash, AirtelTigo Money, Visa, Mastercard, Apple Pay where supported
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-black/10 p-4 has-[:checked]:border-ordift-gold-pressed has-[:checked]:bg-ordift-offwhite/60">
                <input type="radio" name="method" checked={method === "bank_transfer"} onChange={() => setMethod("bank_transfer")} className="h-4 w-4 mt-0.5 accent-ordift-gold-pressed" />
                <span>
                  <span className="font-sans text-body font-medium text-ordift-ink block">Bank Transfer</span>
                  <span className="font-sans text-body-small text-ordift-ink-muted block mt-0.5">Pay directly from your bank, then upload proof of payment</span>
                </span>
              </label>
            </div>
          </fieldset>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!method || !amountValid}
            className="w-full inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50 disabled:pointer-events-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2"
          >
            Continue
          </button>
        </>
      )}

      {step === "confirm-gateway" && (
        <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8 space-y-5">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Confirm Payment</p>
          {gatewayState.error === "rate_changed" && (
            <p role="status" className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
              The exchange rate was updated while you were checking out. Your payment is now {gatewayState.currencyCode}{" "}
              {gatewayState.currentConvertedAmount?.toFixed(2)}. Please review the updated amount and confirm to continue.
            </p>
          )}
          <div>
            <p className="font-serif font-medium text-2xl text-ordift-ink">${amountUsd.toFixed(2)} USD</p>
            {convertedPreview != null ? (
              <p className="font-sans text-body text-ordift-ink-muted mt-1">
                ≈ {currencyCode} {convertedPreview.toFixed(2)} at today&apos;s rate
              </p>
            ) : (
              <p className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                Card and Mobile Money aren&apos;t available in {currencyCode} yet — please use Bank Transfer instead, or contact us.
              </p>
            )}
          </div>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Your bank or card provider may apply its own exchange rate or fee — this is outside Ordift Studios&apos; control.
          </p>
          <form action={gatewayFormAction} className="flex flex-col sm:flex-row gap-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="paymentType" value={paymentType} />
            {amountMode === "custom" && <input type="hidden" name="requestedAmountUsd" value={amountUsd} />}
            {convertedPreview != null && <input type="hidden" name="quotedConvertedAmount" value={convertedPreview} />}
            <button
              type="submit"
              disabled={convertedPreview == null || gatewayPending}
              className="flex-1 inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50 disabled:pointer-events-none transition-all duration-150"
            >
              {gatewayPending ? "Please wait…" : gatewayState.error === "rate_changed" ? "Confirm Updated Amount" : "Continue to Secure Payment"}
            </button>
            <button
              type="button"
              onClick={() => setStep("select")}
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
            >
              Back
            </button>
          </form>
        </div>
      )}

      {step === "bank-details" && (
        <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8 space-y-5">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Bank Transfer Details</p>
          {bankAccount ? (
            <>
              {bankRateChanged && (
                <p role="status" className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
                  The exchange rate was updated while you were checking out. Your payment is now {bankAccount.currencyCode}{" "}
                  {convertedPreview?.toFixed(2)}. Please review the updated amount and confirm to continue.
                </p>
              )}
              <div>
                <p className="font-serif font-medium text-2xl text-ordift-ink">${amountUsd.toFixed(2)} USD</p>
                {convertedPreview != null && (
                  <p className="font-sans text-body text-ordift-ink-muted mt-1">
                    ≈ {bankAccount.currencyCode} {convertedPreview.toFixed(2)} at today&apos;s rate
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Bank</dt>
                  <dd className="font-sans text-body text-ordift-ink mt-0.5">{bankAccount.bankName}</dd>
                </div>
                <div>
                  <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Account Name</dt>
                  <dd className="font-sans text-body text-ordift-ink mt-0.5">{bankAccount.accountName}</dd>
                </div>
                <div>
                  <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Account Number</dt>
                  <dd className="font-sans text-body text-ordift-ink mt-0.5 font-mono">{bankAccount.accountNumber}</dd>
                </div>
                {bankAccount.swiftCode && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">SWIFT</dt>
                    <dd className="font-sans text-body text-ordift-ink mt-0.5 font-mono">{bankAccount.swiftCode}</dd>
                  </div>
                )}
              </dl>
              <p className="font-sans text-body-small text-ordift-ink-muted">
                Transfer this amount using your own banking app, then confirm below. We&apos;ll ask you to upload your transfer receipt next.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleStartBankTransfer}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50"
                >
                  {submitting ? "Please wait…" : bankRateChanged ? "Confirm Updated Amount" : "I've Sent This Payment"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBankRateChanged(false);
                    setStep("select");
                  }}
                  className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
                Bank transfer details aren&apos;t configured yet — please choose Card or Mobile Money, or contact us directly to arrange payment.
              </p>
              <button
                type="button"
                onClick={() => setStep("select")}
                className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button border border-ordift-ink/30 text-ordift-ink hover:border-ordift-ink/60"
              >
                Back
              </button>
            </>
          )}
        </div>
      )}

      {step === "bank-upload" && (
        <div className="rounded-xl border border-black/10 bg-white p-6 sm:p-8 space-y-5">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Upload Proof of Payment</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            A screenshot or photo of your transfer receipt (JPG, PNG, or PDF, up to 8MB).
          </p>
          <div>
            <label htmlFor="proof-file" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Proof of payment
            </label>
            <input
              id="proof-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="block w-full font-sans text-body-small text-ordift-ink file:mr-4 file:min-h-11 file:px-4 file:rounded-full file:border-0 file:bg-ordift-offwhite file:font-sans file:font-medium file:text-ordift-ink hover:file:bg-black/5"
            />
          </div>
          <div>
            <label htmlFor="reference-note" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Reference note (optional)
            </label>
            <input
              id="reference-note"
              type="text"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="e.g. the transaction reference from your bank"
              className="min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <button
            type="button"
            onClick={handleSubmitProof}
            disabled={!proofFile || submitting}
            className="w-full inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50"
          >
            {submitting ? "Uploading…" : "Submit Proof of Payment"}
          </button>
        </div>
      )}

      {step === "bank-submitted" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 sm:p-8 text-center space-y-4">
          <p className="font-serif font-medium text-xl text-ordift-ink">Pending Verification</p>
          <p className="font-sans text-body text-ordift-ink-muted">
            We&apos;ve received your proof of payment. Our team will confirm it shortly — you&apos;ll see your balance update here once approved.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/portal/client/projects/${kind}/${id}/payments`)}
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-full font-sans font-semibold text-button bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover"
          >
            Back to Payments
          </button>
        </div>
      )}
    </div>
  );
}
