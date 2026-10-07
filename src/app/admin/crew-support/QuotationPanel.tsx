import Link from "next/link";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import type { QuotationAdminView } from "@/lib/crewSupport/quotation";
import { ACCEPTANCE_CHANNELS } from "@/lib/crewSupport/quotationRules";
import type { CrewSupportStatus } from "@/lib/crewSupport/config";
import CrewQuotationEditor from "./CrewQuotationEditor";
import { completeAcceptanceAction, completeIssueAction, discardQuotationDraftAction, issueQuotationAction, markQuotationReadyAction, prepareQuotationAction, recordAcceptanceAction, returnQuotationToDraftAction } from "./quotationActions";

const btn = "rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small";
const btn2 = "rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink";
const field = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const STATUS_TEXT: Record<string, string> = { draft: "Draft", ready: "Ready to issue", sent: "Issued — awaiting client acceptance", accepted: "Accepted" };

function Summary({ q }: { q: QuotationAdminView }) {
  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full text-left">
        <thead><tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted"><th className="pb-1 pr-3">Item</th><th className="pb-1 pr-3">Qty</th><th className="pb-1 pr-3">Price</th><th className="pb-1 pr-3">Total</th><th className="pb-1">Source (internal)</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {q.lines.map((l) => (
            <tr key={l.id} className="font-sans text-body-small text-ordift-ink align-top">
              <td className="py-1.5 pr-3">{l.serviceItem}{l.description ? <span className="block text-caption text-ordift-ink-muted">{l.description}</span> : null}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{l.quantity} {l.unitBasis.replace("_", " ")}</td>
              <td className="py-1.5 pr-3">{l.sellingRate.toFixed(2)}</td>
              <td className="py-1.5 pr-3">{l.lineTotal.toFixed(2)}</td>
              <td className="py-1.5 text-caption text-ordift-ink-muted">{l.sourceType === "pricing" ? "Governed rate" : l.sourceType === "adjusted" ? `Adjusted from ${l.governedUnitPrice?.toFixed(2)} — ${l.adjustmentReason}` : "Manual — no governed rate"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-sans text-body-small text-ordift-ink">Total: <strong>{q.currency} {q.total.toFixed(2)}</strong>{q.validUntil ? ` · valid until ${q.validUntil}` : ""}{q.fxCurrency ? ` · local equivalent shown in ${q.fxCurrency}${q.fxRate ? ` (rate ${q.fxRate} locked ${q.fxLockedAt?.slice(0, 10)})` : " (rate locks when issued)"}` : ""}</p>
    </div>
  );
}

export default function QuotationPanel({
  requestId, requestStatus, quotation, markets, currencies, enquiry, canPrepare,
}: {
  requestId: string; requestStatus: CrewSupportStatus; quotation: QuotationAdminView | null; markets: { slug: string; name: string }[]; currencies: { code: string; name: string }[];
  enquiry: { id: string; crmStage: string; amountDue: number | null }; canPrepare: boolean;
}) {
  const q = quotation;
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4" aria-labelledby="quotation-heading">
      <div>
        <h2 id="quotation-heading" className="font-serif font-medium text-body text-ordift-ink">Quotation</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Client selling price only — crew pay and costs live in Payables and never appear here. Linked enquiry:{" "}
          <Link href={`/admin/enquiries/${enquiry.id}`} className="text-ordift-gold-pressed underline underline-offset-4">CRM stage “{enquiry.crmStage.replace(/_/g, " ")}”</Link>
          {" · "}amount due {enquiry.amountDue != null ? `USD ${Number(enquiry.amountDue).toFixed(2)}` : "not set yet (set automatically when the quotation is accepted)"}.
        </p>
      </div>

      {!q && (
        canPrepare ? (
          <ActionForm action={prepareQuotationAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="requestId" value={requestId} />
            <label className="font-sans text-caption text-ordift-ink-muted">Pricing market<select name="marketSlug" className={`${field} block mt-1`} defaultValue=""><option value="" disabled>Choose a market…</option>{markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select></label>
            <SubmitButton pendingLabel="Preparing…" className={btn}>Prepare quotation</SubmitButton>
            <p className="font-sans text-caption text-ordift-ink-muted w-full">Lines come from governed Crew Support rates where they exist; otherwise they&apos;re clearly marked manual lines for you to price. Nothing is estimated.</p>
          </ActionForm>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">A quotation can be prepared once the request is in Availability review.</p>
        )
      )}

      {q && (
        <>
          <p className="font-sans text-body-small text-ordift-ink"><strong>{q.reference}</strong> — {STATUS_TEXT[q.status] ?? q.status}{q.isTest ? " · TEST record (no real emails or receivables)" : ""}</p>

          {q.status === "draft" && (
            <>
              <CrewQuotationEditor quotationId={q.id} requestId={requestId} initialLines={q.lines} validUntil={q.validUntil} terms={q.terms} internalNotes={q.internalNotes} fxCurrency={q.fxCurrency} currencies={currencies} />
              <div className="flex flex-wrap gap-3 border-t border-black/5 pt-3">
                <ActionForm action={markQuotationReadyAction}><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><SubmitButton pendingLabel="Checking…" className={btn}>Mark ready for issue</SubmitButton></ActionForm>
                <ActionForm action={discardQuotationDraftAction}><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><ConfirmSubmitButton confirmMessage="Discard this draft quotation? It was never issued." pendingLabel="Discarding…" className={btn2}>Discard draft</ConfirmSubmitButton></ActionForm>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">Save the draft before marking it ready. “Ready” means reviewed; the client sees nothing until you issue it.</p>
            </>
          )}

          {q.status === "ready" && (
            <>
              <Summary q={q} />
              <div className="flex flex-wrap gap-3">
                <ActionForm action={issueQuotationAction}><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><ConfirmSubmitButton confirmMessage="Issue this quotation to the client? The request becomes “Quote issued”, the enquiry becomes “Quotation sent”, and the client is notified." pendingLabel="Issuing…" className={btn}>Issue quotation</ConfirmSubmitButton></ActionForm>
                <ActionForm action={returnQuotationToDraftAction}><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><SubmitButton pendingLabel="Returning…" className={btn2}>Return to draft</SubmitButton></ActionForm>
              </div>
            </>
          )}

          {(q.status === "sent" || q.status === "accepted") && <Summary q={q} />}

          {q.status === "sent" && (
            <div className="space-y-3 border-t border-black/5 pt-3">
              <p className="font-sans text-caption text-ordift-ink-muted">Issued {q.issuedAt?.slice(0, 10)}. The client can accept in their portal (preferred). <Link href={`/admin/pricing/quotations/${q.id}/pdf`} className="text-ordift-gold-pressed underline underline-offset-4">Open printable quotation</Link></p>
              {requestStatus === "quote_preparation" && (
                <ActionForm action={completeIssueAction} className="flex items-center gap-3"><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><SubmitButton pendingLabel="Syncing…" className={btn2}>Complete issue synchronisation</SubmitButton><span className="font-sans text-caption text-amber-800">The quotation is issued but the request status didn&apos;t finish updating.</span></ActionForm>
              )}
              <details className="rounded-lg border border-black/10 p-4">
                <summary className="cursor-pointer font-sans text-body-small text-ordift-ink">Record an acceptance received outside the portal</summary>
                <ActionForm action={recordAcceptanceAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} />
                  <label className="font-sans text-caption text-ordift-ink-muted">How was it received?<select name="channel" className={`${field} block w-full mt-1`} defaultValue="">{<option value="" disabled>Choose…</option>}{ACCEPTANCE_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
                  <label className="font-sans text-caption text-ordift-ink-muted">Who accepted (client side)<input name="acceptedByName" className={`${field} block w-full mt-1`} /></label>
                  <label className="font-sans text-caption text-ordift-ink-muted">When was it received?<input type="datetime-local" name="receivedAt" className={`${field} block w-full mt-1`} /></label>
                  <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Evidence / reference (required)<textarea name="evidence" rows={2} className={`${field} block w-full mt-1`} placeholder="e.g. Email from the client dated 8 Oct, 'Happy to proceed'" /></label>
                  <div className="sm:col-span-2"><ConfirmSubmitButton confirmMessage="Record this acceptance on the client's behalf? It is audited under your name and sets the amount due." pendingLabel="Recording…" className={btn}>Record acceptance</ConfirmSubmitButton></div>
                </ActionForm>
              </details>
            </div>
          )}

          {q.status === "accepted" && (
            <div className="space-y-2 border-t border-black/5 pt-3">
              <p className="font-sans text-body-small text-ordift-ink">
                {q.acceptedVia === "client_portal" ? "Accepted directly by the client in the portal" : `Acceptance recorded by staff on behalf of the client (${ACCEPTANCE_CHANNELS.find((c) => c.value === q.acceptanceChannel)?.label ?? q.acceptanceChannel}) — accepted by ${q.acceptedByName}, received ${q.acceptanceReceivedAt?.slice(0, 16).replace("T", " ")} UTC. Evidence: ${q.acceptanceEvidence}`} · {q.acceptedAt?.slice(0, 10)}
              </p>
              {(requestStatus === "quoted" || enquiry.amountDue === null || Number(enquiry.amountDue) !== q.usdTotal) && (
                <ActionForm action={completeAcceptanceAction} className="flex items-center gap-3"><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="requestId" value={requestId} /><SubmitButton pendingLabel="Completing…" className={btn2}>Complete acceptance</SubmitButton><span className="font-sans text-caption text-amber-800">Amount due or request status hasn&apos;t finished updating.</span></ActionForm>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
