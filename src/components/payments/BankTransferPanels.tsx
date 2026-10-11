"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { transferInstructions, type ReceivingAccountSnapshot } from "@/lib/payments/bankTransferRules";

// Client-facing Direct Bank Transfer building blocks, shared by the Pay Now flow and the payment
// status page (so a client who leaves and returns sees the same instructions and upload form).

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the value is selectable text */
    }
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/5 py-3 last:border-0">
      <div className="min-w-0">
        <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{label}</dt>
        <dd className={`mt-0.5 break-all font-sans text-body text-ordift-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
      </div>
      <button type="button" onClick={copy} className="shrink-0 rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink hover:border-black/30" aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function TransferInstructionsCard({
  account, amount, currency, reference, usdAmount, rateToUsd, rateLockedAt,
}: { account: ReceivingAccountSnapshot; amount: number; currency: string; reference: string; usdAmount: number; rateToUsd: number; rateLockedAt: string }) {
  const showAccountNumber = account.accountNumber && account.accountNumber !== account.iban;
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-ordift-offwhite p-5">
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Transfer exactly</p>
        <p className="mt-1 font-serif font-medium text-3xl text-ordift-ink">{currency} {amount.toFixed(2)}</p>
        <p className="mt-1 font-sans text-body-small text-ordift-ink-muted">
          = USD {usdAmount.toFixed(2)} at 1 USD = {rateToUsd.toFixed(4)} {currency} (Ordift Studios rate, fixed on {new Date(rateLockedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}). Your quotation price in USD is unchanged.
        </p>
      </div>
      <dl>
        <CopyField label="Payment reference — put this in the transfer" value={reference} />
        <CopyField label="Amount" value={amount.toFixed(2)} />
        <CopyField label="Beneficiary" value={account.beneficiaryName} mono={false} />
        <CopyField label="Bank" value={account.bankName} mono={false} />
        {account.iban && <CopyField label="IBAN" value={account.iban} />}
        {showAccountNumber && <CopyField label="Account number" value={account.accountNumber} />}
        {account.swiftCode && <CopyField label="SWIFT / BIC" value={account.swiftCode} />}
        <CopyField label="Currency" value={account.currencyCode} />
      </dl>
      <ul className="list-disc space-y-1 pl-5 font-sans text-body-small text-ordift-ink-muted">
        {transferInstructions({ reference, amount, currency }).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

const input = "min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink";

export function ProofUploadForm({ paymentId, resubmit = false, onSubmitted }: { paymentId: string; resubmit?: boolean; onSubmitted?: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("paymentId", paymentId);
      if (bankReference.trim()) form.append("bankReference", bankReference.trim());
      if (transferDate) form.append("transferDate", transferDate);
      if (note.trim()) form.append("referenceNote", note.trim());
      const res = await fetch("/api/payments/bank-transfer/proof", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        const code = body?.error as string | undefined;
        setError(code === "file-too-large" ? "That file is larger than 8MB." : code === "unsupported-file-type" ? "Please upload a JPG, PNG, WebP or PDF." : code === "invalid-transfer-date" ? "Please check the transfer date." : "We couldn't upload your proof of payment. Please check the file and try again.");
        return;
      }
      if (onSubmitted) onSubmitted();
      else router.refresh();
    } catch {
      setError("We couldn't upload your proof of payment. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 font-sans text-body-small text-red-700">{error}</p>}
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Upload a screenshot or photo of your transfer receipt (JPG, PNG, WebP or PDF, up to 8MB). Uploading proof does not confirm your payment — we confirm it once we see the money in our account.
      </p>
      <div>
        <label htmlFor="proof-file" className="mb-1 block font-sans text-caption text-ordift-ink-muted">Receipt or screenshot</label>
        <input id="proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full font-sans text-body-small text-ordift-ink" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bank-ref" className="mb-1 block font-sans text-caption text-ordift-ink-muted">Bank transaction reference (if shown)</label>
          <input id="bank-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} maxLength={120} className={input} />
        </div>
        <div>
          <label htmlFor="transfer-date" className="mb-1 block font-sans text-caption text-ordift-ink-muted">Date you sent it</label>
          <input id="transfer-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="proof-note" className="mb-1 block font-sans text-caption text-ordift-ink-muted">Anything else we should know (optional)</label>
        <input id="proof-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={input} />
      </div>
      <button type="button" onClick={submit} disabled={!file || busy} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ordift-gold px-6 font-sans text-button font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:opacity-50">
        {busy ? "Uploading…" : resubmit ? "Resubmit proof of payment" : "Submit proof of payment"}
      </button>
    </div>
  );
}
