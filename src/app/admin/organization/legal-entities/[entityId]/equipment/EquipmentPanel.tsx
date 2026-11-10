"use client";

import { useState } from "react";
import { useRestoringActionState } from "@/components/admin/useRestoringActionState";
import { viewEntityDocumentAction } from "../actions";
import { markInstalmentPaidAction, recordEquipmentAction, recordPaymentAction, setTermsAction, voidPaymentAction, type ActionState } from "./actions";
import { ARRANGEMENT_LABEL, PAYMENT_KINDS, PAYMENT_METHODS } from "@/lib/organization/acquisitionPaymentRules";
import { INSTALMENT_STATE_LABEL, type DocRef, type EquipmentView, type InstalmentView, type PaymentView } from "@/lib/organization/equipmentPanelView";
import type { PositionFlag } from "@/lib/organization/financePosition";

const input = "rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small";
const button = "justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50";
const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export const FLAG_LABEL: Record<PositionFlag, string> = {
  classification_pending_professional_review: "Accounting classification pending professional advice (no policy applied)",
  funding_not_confirmed: "Who paid and with which instrument is not confirmed",
  funding_awaiting_statement_verification: "Funding source is the Founder’s statement only — the card/bank statement has not verified it yet",
  invoice_not_in_entity_name: "The invoice names an individual (not this legal entity) — company ownership and accounting treatment are to be decided; who bought it does not by itself make it a company asset",
  schedule_months_are_expected_not_provider: "Months of the pending instalments are expected, not the provider's schedule",
  paid_instalments_awaiting_statement: "Reported-paid instalments are awaiting statement reconciliation",
  paid_without_any_evidence: "A paid instalment has no evidence recorded",
  instalments_do_not_add_up_to_financed_amount: "Instalments do not add up to the financed amount",
  financed_amount_differs_from_net_price: "Financed amount differs from the net purchase price",
  net_price_arithmetic_mismatch: "Net price is not list price minus discount",
  arrangement_not_confirmed: "How this purchase is paid has not been confirmed — nothing is assumed to be paid",
  arrangement_says_paid_but_balance_open: "Marked 'paid in full' but the recorded payments do not cover the net price",
  supplier_balance_overdue: "The supplier balance is past its due date",
  payments_awaiting_statement: "Reported payments are awaiting statement verification (none is bank-verified)",
  payments_exceed_net_price: "Recorded payments exceed the net price (should be impossible — investigate)",
};
const STATE_STYLE: Record<InstalmentView["state"], string> = {
  pending: "bg-slate-100 text-slate-700", paid_awaiting_statement: "bg-amber-50 text-amber-800", paid_verified_by_statement: "bg-green-50 text-green-800", void: "bg-slate-100 text-slate-500",
};

function Feedback({ state, pending }: { state: ActionState; pending: boolean }) {
  if (pending) return null;
  if (state?.ok === true) return <p className="sm:col-span-2 font-sans text-caption text-green-700">Saved.</p>;
  if (state?.ok === false) return <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>;
  return null;
}

function DocLink({ d, label }: { d: DocRef | null; label: string }) {
  if (!d) return <li className="font-sans text-caption text-ordift-ink-muted">{label}: <span className="italic">none linked</span></li>;
  return (
    <li className="font-sans text-caption text-ordift-ink-muted">
      {label}: {d.filename ?? d.id} <span className="font-mono">SHA-256 {d.sha256 ? `${d.sha256.slice(0, 12)}…` : "not recorded"}</span>{" "}
      <form action={viewEntityDocumentAction} target="_blank" className="inline"><input type="hidden" name="documentId" value={d.id} /><button type="submit" className="font-semibold text-ordift-gold-pressed underline underline-offset-4">View →</button></form>
    </li>
  );
}

function MarkPaidForm({ entityId, instalment, docs }: { entityId: string; instalment: InstalmentView; docs: DocRef[] }) {
  const [state, action, pending, ref] = useRestoringActionState<ActionState>(markInstalmentPaidAction, null);
  return (
    <form ref={ref} action={action} className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="instalmentId" value={instalment.id} />
      <p className="sm:col-span-2 font-sans text-caption font-semibold text-ordift-ink">Record instalment {instalment.sequence} as reported paid</p>
      <label className="font-sans text-caption text-ordift-ink-muted">Date paid (as the evidence shows)<input name="paidOn" type="date" required className={`block w-full ${input}`} /></label>
      <label className="font-sans text-caption text-ordift-ink-muted">Evidence document (optional if you write a note)
        <select name="evidenceDocumentId" defaultValue="" className={`block w-full ${input}`}><option value="">No document</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.filename ?? d.id}</option>)}</select></label>
      <textarea name="evidenceNote" rows={2} placeholder="What the evidence shows (at least 10 characters if no document)" className={`sm:col-span-2 ${input}`} />
      <label className="sm:col-span-2 flex gap-2 font-sans text-caption text-ordift-ink-muted"><input type="checkbox" name="confirmUnverified" value="yes" required />I understand this records the payment as REPORTED. It is not bank-reconciled until a statement line is matched.</label>
      <button disabled={pending} className={button}>{pending ? "Saving…" : "Record as reported paid"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

const SETTLEMENT_STYLE: Record<string, string> = { unpaid: "bg-slate-100 text-slate-700", partially_paid: "bg-amber-50 text-amber-800", paid: "bg-green-50 text-green-800" };

function Separation({ e }: { e: EquipmentView }) {
  const p = e.position, c = e.currency, financed = p.arrangement === "financed";
  const cell = "rounded-lg border border-black/10 p-3 space-y-1";
  const h = "font-sans text-caption font-semibold uppercase tracking-wide text-ordift-gold-pressed";
  const t = "font-sans text-body-small text-ordift-ink";
  const owesSupplier = p.arrangement === "supplier_credit" || p.arrangement === "deposit_and_balance" || p.arrangement === "unpaid";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="separation">
      <div className={cell}><p className={h}>1 · Acquisition cost</p>
        <p className={t}>List {money(e.listPrice, c)}</p><p className={t}>Discount −{money(e.discount, c)}</p><p className={`${t} font-semibold`}>Net {money(e.net, c)}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">What the supplier invoice says was bought.</p></div>
      {financed ? (
        <div className={cell}><p className={h}>2 · Financing liability</p>
          <p className={t}>Financed {money(p.financed, c)}</p><p className={`${t} font-semibold`}>Outstanding {money(p.outstandingLiability, c)}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">Owed to the financing provider, not the supplier.</p></div>
      ) : (
        <div className={cell}><p className={h}>2 · {owesSupplier ? "Owed to the supplier" : "Balance not yet evidenced as paid"}</p>
          <p className={`${t} font-semibold`}>{money(p.supplierBalance, c)}</p>
          {p.balanceDueOn ? <p className={t}>Due {p.balanceDueOn}</p> : null}
          <p className="font-sans text-caption text-ordift-ink-muted">{owesSupplier ? "Net price minus the payments recorded." : "Net price minus the payments recorded. This is not a liability until the arrangement says so."}</p></div>
      )}
      <div className={cell}><p className={h}>3 · Actual payments</p>
        <p className={t}>Reported paid {money(p.paidTotal, c)}</p><p className={t}>Verified by statement {money(p.paidVerifiedByStatement, c)}</p><p className={`${t} font-semibold`}>Awaiting statement {money(p.paidAwaitingStatement, c)}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">{financed ? "Instalments settle the financing; they are not new purchases." : "Payments settle the purchase; they are not new costs."}</p></div>
      <div className={cell}><p className={h}>4 · Accounting expense</p>
        <p className={`${t} font-semibold`}>Recognised {money(p.expenseRecognised, c)}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">{e.classificationLabel}. Neither the purchase, a payment nor an instalment is counted as an expense.</p></div>
    </div>
  );
}

// One set of payment fields, used by the "record a purchase" form (prefix "payment") and by the "record a payment" form (no prefix). Arrangement is about the PRICE; method is about ONE payment.
function PaymentFields({ prefix, docs, defaultKind }: { prefix?: string; docs: DocRef[]; defaultKind: string }) {
  const [method, setMethod] = useState("bank_transfer");
  const n = (k: string) => (prefix ? `${prefix}${k[0].toUpperCase()}${k.slice(1)}` : k);
  return (
    <>
      <select name={n("kind")} defaultValue={defaultKind} className={input} aria-label="Kind of payment">{PAYMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      <input name={n("amount")} inputMode="decimal" placeholder="Amount paid" className={input} aria-label="Amount paid" />
      <label className="font-sans text-caption text-ordift-ink-muted">Date paid (as the evidence shows)<input name={n("paidOn")} type="date" className={`block w-full ${input}`} /></label>
      <label className="font-sans text-caption text-ordift-ink-muted">How it was paid<select name={n("method")} value={method} onChange={(ev) => setMethod(ev.target.value)} className={`block w-full ${input}`}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      {method === "other" ? <input name={n("methodNote")} placeholder="Describe the method" className={`sm:col-span-2 ${input}`} /> : null}
      <input name={n("reference")} placeholder={method === "cheque" ? "Cheque number" : "Reference (transfer, receipt or cheque number — optional)"} className={`sm:col-span-2 ${input}`} />
      <label className="font-sans text-caption text-ordift-ink-muted sm:col-span-2">Evidence document (or write a note below)
        <select name={n("evidenceDocumentId")} defaultValue="" className={`block w-full ${input}`}><option value="">No document</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.filename ?? d.id}</option>)}</select></label>
      <textarea name={n("evidenceNote")} rows={2} placeholder="What the evidence shows (at least 10 characters if no document)" className={`sm:col-span-2 ${input}`} />
      <label className="sm:col-span-2 flex gap-2 font-sans text-caption text-ordift-ink-muted"><input type="checkbox" name={prefix ? `${prefix}ConfirmUnverified` : "confirmUnverified"} value="yes" />I understand this is recorded as REPORTED. It is not bank-reconciled until a statement line is matched, and it is not an accounting expense.</label>
    </>
  );
}

function PaymentForm({ entityId, acquisitionId, docs, defaultKind }: { entityId: string; acquisitionId: string; docs: DocRef[]; defaultKind: string }) {
  const [state, action, pending, ref] = useRestoringActionState<ActionState>(recordPaymentAction, null);
  return (
    <form ref={ref} action={action} className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="acquisitionId" value={acquisitionId} />
      <PaymentFields docs={docs} defaultKind={defaultKind} />
      <button disabled={pending} className={button}>{pending ? "Saving…" : "Record payment"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function TermsFields({ arrangement, onChange }: { arrangement: string; onChange?: (v: string) => void }) {
  return (
    <>
      <select name="arrangement" value={arrangement} onChange={onChange ? (ev) => onChange(ev.target.value) : undefined} className={`sm:col-span-2 ${input}`} aria-label="How is it paid?">
        <option value="to_confirm">To be confirmed (nothing is assumed paid)</option>
        <option value="paid_in_full">{ARRANGEMENT_LABEL.paid_in_full}</option><option value="deposit_and_balance">{ARRANGEMENT_LABEL.deposit_and_balance}</option>
        <option value="supplier_credit">{ARRANGEMENT_LABEL.supplier_credit}</option><option value="unpaid">{ARRANGEMENT_LABEL.unpaid}</option>
        <option value="financed">{ARRANGEMENT_LABEL.financed}</option>
      </select>
      {arrangement === "supplier_credit" || arrangement === "deposit_and_balance" ? <label className="font-sans text-caption text-ordift-ink-muted">Balance due on {arrangement === "supplier_credit" ? "(required, as on the supplier's document)" : "(if stated)"}<input name="balanceDueOn" type="date" className={`block w-full ${input}`} /></label> : null}
      {arrangement !== "to_confirm" && arrangement !== "financed" ? <input name="supplierTerms" placeholder="Supplier's payment terms, as printed (optional)" className={input} /> : null}
    </>
  );
}

function ChangeTermsForm({ entityId, acquisitionId }: { entityId: string; acquisitionId: string }) {
  const [state, action, pending, ref] = useRestoringActionState<ActionState>(setTermsAction, null);
  const [arr, setArr] = useState("paid_in_full");
  return (
    <form ref={ref} action={action} className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="acquisitionId" value={acquisitionId} />
      <select name="arrangement" value={arr} onChange={(ev) => setArr(ev.target.value)} className={`sm:col-span-2 ${input}`} aria-label="How is it paid?">
        {(["paid_in_full", "deposit_and_balance", "supplier_credit", "unpaid"] as const).map((a) => <option key={a} value={a}>{ARRANGEMENT_LABEL[a]}</option>)}
      </select>
      {arr === "supplier_credit" || arr === "deposit_and_balance" ? <label className="font-sans text-caption text-ordift-ink-muted">Balance due on<input name="balanceDueOn" type="date" className={`block w-full ${input}`} /></label> : null}
      <input name="supplierTerms" placeholder="Supplier's payment terms, as printed (optional)" className={input} />
      <button disabled={pending} className={button}>{pending ? "Saving…" : "Set how it is paid"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function VoidForm({ entityId, payment }: { entityId: string; payment: PaymentView }) {
  const [state, action, pending, ref] = useRestoringActionState<ActionState>(voidPaymentAction, null);
  return (
    <form ref={ref} action={action} className="mt-1 flex flex-wrap items-end gap-2">
      <input type="hidden" name="entityId" value={entityId} /><input type="hidden" name="paymentId" value={payment.id} />
      <input name="reason" placeholder="Why is this entry void? (10+ characters)" className={`${input} min-w-[14rem]`} aria-label="Reason for voiding" />
      <button disabled={pending} className="font-sans text-caption font-semibold underline underline-offset-4 text-red-700 disabled:opacity-50">{pending ? "Voiding…" : "Void"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

function PaymentsSection({ e, entityId, financialDocs }: { e: EquipmentView; entityId: string; financialDocs: DocRef[] }) {
  const recorded = e.payments.filter((x) => x.status === "recorded");
  return (
    <div className="space-y-2">
      <p className="font-sans text-caption font-semibold text-ordift-ink">
        How is it paid? {e.arrangementLabel}{e.supplierTerms ? ` — supplier's terms: ${e.supplierTerms}` : ""}{e.position.balanceDueOn ? ` · balance due ${e.position.balanceDueOn}` : ""}
      </p>
      <details><summary className="cursor-pointer font-sans text-caption font-semibold text-ordift-gold-pressed">{e.position.arrangement === "to_confirm" ? "Set how it is paid" : "Change how it is paid"}</summary><ChangeTermsForm entityId={entityId} acquisitionId={e.id} /></details>
      {e.payments.length === 0 ? <p className="font-sans text-caption text-ordift-ink-muted">No payment is recorded for this purchase. Nothing is assumed to be paid.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left font-sans text-caption">
          <thead><tr className="text-ordift-ink-muted"><th className="py-1 pr-2">Date</th><th className="pr-2">Kind</th><th className="pr-2">Method</th><th className="pr-2">Amount</th><th className="pr-2">Status</th><th>Evidence</th></tr></thead>
          <tbody>{e.payments.map((x) => (
            <tr key={x.id} className="align-top border-t border-black/10">
              <td className="py-1 pr-2 whitespace-nowrap">{x.paidOn}</td><td className="pr-2">{x.kindLabel}</td>
              <td className="pr-2">{x.methodLabel}{x.methodNote ? ` — ${x.methodNote}` : ""}{x.reference ? <span className="block text-ordift-ink-muted">Ref {x.reference}</span> : null}</td>
              <td className="pr-2 whitespace-nowrap">{money(x.amount, e.currency)}</td>
              <td className="pr-2">{x.status === "void" ? <span className="rounded px-2 py-0.5 bg-slate-100 text-slate-500">Voided{x.voidReason ? ` — ${x.voidReason}` : ""}</span> : <span className="rounded px-2 py-0.5 bg-amber-50 text-amber-800">Reported — awaiting statement reconciliation (not bank-verified)</span>}</td>
              <td>{x.evidenceDoc ? <DocLink d={x.evidenceDoc} label="Document" /> : null}{x.evidenceNote ? <span className="block text-ordift-ink-muted">Note: {x.evidenceNote}</span> : null}
                {x.status === "recorded" ? <details><summary className="cursor-pointer text-red-700 underline underline-offset-4">Void</summary><VoidForm entityId={entityId} payment={x} /></details> : null}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {recorded.length > 0 || e.position.arrangement !== "unpaid" ? (
        <details><summary className="cursor-pointer font-sans text-caption font-semibold text-ordift-gold-pressed">Record a payment</summary>
          <PaymentForm entityId={entityId} acquisitionId={e.id} docs={financialDocs} defaultKind={e.position.arrangement === "paid_in_full" ? "full" : recorded.length === 0 ? "deposit" : "balance"} /></details>
      ) : <p className="font-sans text-caption text-ordift-ink-muted">The arrangement is “not yet paid”: change it before recording a payment.</p>}
    </div>
  );
}

function Card({ e, entityId, financialDocs }: { e: EquipmentView; entityId: string; financialDocs: DocRef[] }) {
  const f = e.financing;
  return (
    <article className="rounded-xl border border-black/10 bg-white p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="font-serif font-medium text-body text-ordift-ink">{e.itemDescription}{e.quantity > 1 ? ` × ${e.quantity}` : ""}</h3>
        <p className="font-sans text-caption text-ordift-ink-muted">{e.supplier}{e.branch ? `, ${e.branch}` : ""} · invoice {e.invoiceNumber} · purchased {e.purchaseDate} · {e.currency}</p>
        <p className="mt-1 flex flex-wrap gap-2 font-sans text-caption">
          <span className="rounded px-2 py-0.5 bg-slate-100 text-slate-700">{e.arrangementLabel}</span>
          <span className={`rounded px-2 py-0.5 ${SETTLEMENT_STYLE[e.position.settlement]}`}>{e.settlementLabel}</span>
          {e.position.paidTotal > 0 && e.position.paidVerifiedByStatement < e.position.paidTotal ? <span className="rounded px-2 py-0.5 bg-amber-50 text-amber-800">Pending statement verification</span> : null}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">Customer as printed: {e.customerAsShown ?? "not recorded"}{e.customerMatch === "differs_from_entity" ? " — differs from this legal entity" : ""}</p>
        <p className="font-sans text-caption text-ordift-ink-muted">Funding: {e.fundingLabel}{e.fundingNote ? ` — ${e.fundingNote}` : ""}</p>
      </div>
      <Separation e={e} />
      {e.position.flags.length > 0 && (
        <div><p className="font-sans text-caption font-semibold text-ordift-ink">Open items</p>
          <ul className="list-disc pl-5 font-sans text-caption text-amber-800">{e.position.flags.map((x) => <li key={x}>{FLAG_LABEL[x]}</li>)}</ul></div>
      )}
      <div><p className="font-sans text-caption font-semibold text-ordift-ink">Supporting documents (private vault, original unaltered)</p>
        <ul className="space-y-0.5"><DocLink d={e.invoiceDoc} label="Supplier invoice / receipt" /><DocLink d={f?.confirmationDoc ?? null} label="Financing confirmation" /><DocLink d={e.fundingStatementDoc} label="Statement evidence for the purchase" /></ul></div>
      {f ? (
        <div className="space-y-2">
          <p className="font-sans text-caption font-semibold text-ordift-ink">Financing agreement — {f.provider}, reference {f.reference} · {f.instalmentCount} instalments · {money(f.financed, e.currency)} · status {f.status}</p>
          {f.scheduleBasis === "founder_expected_months" && <p className="font-sans text-caption text-amber-800">Months shown for pending instalments are EXPECTED, not the provider’s published schedule. Not promised due dates.</p>}
          <div className="overflow-x-auto"><table className="w-full text-left font-sans text-caption">
            <thead><tr className="text-ordift-ink-muted"><th className="py-1 pr-2">#</th><th className="pr-2">Expected month</th><th className="pr-2">Amount</th><th className="pr-2">Status</th><th>Evidence</th></tr></thead>
            <tbody>{f.instalments.map((i) => (
              <tr key={i.id} className="align-top border-t border-black/10">
                <td className="py-1 pr-2">{i.sequence}</td><td className="pr-2 whitespace-nowrap">{month(i.expectedMonth)}</td><td className="pr-2 whitespace-nowrap">{money(i.amount, e.currency)}</td>
                <td className="pr-2"><span className={`rounded px-2 py-0.5 ${STATE_STYLE[i.state]}`}>{INSTALMENT_STATE_LABEL[i.state]}</span>{i.paidOn ? <span className="block text-ordift-ink-muted">paid {i.paidOn}</span> : null}</td>
                <td>{i.evidenceDoc ? <DocLink d={i.evidenceDoc} label="Provider document" /> : null}{i.evidenceNote ? <span className="block text-ordift-ink-muted">Note: {i.evidenceNote}</span> : null}{i.statementDoc ? <DocLink d={i.statementDoc} label="Statement" /> : null}</td>
              </tr>))}</tbody>
          </table></div>
          {f.instalments.filter((i) => i.state === "pending").slice(0, 1).map((i) => (
            <details key={i.id}><summary className="cursor-pointer font-sans text-caption font-semibold text-ordift-gold-pressed">Record instalment {i.sequence} as reported paid</summary><MarkPaidForm entityId={entityId} instalment={i} docs={financialDocs} /></details>
          ))}
        </div>
      ) : <PaymentsSection e={e} entityId={entityId} financialDocs={financialDocs} />}
    </article>
  );
}

function RecordForm({ entityId, invoiceDocs, financialDocs }: { entityId: string; invoiceDocs: DocRef[]; financialDocs: DocRef[] }) {
  const [state, action, pending, ref] = useRestoringActionState<ActionState>(recordEquipmentAction, null);
  const [arrangement, setArrangement] = useState("to_confirm");
  const paysNow = arrangement === "paid_in_full" || arrangement === "deposit_and_balance" || arrangement === "supplier_credit";
  return (
    <form ref={ref} action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Upload the receipt (and any payment or financing document) to the vault first (legal-entity page). This form links them; it never stores a file, creates an expense or marks anything bank-verified. No financing agreement is needed unless the purchase is financed.</p>
      <select name="invoiceDocumentId" required defaultValue="" className={`sm:col-span-2 ${input}`}><option value="" disabled>Choose the stored supplier invoice / receipt…</option>{invoiceDocs.map((d) => <option key={d.id} value={d.id}>{d.filename ?? d.id}</option>)}</select>
      <input name="supplier" required placeholder="Supplier" className={input} /><input name="branch" placeholder="Branch / outlet (if shown)" className={input} />
      <input name="invoiceNumber" required placeholder="Invoice number, exactly as printed" className={input} />
      <label className="font-sans text-caption text-ordift-ink-muted">Purchase date<input name="purchaseDate" type="date" required className={`block w-full ${input}`} /></label>
      <input name="itemDescription" required placeholder="Equipment, as described on the invoice" className={`sm:col-span-2 ${input}`} />
      <input name="itemCode" placeholder="Supplier item code (if printed)" className={input} /><input name="quantity" type="number" min={1} defaultValue={1} className={input} />
      <input name="currency" required maxLength={3} placeholder="Currency (e.g. QAR)" className={input} />
      <input name="customerAsShown" placeholder="Customer named on the invoice, exactly as printed" className={input} />
      <input name="listPrice" required inputMode="decimal" placeholder="List price" className={input} /><input name="discount" inputMode="decimal" placeholder="Discount (0 if none)" className={input} />
      <input name="net" required inputMode="decimal" placeholder="Net price" className={input} />
      <select name="fundingStatus" defaultValue="to_confirm" className={input}><option value="to_confirm">Payer / instrument not confirmed (recommended until a statement is seen)</option><option value="company_account">Company account / card</option><option value="founder_personal">Founder personally</option><option value="other_verified">Someone else (verified)</option></select>
      <input name="fundingNote" className={`sm:col-span-2 ${input}`} placeholder="How the payer is known, e.g. the Founder's own statement (required if not 'not confirmed')" />
      <p className="sm:col-span-2 font-sans text-caption font-semibold text-ordift-ink">How is it paid?</p>
      <TermsFields arrangement={arrangement} onChange={setArrangement} />
      {paysNow ? (<>
        <p className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Payment already made (optional — leave the amount empty if none yet). Only what the evidence shows.</p>
        <PaymentFields prefix="payment" docs={financialDocs} defaultKind={arrangement === "paid_in_full" ? "full" : arrangement === "deposit_and_balance" ? "deposit" : "part"} />
      </>) : null}
      {arrangement === "financed" ? (<>
        <input type="hidden" name="hasFinancing" value="yes" />
        <input name="provider" placeholder="Financing provider" className={input} /><input name="providerReference" placeholder="Provider reference / order ID, exactly as printed" className={input} />
        <input name="merchant" placeholder="Merchant as shown by the provider (optional)" className={input} /><input name="instalmentCount" type="number" min={2} max={24} placeholder="Number of instalments" className={input} />
        <label className="font-sans text-caption text-ordift-ink-muted">Plan started on<input name="plannedOn" type="date" className={`block w-full ${input}`} /></label>
        <label className="font-sans text-caption text-ordift-ink-muted">First instalment month (the 1st)<input name="firstMonth" type="date" className={`block w-full ${input}`} /></label>
        <select name="confirmationDocumentId" defaultValue="" className={`sm:col-span-2 ${input}`}><option value="">Choose the stored financing confirmation document…</option>{financialDocs.map((d) => <option key={d.id} value={d.id}>{d.filename ?? d.id}</option>)}</select>
        <select name="scheduleBasis" defaultValue="founder_expected_months" className={`sm:col-span-2 ${input}`}><option value="founder_expected_months">Later months are only EXPECTED (the provider’s schedule has not been seen)</option><option value="provider_schedule">Months are the provider’s own schedule</option></select>
        <label className="font-sans text-caption text-ordift-ink-muted">First instalment already paid on (only if the document shows it)<input name="firstPaidOn" type="date" className={`block w-full ${input}`} /></label>
        <input name="firstPaidEvidenceNote" placeholder="What the document shows (required with a payment date)" className={input} />
      </>) : null}
      <button disabled={pending} className={button}>{pending ? "Recording…" : "Record acquisition"}</button>
      <Feedback state={state} pending={pending} />
    </form>
  );
}

export function EquipmentPanel({ entityId, views, invoiceDocs, financialDocs }: { entityId: string; views: EquipmentView[]; invoiceDocs: DocRef[]; financialDocs: DocRef[] }) {
  return (
    <div className="space-y-6">
      {views.length === 0 ? <p className="rounded-xl border border-black/10 bg-white p-6 font-sans text-body-small text-ordift-ink-muted">No equipment acquisitions are recorded for this legal entity.</p>
        : views.map((v) => <Card key={v.id} e={v} entityId={entityId} financialDocs={financialDocs} />)}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Record an equipment acquisition</h2>
        <RecordForm entityId={entityId} invoiceDocs={invoiceDocs} financialDocs={financialDocs} />
      </section>
    </div>
  );
}
