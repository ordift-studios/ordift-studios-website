import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getClientQuotation } from "@/lib/commercial/clientQuotations";
import { QuotationStatusActions } from "./QuotationStatusActions";

export const metadata: Metadata = {
  title: "Quotation — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const quotation = await getClientQuotation(id);
  if (!quotation) notFound();

  return (
    <div className="max-w-3xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/pricing/quotations" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
            ← Client Quotations
          </Link>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">
            {quotation.quotationReference}
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
            {quotation.clientName ?? quotation.prospectName} {quotation.prospectCompany ? `(${quotation.prospectCompany})` : ""}
          </p>
        </div>
        <Link
          href={`/admin/pricing/quotations/${quotation.id}/pdf`}
          target="_blank"
          className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink"
        >
          View / Print PDF →
        </Link>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-6 mb-6">
        <QuotationStatusActions quotationId={quotation.id} status={quotation.status} hasClient={Boolean(quotation.clientProfileId)} />
      </div>

      <div className="rounded-xl border border-black/10 bg-white overflow-x-auto mb-6">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Item</th>
              <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Qty</th>
              <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Rate</th>
              <th className="px-4 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-2 font-sans text-body-small text-ordift-ink">
                  {item.serviceItem}
                  {item.sourceType !== "manual" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full font-sans text-[0.65rem] bg-ordift-gold/20 text-ordift-gold-pressed">
                      {item.sourceType === "pricing" ? "Pricing" : "Pricing (adjusted)"}
                    </span>
                  )}
                  {item.description && <span className="block text-caption text-ordift-ink-muted">{item.description}</span>}
                  {item.sourceReference && <span className="block text-caption text-ordift-ink-muted">Source: {item.sourceReference}</span>}
                </td>
                <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted">{item.quantity} {item.unitBasis}</td>
                <td className="px-4 py-2 font-sans text-body-small text-ordift-ink-muted tabular-nums">{quotation.currency} {item.sellingRate.toFixed(2)}</td>
                <td className="px-4 py-2 font-sans text-body-small text-ordift-ink tabular-nums">{quotation.currency} {item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-1 mb-6">
        <p className="font-sans text-body-small text-ordift-ink-muted flex justify-between"><span>Subtotal</span><span>{quotation.currency} {quotation.subtotal.toFixed(2)}</span></p>
        {quotation.discountTotal > 0 && <p className="font-sans text-body-small text-ordift-ink-muted flex justify-between"><span>Discount</span><span>-{quotation.currency} {quotation.discountTotal.toFixed(2)}</span></p>}
        {quotation.taxTotal > 0 && <p className="font-sans text-body-small text-ordift-ink-muted flex justify-between"><span>Tax</span><span>{quotation.currency} {quotation.taxTotal.toFixed(2)}</span></p>}
        <p className="font-sans text-body font-semibold text-ordift-ink flex justify-between pt-2 border-t border-black/10"><span>Total</span><span>{quotation.currency} {quotation.total.toFixed(2)}</span></p>
      </div>

      {(quotation.paymentBookingTerms || quotation.commercialNotes) && (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          {quotation.paymentBookingTerms && (
            <div>
              <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Payment / Booking Terms</p>
              <p className="font-sans text-body-small text-ordift-ink whitespace-pre-line">{quotation.paymentBookingTerms}</p>
            </div>
          )}
          {quotation.commercialNotes && (
            <div>
              <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Commercial Notes (internal)</p>
              <p className="font-sans text-body-small text-ordift-ink whitespace-pre-line">{quotation.commercialNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
