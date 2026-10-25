"use client";

import { useActionState, useState } from "react";
import { issueQuotationAction, recordQuotationAcceptanceAction, recordQuotationDeliveryAction, updateQuotationStatusAction, type ActionState } from "../actions";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalDateTimeField from "@/components/admin/LocalDateTimeField";
import { ACCEPTANCE_CHANNELS } from "@/lib/crewSupport/quotationRules";
import { DELIVERY_CHANNELS_UI } from "@/lib/commercial/quotationDeliveryChannels";
import { ORDINARY_VALIDITY_DAYS, formatDate } from "@/lib/commercial/quotationValidity";

// Four different things, kept apart: CREATED (a draft exists), ISSUED (a person confirmed it, recording who/when/validity), DELIVERED (a person recorded how they gave it to the client:
// the system never sends it) and ACCEPTED (the client said yes, with evidence). Issuing sets no amount due, booking, payment or acceptance, and sends nothing.
const NEXT_STATUS: Record<string, { status: string; label: string }[]> = {
  sent: [
    { status: "declined", label: "Mark Declined" },
    { status: "expired", label: "Mark Expired" },
  ],
};
const FIELD = "block w-full mt-1 min-h-11 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink";
const STATUS_WORD: Record<string, string> = { draft: "Draft (not issued)", sent: "Issued", accepted: "Accepted", declined: "Declined", expired: "Expired", superseded: "Superseded" };

export function QuotationStatusActions({ quotationId, status, defaultValidUntil, currentValidUntil, isSuperAdmin, blockers, expired, deliveredText, today, crewManaged = false }: {
  crewManaged?: boolean; today: string; quotationId: string; status: string; hasClient: boolean; defaultValidUntil: string; currentValidUntil: string | null; isSuperAdmin: boolean; blockers: string[]; expired: boolean; deliveredText: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateQuotationStatusAction, null);
  const [acceptState, acceptAction] = useActionState<ActionState, FormData>(recordQuotationAcceptanceAction, null);
  // The result states live here (this component stays mounted when the page refreshes after an action), so a confirmation is never lost when the panel below it changes.
  const [issueState, issueAction] = useActionState<ActionState, FormData>(issueQuotationAction, null);
  const [deliveryState, deliveryAction] = useActionState<ActionState, FormData>(recordQuotationDeliveryAction, null);
  const initial = currentValidUntil && currentValidUntil >= today ? currentValidUntil : defaultValidUntil;
  const [validUntil, setValidUntil] = useState(initial);
  const isException = validUntil !== defaultValidUntil;
  const isExtension = validUntil > defaultValidUntil;
  const options = NEXT_STATUS[status] ?? [];

  return (
    <div className="space-y-4">
      <p className="font-sans text-body-small text-ordift-ink-muted">Status: <strong className="text-ordift-ink">{STATUS_WORD[status] ?? status}</strong></p>

      {issueState?.ok === true && issueState.message && (
        <div role="status" aria-live="polite" className="rounded-lg border border-green-300 bg-green-50 p-3 font-sans text-body-small text-green-900"><p className="font-semibold">Quotation issued</p><p>{issueState.message}</p></div>
      )}
      {issueState?.ok === false && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 font-sans text-body-small text-red-900">{issueState.error} Nothing was changed.</p>}

      {status === "draft" && crewManaged && (
        <p role="status" className="rounded-lg border border-black/15 bg-ordift-offwhite p-3 font-sans text-body-small text-ordift-ink">This is a Crew Support quotation. It is reviewed and issued from its Crew Support request, which has its own validity and approval steps. It cannot be issued from this page.</p>
      )}

      {status === "draft" && !crewManaged && (
        <section aria-labelledby="issue-h" className="space-y-3 rounded-lg border border-black/15 p-3 sm:p-4">
          <h2 id="issue-h" className="font-serif font-medium text-body text-ordift-ink">Issue quotation</h2>
          <p className="font-sans text-caption text-ordift-ink-muted">This is a draft: it exists, but it has not been issued. Issuing records today as the issue date, you as the issuer, and the validity below. <strong>It does not email or notify the client</strong>, and it creates no payment, booking, amount due or acceptance. You deliver it yourself and record that afterwards.</p>
          {blockers.length > 0 && <ul className="list-disc pl-5 font-sans text-caption text-red-800">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          <form action={issueAction} className="space-y-3">
            <input type="hidden" name="quotationId" value={quotationId} />
            <label className="block font-sans text-caption text-ordift-ink-muted">Valid until (standard: {ORDINARY_VALIDITY_DAYS} calendar days from issue = {formatDate(defaultValidUntil)})
              <input type="date" name="validUntil" value={validUntil} min={today} onChange={(e) => setValidUntil(e.target.value)} className={FIELD} required />
            </label>
            {isException && (
              <div className="space-y-1">
                <p className="font-sans text-caption text-amber-900">{isExtension ? (isSuperAdmin ? `This is longer than ${ORDINARY_VALIDITY_DAYS} days. As a Super Admin you may approve it; the reason is recorded.` : `This is longer than ${ORDINARY_VALIDITY_DAYS} days. Only a Founder / Super Admin can approve it: ask one to issue it, or choose ${formatDate(defaultValidUntil)} or earlier.`) : "A different validity period is an exception. The reason is recorded."}</p>
                <label className="block font-sans text-caption text-ordift-ink-muted">Reason for this validity (required)
                  <textarea name="exceptionReason" rows={2} minLength={10} required className={FIELD} placeholder="For example: agreed in writing with the client" />
                </label>
              </div>
            )}
            <label className="flex items-start gap-3 font-sans text-body-small text-ordift-ink">
              <input type="checkbox" name="confirm" required className="mt-1 h-5 w-5" />
              <span>I confirm I want to issue this quotation now. I understand this records the issue date and validity but does not send it to the client.</span>
            </label>
            <SubmitButton pendingLabel="Issuing…" className="min-h-11 w-full sm:w-auto rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small font-semibold text-white disabled:opacity-50">Issue quotation</SubmitButton>
          </form>
        </section>
      )}

      {(status === "sent" || status === "accepted") && !crewManaged && (
        <section aria-labelledby="deliv-h" className="space-y-2 rounded-lg border border-black/10 p-3 sm:p-4">
          <h2 id="deliv-h" className="font-serif font-medium text-body text-ordift-ink">Delivery to the client</h2>
          <p className="font-sans text-body-small text-ordift-ink">{deliveredText ?? "Not recorded. Issuing did not email or notify the client: share the quotation yourself, then record it here."}</p>
          {deliveryState?.ok === true && deliveryState.message && <p role="status" className="font-sans text-caption text-green-800">{deliveryState.message}</p>}
          {deliveryState?.ok === false && <p role="alert" className="font-sans text-caption text-red-800">{deliveryState.error}</p>}
          <details className="rounded-lg border border-black/10 px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-2 font-sans text-body-small text-ordift-ink">Record that I delivered it</summary>
            <form action={deliveryAction} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="hidden" name="quotationId" value={quotationId} />
              <label className="font-sans text-caption text-ordift-ink-muted">How was it delivered?
                <select name="channel" required defaultValue="" className={FIELD}><option value="" disabled>Choose…</option>{DELIVERY_CHANNELS_UI.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              </label>
              <label className="font-sans text-caption text-ordift-ink-muted">When?<LocalDateTimeField name="deliveredAt" className={FIELD} /></label>
              <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Note (optional)<input name="note" maxLength={300} className={FIELD} /></label>
              <div className="sm:col-span-2"><SubmitButton pendingLabel="Recording…" className="min-h-11 w-full sm:w-auto rounded-md border border-black/20 px-4 py-2 font-sans text-body-small font-semibold text-ordift-ink">Record delivery</SubmitButton></div>
            </form>
          </details>
        </section>
      )}

      {options.length > 0 && (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="quotationId" value={quotationId} />
          {options.map((opt) => (
            <SubmitButton key={opt.status} name="status" value={opt.status} pendingLabel="Saving…" className="min-h-11 font-sans text-caption font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink">{opt.label}</SubmitButton>
          ))}
        </form>
      )}
      {state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}

      {status === "sent" && !crewManaged && expired && (
        <p role="status" className="rounded-lg border border-red-300 bg-red-50 p-3 font-sans text-body-small text-red-900">This quotation has expired, so acceptance cannot be recorded against it. Use Revise to create a new version (its validity starts fresh when you issue it).</p>
      )}
      {status === "sent" && !crewManaged && !expired && (
        <details className="rounded-lg border border-black/10 px-3 py-2">
          <summary className="min-h-11 cursor-pointer py-2 font-sans text-body-small text-ordift-ink">Record acceptance (with evidence)</summary>
          <p className="mt-2 font-sans text-caption text-ordift-ink-muted">
            Use this when the client has accepted by email, message, telephone or in person. It is audited under your name. It records the acceptance only: it does not set the amount due, create a payment, send an email or confirm a booking. An acceptance received after the validity date cannot be recorded.
          </p>
          <form action={acceptAction} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="hidden" name="quotationId" value={quotationId} />
            <label className="font-sans text-caption text-ordift-ink-muted">How was it received?
              <select name="channel" required defaultValue="" className={FIELD}><option value="" disabled>Choose…</option>{ACCEPTANCE_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            </label>
            <label className="font-sans text-caption text-ordift-ink-muted">Who accepted (client side)<input name="acceptedByName" required minLength={2} className={FIELD} /></label>
            <label className="font-sans text-caption text-ordift-ink-muted">When was it received?<LocalDateTimeField name="receivedAt" className={FIELD} /></label>
            <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Evidence / reference (required)
              <textarea name="evidence" required minLength={10} rows={2} placeholder="For example: WhatsApp reply on 20 Oct, “Yes, go ahead”, saved screenshot in the project folder" className={FIELD} />
            </label>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Recording…" className="min-h-11 w-full sm:w-auto font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">Record acceptance</SubmitButton></div>
          </form>
          {acceptState?.ok === false && <p className="mt-2 font-sans text-caption text-red-700">{acceptState.error}</p>}
          {acceptState?.ok === true && <p className="mt-2 font-sans text-caption text-green-700">Acceptance recorded.</p>}
        </details>
      )}
    </div>
  );
}
