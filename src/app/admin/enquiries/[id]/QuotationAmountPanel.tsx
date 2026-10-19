import Link from "next/link";
import type { AmountDuePanel } from "@/lib/commercial/amountDue";
import { AttachQuotationForm, EstablishAmountDueForm, OverrideAmountDueForm } from "./AmountDueForms";
import AmountEventsTable from "./AmountEventsTable";

const money = (c: string, n: number) => `${c} ${n.toFixed(2)}`;

// Enquiry-to-booking M2a — "Quotation and amount due". Read-only display plus the explicit actions. Nothing here moves the stage, sends an email, or creates a
// payment, obligation or booking; the establish action only records the amount due (and the rate used) from an accepted quotation.
export default function QuotationAmountPanel({ panel }: { panel: AmountDuePanel }) {
  const { enquiry: e, activeQuotation: q, assessment: a } = panel;
  if (e.isCrewSupport) {
    return (
      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">Quotation and amount due</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">This is a Creative Crew Support enquiry. Its quotation and amount due are managed from the Crew Support request.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-5" aria-labelledby="qa-heading">
      <h2 id="qa-heading" className="font-serif font-medium text-body text-ordift-ink">Quotation and amount due</h2>

      {!q ? (
        <div className="space-y-3">
          <p className="font-sans text-body-small text-ordift-ink-muted">No active quotation is linked to this enquiry.</p>
          <Link href={`/admin/pricing/quotations/new?enquiryId=${e.id}`} className="inline-block font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink">
            Create a quotation for this enquiry
          </Link>
          <AttachQuotationForm enquiryId={e.id} options={panel.attachable} />
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-sans text-body-small text-ordift-ink">
            <Link href={`/admin/pricing/quotations/${q.id}`} className="text-ordift-gold-pressed underline underline-offset-4">{q.reference}</Link>
            {" "}· version {q.version} · {q.status} · {money(q.currency, q.total)}
          </p>
          {q.status === "accepted" ? (
            <p className="font-sans text-caption text-ordift-ink-muted">Accepted {q.acceptedAt ? q.acceptedAt.slice(0, 10) : ""} ({q.acceptedVia === "client_portal" ? "in the portal" : "recorded by staff"}).</p>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">Not accepted yet. Mark it sent, then record the client&apos;s acceptance with its evidence on the quotation page.</p>
          )}
          <p className="font-sans text-caption text-ordift-ink-muted">Contracting entity: {panel.entityRecorded ? "recorded" : "not recorded. A Super Admin must choose it before acceptance can be recorded."}</p>
          {panel.directoryMismatch ? <p className="font-sans text-caption text-amber-900">The quotation and the enquiry point to different directory contacts. Nothing was changed; please check.</p> : null}
        </div>
      )}

      {q ? (
        <div className="border-t border-black/5 pt-4 space-y-3">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Establish the amount due</p>
          {e.amountDue != null && e.amountDueQuotationId === q.id ? (
            <p className="font-sans text-body-small text-green-700">Established from this quotation: USD {e.amountDue.toFixed(2)}{q.fxLockedAt ? ` (rate locked ${q.fxLockedAt.slice(0, 10)})` : ""}.</p>
          ) : null}
          {a.canEstablish && a.preview ? (
            <>
              <div className="rounded-lg bg-black/[0.03] px-4 py-3 space-y-1 font-sans text-body-small text-ordift-ink">
                <p>Quotation: {money(q.currency, q.total)}</p>
                <p>Amount due: <strong>USD {a.preview.usdAmount.toFixed(2)}</strong></p>
                {q.currency !== "USD" ? (
                  <p className="text-ordift-ink-muted">
                    Rate: 1 USD = {a.preview.rateToUsd} {q.currency}
                    {a.preview.rateEffectiveFrom ? ` · dated ${a.preview.rateEffectiveFrom.slice(0, 10)} (${a.preview.rateAgeDays} days old)` : ""}
                    {a.preview.rateNote ? ` · ${a.preview.rateNote}` : ""}
                  </p>
                ) : null}
                <p className="font-sans text-caption text-ordift-ink-muted">At payment time the client&apos;s payable is converted at that day&apos;s rate, so the local amount can differ slightly from the quoted total.</p>
                <p className="font-sans text-caption text-ordift-ink-muted">Payment market: {e.paymentCountry === "GH" ? "Ghana" : "Qatar"}</p>
              </div>
              {a.preview.noop ? (
                <p className="font-sans text-caption text-ordift-ink-muted">Already established. Nothing to do.</p>
              ) : (
                <EstablishAmountDueForm enquiryId={e.id} quotationId={q.id} usdAmount={a.preview.usdAmount} rateToUsd={a.preview.rateToUsd} rateEffectiveFrom={a.preview.rateEffectiveFrom} rateJumpPercent={a.preview.rateJump?.changePercent ?? null} noop={false} />
              )}
            </>
          ) : (
            <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink-muted space-y-1">
              {a.blockers.map((b) => <li key={b.code}>{b.message}</li>)}
            </ul>
          )}
        </div>
      ) : null}

      {panel.viewer.isSuperAdmin ? (
        <details className="border-t border-black/5 pt-4">
          <summary className="cursor-pointer font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Super Admin: override the amount due</summary>
          <div className="mt-3"><OverrideAmountDueForm enquiryId={e.id} enquiryReference={e.reference} currentAmount={e.amountDue} /></div>
        </details>
      ) : null}

      {panel.history.length > 0 ? (
        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">Quotation history</p>
          <ul className="space-y-1 font-sans text-caption text-ordift-ink-muted">
            {panel.history.map((h) => (
              <li key={h.id}>
                <Link href={`/admin/pricing/quotations/${h.id}`} className="underline underline-offset-4">{h.reference}</Link> · v{h.version} · {h.status} · {money(h.currency, h.total)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.events.length > 0 ? (
        <div className="border-t border-black/5 pt-4 space-y-2">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Amount due record</p>
          <AmountEventsTable rows={panel.events} />
        </div>
      ) : null}
    </section>
  );
}
