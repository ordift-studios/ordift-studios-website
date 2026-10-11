"use client";

import { useState } from "react";
import ActionForm from "@/components/admin/ActionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { assessReceived } from "@/lib/payments/bankTransferRules";
import { decideBankTransferAction } from "./verificationActions";

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const label = "block font-sans text-caption text-ordift-ink-muted mb-1";

// The verifier's own record of what ARRIVED. Nothing here is prefilled from the client's claim, and
// the amount is left blank on purpose: it has to be read from the bank statement, not accepted from
// the request. The preview shows exactly what approving would post.
export default function VerificationForm({
  paymentId, expectedAmount, expectedCurrency, expectedUsd, exchangeRate, today,
}: { paymentId: string; expectedAmount: number; expectedCurrency: string; expectedUsd: number; exchangeRate: number; today: string }) {
  const [decision, setDecision] = useState<"approved" | "info_requested" | "rejected">("approved");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(expectedCurrency);

  const received = Number(amount.replace(/,/g, ""));
  const assessment = decision === "approved" && amount.trim() !== "" && Number.isFinite(received) && received > 0
    ? assessReceived({ expectedAmount, expectedCurrency, expectedReferenceUsd: expectedUsd, exchangeRate, receivedAmount: received, receivedCurrency: currency.trim().toUpperCase() })
    : null;

  return (
    <ActionForm action={decideBankTransferAction} className="space-y-5">
      <input type="hidden" name="paymentId" value={paymentId} />

      <fieldset className="space-y-2">
        <legend className={label}>Decision</legend>
        {([
          ["approved", "Confirm — the money has arrived in the receiving account"],
          ["info_requested", "Request more information from the client"],
          ["rejected", "Reject — the payment can't be confirmed"],
        ] as const).map(([value, text]) => (
          <label key={value} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
            <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="mt-1" />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>

      {decision === "approved" && (
        <div className="space-y-4 rounded-lg border border-black/10 bg-ordift-offwhite p-4">
          <p className="font-sans text-caption text-ordift-ink-muted">
            Record what you found <strong>in the bank account itself</strong> (online banking or statement) — not what the receipt says.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="receivedAmount" className={label}>Amount received</label>
              <input id="receivedAmount" name="receivedAmount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`expected ${expectedAmount.toFixed(2)}`} className={field} />
            </div>
            <div>
              <label htmlFor="receivedCurrency" className={label}>Currency received</label>
              <input id="receivedCurrency" name="receivedCurrency" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={field} />
            </div>
            <div>
              <label htmlFor="receivedDate" className={label}>Date received</label>
              <input id="receivedDate" name="receivedDate" type="date" required max={today} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="bankReference" className={label}>Bank transaction reference (from your statement)</label>
            <input id="bankReference" name="bankReference" required minLength={3} maxLength={120} className={field} />
          </div>

          {assessment && (
            <div role="status" className={`rounded-lg border p-3 font-sans text-body-small ${assessment.kind === "exact" ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {assessment.kind === "currency_mismatch" && <>The currency received ({assessment.receivedCurrency}) differs from the {assessment.expectedCurrency} the client was asked to send. This can&apos;t be approved — request more information or reject it.</>}
              {assessment.kind === "exact" && <>Matches the request. Approving credits <strong>USD {assessment.creditedUsd.toFixed(2)}</strong> to the receivable.</>}
              {assessment.kind === "partial" && <>Less than requested (short by {expectedCurrency} {assessment.shortfall.toFixed(2)}). Approving credits only <strong>USD {assessment.creditedUsd.toFixed(2)}</strong> at the locked rate; the balance stays outstanding.</>}
              {assessment.kind === "excess" && <>More than requested ({expectedCurrency} {assessment.excess.toFixed(2)} extra). Only <strong>USD {assessment.creditedUsd.toFixed(2)}</strong> is credited; the excess is recorded for you to refund or credit manually.</>}
            </div>
          )}
          {assessment?.kind === "excess" && (
            <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
              <input type="checkbox" name="acknowledgeExcess" className="mt-1" />
              <span>I understand the excess is not credited automatically and must be handled separately.</span>
            </label>
          )}

          <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
            <input type="checkbox" name="independentCheck" required className="mt-1" />
            <span>I have independently checked the receiving bank account and the money above has arrived. I am not relying on the client&apos;s receipt.</span>
          </label>
        </div>
      )}

      {decision !== "approved" && (
        <div>
          <label htmlFor="clientMessage" className={label}>{decision === "info_requested" ? "What the client needs to provide (shown to the client)" : "Message to the client (optional, shown to the client)"}</label>
          <textarea id="clientMessage" name="clientMessage" rows={3} maxLength={600} required={decision === "info_requested"} className={field} />
        </div>
      )}

      <div>
        <label htmlFor="internalNotes" className={label}>{decision === "rejected" ? "Reason for rejecting (internal, required)" : "Internal verification notes"}</label>
        <textarea id="internalNotes" name="internalNotes" rows={2} maxLength={600} required={decision === "rejected"} className={field} />
      </div>

      <ConfirmSubmitButton
        confirmMessage={decision === "approved" ? "Record this payment as received? It will be posted to the receivable, a receipt will be sent, and this decision is permanent in the audit history." : decision === "rejected" ? "Reject this payment? The client will see it was not verified." : "Send this request for more information to the client?"}
        pendingLabel="Saving…"
        className="min-h-10 rounded-lg bg-ordift-gold px-5 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover"
      >
        {decision === "approved" ? "Confirm payment received" : decision === "rejected" ? "Reject payment" : "Request information"}
      </ConfirmSubmitButton>
    </ActionForm>
  );
}
