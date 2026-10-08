"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import type { ActionState } from "@/lib/shared/actionState";
import type { EditableLine } from "@/lib/crewSupport/quotationRules";
import { saveQuotationDraftAction } from "./quotationActions";

type Line = EditableLine & { key: string };
const UNITS = ["hour", "half_day", "full_day", "item", "service", "other"];
const field = "rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small text-ordift-ink w-full";

function money(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function CrewQuotationEditor({
  quotationId, requestId, initialLines, validUntil, terms, internalNotes, fxCurrency, currencies, termsReference, termsCitation, paymentCondition, depositPercent,
}: {
  quotationId: string; requestId: string; initialLines: EditableLine[]; validUntil: string | null; terms: string | null; internalNotes: string | null; fxCurrency: string | null; currencies: { code: string; name: string }[]; termsReference: string | null; termsCitation: string | null; paymentCondition: "none" | "deposit" | "full"; depositPercent: number | null;
}) {
  const [lines, setLines] = useState<Line[]>(() => initialLines.map((l, i) => ({ ...l, key: `l${i}` })));
  const [state, formAction] = useActionState<ActionState, FormData>(saveQuotationDraftAction, null);
  const [termsText, setTermsText] = useState(terms ?? "");
  const [condition, setCondition] = useState(paymentCondition);
  // The form is submitted through a transition instead of <form action>:
  // React 19 resets a <form action> after it settles, and a reset puts
  // every <select> back on its first <option> ("hour") even though the
  // saved/controlled value is "full day" (QA 2026-10-07). onSubmit has
  // no reset, so what the editor shows always equals what is stored.
  const [pending, startTransition] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = useMemo(() => lines.reduce((sum, l) => { const gross = (Number(l.quantity) || 0) * (Number(l.sellingRate) || 0); const afterDiscount = gross - (l.discountPercent ? gross * (l.discountPercent / 100) : 0); return sum + afterDiscount + (l.taxPercent ? afterDiscount * (l.taxPercent / 100) : 0); }, 0), [lines]);

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="quotationId" value={quotationId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ key, ...rest }) => { void key; return rest; }))} />

      <div className="space-y-3">
        {lines.map((l, i) => {
          const governed = l.governedUnitPrice;
          const overridden = governed !== null && Number(l.sellingRate) !== governed;
          return (
            <div key={l.key} className="rounded-lg border border-black/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-sans text-caption text-ordift-ink-muted">
                  Line {i + 1} · {governed === null ? <span className="text-amber-800">Manual — no governed rate</span> : overridden ? <span className="text-amber-800">Adjusted (governed rate USD {money(governed)})</span> : <span className="text-green-700">Governed rate</span>}
                </p>
                <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="font-sans text-caption text-red-700 underline underline-offset-4">Remove</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Item<input className={field} value={l.serviceItem} onChange={(e) => patch(l.key, { serviceItem: e.target.value })} /></label>
                <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Description (client-visible)<input className={field} value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} /></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Quantity<input type="number" min="0" step="0.01" className={field} value={l.quantity} onChange={(e) => patch(l.key, { quantity: Number(e.target.value) })} /></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Unit<select className={field} value={l.unitBasis} onChange={(e) => patch(l.key, { unitBasis: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u.replace("_", " ")}</option>)}</select></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Price (USD)<input type="number" min="0" step="0.01" className={field} value={l.sellingRate} onChange={(e) => patch(l.key, { sellingRate: Number(e.target.value) })} /></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Discount %<input type="number" min="0" max="100" step="0.01" className={field} value={l.discountPercent ?? ""} onChange={(e) => patch(l.key, { discountPercent: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Tax %<input type="number" min="0" step="0.01" className={field} value={l.taxPercent ?? ""} onChange={(e) => patch(l.key, { taxPercent: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                {(overridden || governed === null) && (
                  <label className="sm:col-span-3 font-sans text-caption text-ordift-ink-muted">{overridden ? "Adjustment reason (required, internal)" : "Justification for the manual price (required when priced, internal)"}<input className={field} value={l.adjustmentReason} onChange={(e) => patch(l.key, { adjustmentReason: e.target.value })} /></label>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, { key: `n${Date.now()}`, requirementId: null, serviceItem: "", description: "", quantity: 1, unitBasis: "item", sellingRate: 0, discountPercent: null, taxPercent: null, governedUnitPrice: null, adjustmentReason: "", sourceReference: null }])} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">+ Add manual line (equipment, travel, extra)</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="font-sans text-caption text-ordift-ink-muted">Valid until (required to issue)<input type="date" name="validUntil" defaultValue={validUntil ?? ""} required className={field} /></label>
        <label className="font-sans text-caption text-ordift-ink-muted">Show local-currency equivalent<select name="fxCurrency" defaultValue={fxCurrency ?? ""} className={field}><option value="">USD only</option>{currencies.filter((c) => c.code !== "USD").map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></label>
        <p className="font-sans text-body-small text-ordift-ink self-end">Total: <strong>USD {money(total)}</strong></p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Payment condition before confirmation
          <select name="paymentCondition" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className={field}>
            <option value="none">No payment required before confirmation</option>
            <option value="deposit">Deposit required before confirmation</option>
            <option value="full">Full payment required before confirmation</option>
          </select>
        </label>
        {condition === "deposit" && (
          <label className="font-sans text-caption text-ordift-ink-muted">Deposit (% of total)<input type="number" name="depositPercent" min="1" max="100" step="0.01" required defaultValue={depositPercent ?? ""} className={field} /></label>
        )}
        <p className="sm:col-span-3 font-sans text-caption text-ordift-ink-muted">When a payment is required, the request can&apos;t be confirmed until that amount has been received (card payment or a verified manual transfer). With no payment required, confirmation is not held up by payment. Shown to the client on the quotation.</p>
      </div>
      <div className="space-y-1">
        <label className="block font-sans text-caption text-ordift-ink-muted">Terms shown to the client — payment / deposit conditions, cancellation and rescheduling (required to issue)<textarea name="terms" rows={4} value={termsText} onChange={(e) => setTermsText(e.target.value)} className={field} /></label>
        {termsReference && !termsText.includes(termsReference) && (
          <button type="button" onClick={() => setTermsText((t) => (t.trim() ? `${t.trim()}\n\n${termsReference}` : termsReference))} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Insert reference to Ordift&apos;s approved Booking Terms (OS-LGL-004)</button>
        )}
        {termsReference && termsCitation && <p className="font-sans text-caption text-ordift-ink-muted">Applicability: {termsCitation}</p>}
        {!termsReference && <p className="font-sans text-caption text-amber-800">The approved Master Booking Terms can&apos;t be referenced here because their own scope clause doesn&apos;t demonstrably cover this service. State the terms for this engagement explicitly.</p>}
        <p className="font-sans text-caption text-ordift-ink-muted">Only the terms you or the approved Booking Terms state appear here — nothing is added automatically. Event details (date, location, schedule, roles, equipment) are filled in from the request when the quotation is issued.</p>
      </div>
      <label className="block font-sans text-caption text-ordift-ink-muted">Internal notes (never shown to the client)<textarea name="internalNotes" rows={2} defaultValue={internalNotes ?? ""} className={field} /></label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small disabled:opacity-60">{pending ? "Saving…" : "Save draft"}</button>
        {state?.ok === true && <p role="status" className="font-sans text-caption text-green-700">{state.message}</p>}
        {state?.ok === false && <p role="alert" className="font-sans text-caption text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
