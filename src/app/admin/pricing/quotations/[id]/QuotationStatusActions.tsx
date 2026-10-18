"use client";

import { useActionState } from "react";
import { recordQuotationAcceptanceAction, updateQuotationStatusAction, type ActionState } from "../actions";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalDateTimeField from "@/components/admin/LocalDateTimeField";
import { ACCEPTANCE_CHANNELS } from "@/lib/crewSupport/quotationRules";

// Acceptance is no longer a bare "Mark Accepted" status flip. It is recorded with its evidence (how it was received, who accepted, when, and a reference),
// by the form below. Recording it records that the client said yes: it does not set the amount due, create a payment or confirm a booking.
const NEXT_STATUS: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "sent", label: "Mark Sent" }],
  sent: [
    { status: "declined", label: "Mark Declined" },
    { status: "expired", label: "Mark Expired" },
  ],
};

const FIELD = "block w-full mt-1 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small text-ordift-ink";

export function QuotationStatusActions({ quotationId, status }: { quotationId: string; status: string; hasClient: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateQuotationStatusAction, null);
  const [acceptState, acceptAction] = useActionState<ActionState, FormData>(recordQuotationAcceptanceAction, null);
  const options = NEXT_STATUS[status] ?? [];

  return (
    <div className="space-y-3">
      <p className="font-sans text-body-small text-ordift-ink-muted">
        Status: <strong className="text-ordift-ink">{status}</strong>
      </p>
      {options.length > 0 && (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="quotationId" value={quotationId} />
          {options.map((opt) => (
            <SubmitButton
              key={opt.status}
              name="status"
              value={opt.status}
              pendingLabel="Saving…"
              className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md border border-black/15 text-ordift-ink"
            >
              {opt.label}
            </SubmitButton>
          ))}
        </form>
      )}
      {state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}

      {status === "sent" && (
        <details className="rounded-lg border border-black/10 px-3 py-2">
          <summary className="cursor-pointer font-sans text-body-small text-ordift-ink">Record acceptance (with evidence)</summary>
          <p className="mt-2 font-sans text-caption text-ordift-ink-muted">
            Use this when the client has accepted by email, message, telephone or in person. It is audited under your name. It records the acceptance only: it does not set the amount due, create a payment, send an email or confirm a booking.
          </p>
          <form action={acceptAction} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="hidden" name="quotationId" value={quotationId} />
            <label className="font-sans text-caption text-ordift-ink-muted">
              How was it received?
              <select name="channel" required defaultValue="" className={FIELD}>
                <option value="" disabled>Choose…</option>
                {ACCEPTANCE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="font-sans text-caption text-ordift-ink-muted">
              Who accepted (client side)
              <input name="acceptedByName" required minLength={2} className={FIELD} />
            </label>
            <label className="font-sans text-caption text-ordift-ink-muted">
              When was it received?
              <LocalDateTimeField name="receivedAt" className={FIELD} />
            </label>
            <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">
              Evidence / reference (required)
              <textarea name="evidence" required minLength={10} rows={2} placeholder="For example: WhatsApp reply on 20 Oct, “Yes, go ahead”, saved screenshot in the project folder" className={FIELD} />
            </label>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Recording…" className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">Record acceptance</SubmitButton>
            </div>
          </form>
          {acceptState?.ok === false && <p className="mt-2 font-sans text-caption text-red-700">{acceptState.error}</p>}
          {acceptState?.ok === true && <p className="mt-2 font-sans text-caption text-green-700">Acceptance recorded.</p>}
        </details>
      )}
    </div>
  );
}
