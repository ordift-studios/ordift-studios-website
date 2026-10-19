"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { OVERRIDE_CATEGORIES, OVERRIDE_REASON_MIN_CHARS } from "@/lib/commercial/amountDueRules";
import { attachQuotationAction, establishAmountDueAction, overrideAmountDueAction } from "./amountDueActions";

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const primary = "min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small";

// Establish: the preview is computed on the server and re-checked inside the database transaction. The hidden fields carry the rate that was PREVIEWED, so a
// rate that changed meanwhile is refused instead of silently used. Submitting twice is harmless: the second call is a no-op.
export function EstablishAmountDueForm(props: {
  enquiryId: string;
  quotationId: string;
  usdAmount: number;
  rateToUsd: number;
  rateEffectiveFrom: string | null;
  rateJumpPercent: number | null;
  noop: boolean;
}) {
  return (
    <ActionForm action={establishAmountDueAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={props.enquiryId} />
      <input type="hidden" name="quotationId" value={props.quotationId} />
      <input type="hidden" name="expectedRateToUsd" value={props.rateEffectiveFrom ? String(props.rateToUsd) : ""} />
      <input type="hidden" name="expectedRateEffectiveFrom" value={props.rateEffectiveFrom ?? ""} />
      {props.rateJumpPercent != null ? (
        <label className="flex items-start gap-2 font-sans text-caption text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
          <input type="checkbox" name="acknowledgeRateJump" className="mt-1" />
          <span>The rate moved {props.rateJumpPercent}% from the previous one. I have checked it is correct.</span>
        </label>
      ) : null}
      <p className="font-sans text-caption text-ordift-ink-muted">
        Confirming makes USD {props.usdAmount.toFixed(2)} the amount due. A client with a portal account can then pay it. This does not send an email, change the stage, or create a booking, payment or obligation.
      </p>
      <SubmitButton pendingLabel="Establishing…" className={primary}>
        {props.noop ? "Already established" : "Establish amount due"}
      </SubmitButton>
    </ActionForm>
  );
}

export function AttachQuotationForm({ enquiryId, options }: { enquiryId: string; options: { id: string; reference: string; status: string; currency: string; total: number; party: string }[] }) {
  if (options.length === 0) return <p className="font-sans text-caption text-ordift-ink-muted">No unattached draft or sent quotation is available to attach.</p>;
  return (
    <ActionForm action={attachQuotationAction} className="space-y-2">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <label htmlFor="attach-quotation" className="font-sans text-caption text-ordift-ink-muted block">Attach an existing quotation</label>
      <select id="attach-quotation" name="quotationId" required defaultValue="" className={field}>
        <option value="">Choose a quotation…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.reference} · {o.party || "no name"} · {o.currency} {o.total.toFixed(2)} · {o.status}</option>
        ))}
      </select>
      <SubmitButton pendingLabel="Attaching…" className={primary}>Attach</SubmitButton>
    </ActionForm>
  );
}

// Override: Super Admin only (re-checked on the server and in the database). A reason alone is not enough: category, a specific written reason, evidence, and
// the enquiry reference typed to confirm. The before and after values are shown and recorded in the register.
export function OverrideAmountDueForm({ enquiryId, enquiryReference, currentAmount }: { enquiryId: string; enquiryReference: string; currentAmount: number | null }) {
  return (
    <ActionForm action={overrideAmountDueAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <p className="font-sans text-caption text-ordift-ink-muted">Current amount due: {currentAmount != null ? `USD ${currentAmount.toFixed(2)}` : "not set"}</p>
      <div>
        <label htmlFor="override-amount" className="font-sans text-caption text-ordift-ink-muted block mb-1">New amount due (USD)</label>
        <input id="override-amount" name="newAmountUsd" type="number" step="0.01" min="0.01" max="1000000" required className={field} />
      </div>
      <div>
        <label htmlFor="override-category" className="font-sans text-caption text-ordift-ink-muted block mb-1">Category</label>
        <select id="override-category" name="category" required defaultValue="" className={field}>
          <option value="">Choose…</option>
          {OVERRIDE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="override-reason" className="font-sans text-caption text-ordift-ink-muted block mb-1">Reason (at least {OVERRIDE_REASON_MIN_CHARS} characters: what was agreed and why)</label>
        <textarea id="override-reason" name="reason" required rows={3} className={field} />
      </div>
      <div>
        <label htmlFor="override-evidence" className="font-sans text-caption text-ordift-ink-muted block mb-1">Evidence reference (where the agreement is recorded; not needed for a data-entry correction)</label>
        <input id="override-evidence" name="evidence" className={field} />
      </div>
      <div>
        <label htmlFor="override-confirm" className="font-sans text-caption text-ordift-ink-muted block mb-1">Type {enquiryReference} to confirm</label>
        <input id="override-confirm" name="typedReference" required autoComplete="off" className={field} />
      </div>
      <SubmitButton pendingLabel="Saving…" className={primary}>Override amount due</SubmitButton>
    </ActionForm>
  );
}
