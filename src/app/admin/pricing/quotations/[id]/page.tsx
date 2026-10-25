import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getClientQuotation } from "@/lib/commercial/clientQuotations";
import { QuotationStatusActions } from "./QuotationStatusActions";
import { ReviseQuotationButton, DeleteQuotationButton } from "./QuotationRecordActions";
import ClientRecordPanel from "../../../organisations/ClientRecordPanel";
import ContractingEntitySection from "../../../organisations/ContractingEntitySection";
import { getQuotationAcceptanceRecord } from "@/lib/commercial/quotationAcceptance";
import { getQuotationDelivery } from "@/lib/commercial/quotationIssuance";
import { defaultValidUntil, formatDate, isExpired, issuanceBlockers, utcDate } from "@/lib/commercial/quotationValidity";
import { DELIVERY_CHANNELS_UI } from "@/lib/commercial/quotationDeliveryChannels";
import QuotationDatesCard from "./QuotationDatesCard";

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
  const acceptance = quotation.status === "accepted" ? await getQuotationAcceptanceRecord(quotation.id) : null;
  const now = new Date();
  const today = utcDate(now);
  const delivery = quotation.status === "sent" || quotation.status === "accepted" ? await getQuotationDelivery(quotation.id) : null;
  const deliveredText = delivery ? `Delivered via ${DELIVERY_CHANNELS_UI.find((c) => c.value === delivery.channel)?.label ?? delivery.channel} on ${formatDate(delivery.deliveredAt)} (recorded by staff; the system sent nothing)` : null;
  const expired = isExpired(quotation.status, quotation.validUntil, today);
  const blockers = issuanceBlockers({ status: quotation.status, lineCount: quotation.items.length, total: quotation.total, crewManaged: quotation.crewManaged });

  return (
    <div className="max-w-5xl">
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/pricing/quotations/${quotation.id}/pdf`}
            target="_blank"
            className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink"
          >
            View / Download PDF →
          </Link>
          {quotation.status === "draft" && (
            <Link
              href={`/admin/pricing/quotations/${quotation.id}/edit`}
              className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-black/15 text-ordift-ink"
            >
              Edit
            </Link>
          )}
          {quotation.status === "sent" && <ReviseQuotationButton quotationId={quotation.id} />}
          {quotation.status === "draft" && <DeleteQuotationButton quotationId={quotation.id} />}
        </div>
      </div>

      {quotation.enquiryId ? (
        <p className="font-sans text-caption text-ordift-ink-muted mb-4">
          For enquiry <Link href={`/admin/enquiries/${quotation.enquiryId}`} className="text-ordift-gold-pressed underline underline-offset-4">{quotation.enquiryReference ?? "view"}</Link>. The amount due is established from the enquiry page once this quotation is accepted.
        </p>
      ) : null}

      {quotation.version > 1 && (
        <p className="font-sans text-caption text-ordift-ink-muted mb-4">Version {quotation.version} — revises an earlier issued quotation.</p>
      )}

      {acceptance && (
        <div className="rounded-xl border border-black/10 bg-white p-6 mb-6 space-y-1">
          <p className="font-sans text-body-small font-medium text-ordift-ink">Client acceptance recorded</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            {acceptance.via === "client_portal" ? "Accepted by the client in the portal" : "Recorded by staff"}
            {acceptance.channel ? ` · received by ${acceptance.channel.replace(/_/g, " ")}` : ""}
            {acceptance.byName ? ` · accepted by ${acceptance.byName}` : ""}
            {acceptance.receivedAt ? ` · received ${acceptance.receivedAt.slice(0, 16).replace("T", " ")} UTC` : ""}
          </p>
          {acceptance.evidence ? <p className="font-sans text-caption text-ordift-ink-muted whitespace-pre-wrap">Evidence: {acceptance.evidence}</p> : null}
          <p className="font-sans text-caption text-ordift-ink-muted">A recorded acceptance is not a booking. It did not set the amount due, create a payment or send an email.</p>
        </div>
      )}

      <QuotationDatesCard
        createdAt={quotation.createdAt} issuedAt={quotation.issuedAt} validUntil={quotation.validUntil} status={quotation.status} today={today}
        deliveryText={quotation.status === "draft" ? "Not applicable until it is issued" : deliveredText ?? "Not recorded (issuing does not send it to the client)"}
        acceptanceText={quotation.status === "accepted" ? "Accepted (recorded)" : quotation.status === "sent" ? (expired ? "Not accepted — expired" : "Not yet accepted") : quotation.status === "draft" ? "Not applicable until it is issued" : "Not accepted"}
      />

      <div className="rounded-xl border border-black/10 bg-white p-4 sm:p-6 mb-6">
        <QuotationStatusActions quotationId={quotation.id} status={quotation.status} hasClient={Boolean(quotation.clientProfileId)} today={today} defaultValidUntil={defaultValidUntil(now)} currentValidUntil={quotation.validUntil}
          isSuperAdmin={isSuperAdmin(user)} blockers={blockers} expired={expired} deliveredText={deliveredText} />
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

      {isSuperAdmin(user) ? (
        <div className="mt-6 space-y-6">
          <ContractingEntitySection userId={user.id} subject={{ type: "quotation", id: quotation.id }} />
          <ClientRecordPanel userId={user.id} subject={{ type: "quotation", id: quotation.id }} />
        </div>
      ) : null}
    </div>
  );
}
