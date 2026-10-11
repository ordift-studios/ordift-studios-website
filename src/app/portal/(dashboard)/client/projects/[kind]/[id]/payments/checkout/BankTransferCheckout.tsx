"use client";

import { useState } from "react";
import Link from "next/link";
import { ProofUploadForm, TransferInstructionsCard } from "@/components/payments/BankTransferPanels";
import type { ReceivingAccountSnapshot } from "@/lib/payments/bankTransferRules";

type Instruction = { paymentId: string; recordId: string; convertedAmount: number; currencyCode: string; rateToUsd: number; rateLockedAt: string; receivingAccount: ReceivingAccountSnapshot };

const ERRORS: Record<string, string> = {
  "no-active-bank-account": "Bank transfer isn't available for your account yet — please contact us and we'll arrange payment with you.",
  "no-active-payment-config-for-country": "Bank transfer isn't available for your account yet — please contact us and we'll arrange payment with you.",
  "no-exchange-rate-set": "We couldn't fix the transfer amount yet — please contact us.",
  "invalid-amount": "That amount isn't available to pay right now — please refresh and try again.",
  "rate-limited": "Too many attempts. Please wait a few minutes and try again.",
};

// Direct Bank Transfer checkout for a bank-transfer-only market (Qatar). The instruction (with its
// unique payment reference and the exact local-currency amount) is created BEFORE the client
// transfers, so they can quote the reference. Nothing here confirms a payment.
export default function BankTransferCheckout({
  kind, id, balanceUsd, hasExistingPayment, currencyCode, rateToUsd,
}: { kind: string; id: string; balanceUsd: number; hasExistingPayment: boolean; currencyCode: string; rateToUsd: number | null }) {
  const [step, setStep] = useState<"amount" | "instructions" | "upload" | "submitted">("amount");
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [custom, setCustom] = useState("");
  const [instruction, setInstruction] = useState<Instruction | null>(null);
  const [rate, setRate] = useState<number | null>(rateToUsd);
  const [rateChanged, setRateChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountUsd = mode === "full" ? balanceUsd : Number(custom) || 0;
  const valid = amountUsd > 0 && amountUsd <= balanceUsd;
  const preview = rate != null ? Math.round(amountUsd * rate * 100) / 100 : null;
  const paymentType = mode === "full" ? (hasExistingPayment ? "balance" : "full") : "partial";

  async function getInstructions() {
    if (preview == null || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/bank-transfer/proof", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: kind === "enquiry" ? "enquiry" : "workshop_registration", entityId: id, paymentType, amountUsd, quotedConvertedAmount: preview }),
      });
      const body = await res.json();
      if (body.error === "rate_changed") {
        setRate(body.rateToUsd);
        setRateChanged(true);
        return;
      }
      if (!body.ok) throw new Error(body.error ?? "failed");
      setRateChanged(false);
      setInstruction(body as Instruction);
      setStep("instructions");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(ERRORS[code] ?? "We couldn't prepare your transfer details right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 font-sans text-body-small text-red-700">{error}</p>}

      {step === "amount" && (
        <div className="space-y-5 rounded-xl border border-black/10 bg-white p-6 sm:p-8">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Direct Bank Transfer</p>
          <fieldset className="space-y-3">
            <legend className="sr-only">Amount</legend>
            <label className="flex items-center gap-3">
              <input type="radio" name="amountMode" checked={mode === "full"} onChange={() => setMode("full")} className="h-4 w-4 accent-ordift-gold-pressed" />
              <span className="font-sans text-body text-ordift-ink">Pay full balance — <strong>${balanceUsd.toFixed(2)}</strong></span>
            </label>
            <label className="flex items-center gap-3">
              <input type="radio" name="amountMode" checked={mode === "custom"} onChange={() => setMode("custom")} className="h-4 w-4 accent-ordift-gold-pressed" />
              <span className="font-sans text-body text-ordift-ink">Pay a different amount</span>
            </label>
            {mode === "custom" && (
              <div className="pl-7">
                <label htmlFor="custom-amount" className="sr-only">Amount in USD</label>
                <div className="flex items-center gap-2">
                  <span className="font-sans text-body text-ordift-ink-muted">$</span>
                  <input id="custom-amount" type="number" min={0} max={balanceUsd} step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} className="min-h-11 w-40 rounded-lg border border-black/15 bg-white px-3 font-sans text-body text-ordift-ink" />
                </div>
                <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Up to ${balanceUsd.toFixed(2)}</p>
              </div>
            )}
          </fieldset>
          {rateChanged && <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-800">The exchange rate was updated. Your transfer is now {currencyCode} {preview?.toFixed(2)}. Please check it and confirm.</p>}
          {preview != null ? (
            <p className="font-sans text-body text-ordift-ink">You will transfer <strong>{currencyCode} {preview.toFixed(2)}</strong> <span className="text-ordift-ink-muted">(USD {amountUsd.toFixed(2)} at 1 USD = {rate?.toFixed(4)} {currencyCode})</span></p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-800">Bank transfer isn&apos;t available yet — please contact us and we&apos;ll arrange payment with you.</p>
          )}
          <p className="font-sans text-caption text-ordift-ink-muted">Your quotation stays priced in USD. We show the exact {currencyCode} amount to send so there are no surprises; your bank may add its own fees.</p>
          <button type="button" onClick={getInstructions} disabled={!valid || preview == null || busy} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ordift-gold px-6 font-sans text-button font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50">
            {busy ? "Please wait…" : rateChanged ? "Confirm updated amount" : "Show transfer details"}
          </button>
        </div>
      )}

      {step === "instructions" && instruction && (
        <div className="space-y-5 rounded-xl border border-black/10 bg-white p-6 sm:p-8">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Your transfer details · Awaiting transfer</p>
          <TransferInstructionsCard account={instruction.receivingAccount} amount={instruction.convertedAmount} currency={instruction.currencyCode} reference={instruction.recordId} usdAmount={amountUsd} rateToUsd={instruction.rateToUsd} rateLockedAt={instruction.rateLockedAt} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => setStep("upload")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-ordift-gold px-6 font-sans text-button font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover">I&apos;ve made the transfer — upload proof</button>
            <Link href={`/portal/client/projects/${kind}/${id}/payments`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-ordift-ink/30 px-6 font-sans text-button font-semibold text-ordift-ink hover:border-ordift-ink/60">I&apos;ll do this later</Link>
          </div>
          <p className="font-sans text-caption text-ordift-ink-muted">These details stay available under Payments → this payment, so you can come back after you&apos;ve transferred.</p>
        </div>
      )}

      {step === "upload" && instruction && (
        <div className="space-y-5 rounded-xl border border-black/10 bg-white p-6 sm:p-8">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Upload proof of payment · {instruction.recordId}</p>
          <ProofUploadForm paymentId={instruction.paymentId} onSubmitted={() => setStep("submitted")} />
        </div>
      )}

      {step === "submitted" && instruction && (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
          <p className="font-serif text-xl font-medium text-ordift-ink">Proof submitted — awaiting verification</p>
          <p className="font-sans text-body text-ordift-ink-muted">Thank you. We&apos;ll confirm your payment once we see the money in our account — usually within one business day. You can follow the status under Payments.</p>
          <Link href={`/portal/client/projects/${kind}/${id}/payments`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ordift-gold px-6 font-sans text-button font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover">Back to Payments</Link>
        </div>
      )}
    </div>
  );
}
