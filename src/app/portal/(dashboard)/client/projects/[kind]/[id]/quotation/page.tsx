import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getClientQuotationViewForEnquiry } from "@/lib/crewSupport/quotation";
import { PrintButton } from "@/components/admin/PrintButton";
import { snapshotScheduleText } from "@/lib/crewSupport/quotationSnapshot";
import AcceptQuotationForm from "./AcceptQuotationForm";

// Client-facing quotation (Creative Crew Support). Reads a strict
// whitelist projection (toClientQuotationView): selling price only — no
// crew pay, costs, margins, price-source tracking, adjustment reasons or
// internal notes can reach this page.
function money(currency: string, n: number) {
  return `${currency} ${n.toFixed(2)}`;
}

export default async function ClientQuotationPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "enquiry") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/portal/client");
  const q = await getClientQuotationViewForEnquiry(id, user.id);
  if (!q) notFound();

  const expired = q.status === "sent" && q.validUntil && q.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Quotation</p>
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink">{q.reference}</h2>
        </div>
        <PrintButton />
      </div>

      {q.project && (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-1 font-sans text-body-small text-ordift-ink">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Project</p>
          <p className="font-medium">{q.project.projectName}{q.project.projectType ? ` — ${q.project.projectType}` : ""}</p>
          <p>{q.project.serviceLabel}</p>
          <p>Date and schedule: {snapshotScheduleText(q.project)}</p>
          <p>Location: {q.project.location}</p>
          <p>Equipment: {q.project.equipment ?? "To be confirmed"}</p>
          {q.project.roles.map((r, i) => <p key={i}>Crew: {r.quantity} × {r.role}{r.responsibilities ? ` — ${r.responsibilities}` : ""}</p>)}
        </div>
      )}

      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted"><th className="pb-2 pr-3">Item</th><th className="pb-2 pr-3">Qty</th><th className="pb-2 pr-3">Price</th><th className="pb-2 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {q.lines.map((l, i) => (
              <tr key={i} className="font-sans text-body-small text-ordift-ink align-top">
                <td className="py-2 pr-3">{l.item}{l.description ? <span className="block text-caption text-ordift-ink-muted">{l.description}</span> : null}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{l.quantity} {l.unitBasis.replace("_", " ")}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{money(q.currency, l.rate)}</td>
                <td className="py-2 text-right whitespace-nowrap">{money(q.currency, l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="space-y-1 font-sans text-body-small text-ordift-ink border-t border-black/10 pt-3">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(q.currency, q.subtotal)}</dd></div>
          {q.discountTotal > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(q.currency, q.discountTotal)}</dd></div>}
          {q.taxTotal > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{money(q.currency, q.taxTotal)}</dd></div>}
          <div className="flex justify-between font-medium text-body"><dt>Total</dt><dd>{money(q.currency, q.total)}</dd></div>
          {q.localEquivalent && <p className="text-caption text-ordift-ink-muted pt-1">Approximately {money(q.localEquivalent.currency, q.localEquivalent.amount)} at an exchange rate fixed when this quotation was issued. The quotation total is in {q.currency}.</p>}
        </dl>
        {q.validUntil && <p className="font-sans text-caption text-ordift-ink-muted">Valid until {q.validUntil}.</p>}
        {q.terms && <div><p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Payment / booking terms</p><p className="font-sans text-body-small text-ordift-ink whitespace-pre-line mt-1">{q.terms}</p></div>}
      </div>

      {q.status === "accepted" ? (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 font-sans text-body-small text-ordift-ink">
          Accepted{q.acceptedAt ? ` on ${q.acceptedAt.slice(0, 10)}` : ""}. Ordift will follow up with the next steps, including any agreement or payment details that apply. This is not yet a booking confirmation; crew availability and assignment are confirmed separately.
        </div>
      ) : expired ? (
        <p className="font-sans text-body-small text-red-700">This quotation has expired. Please contact Ordift for an updated quotation.</p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-ordift-offwhite p-5 space-y-3">
          <p className="font-sans text-body-small text-ordift-ink">If this quotation suits you, accept it here. If you can&apos;t use the portal, reply to our email and we can record your acceptance.</p>
          <AcceptQuotationForm enquiryId={id} />
        </div>
      )}
    </div>
  );
}
