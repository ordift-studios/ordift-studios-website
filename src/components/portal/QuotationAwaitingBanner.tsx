import Link from "next/link";
import type { AwaitingQuotation } from "@/lib/crewSupport/quotation";

// Shown on the client dashboard and inside the project workspace while a
// quotation is waiting for the client. Commercial figures only — none of the staff-side
// data (cost, markup, price provenance, notes) ever reaches here.
export default function QuotationAwaitingBanner({ quotations }: { quotations: AwaitingQuotation[] }) {
  if (quotations.length === 0) return null;
  return (
    <div className="space-y-3" role="region" aria-label="Quotations awaiting your acceptance">
      {quotations.map((q) => (
        <div key={q.reference} className="rounded-xl border border-ordift-gold/40 bg-white p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-serif font-medium text-body text-ordift-ink">A quotation is waiting for your acceptance</p>
            <p className="font-sans text-body-small text-ordift-ink-muted">
              {q.reference} · {q.currency} {q.total.toFixed(2)}{q.validUntil ? ` · valid until ${q.validUntil}` : ""}
            </p>
          </div>
          <Link href={`/portal/client/projects/enquiry/${q.enquiryId}/quotation`} className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">
            Review and accept
          </Link>
        </div>
      ))}
    </div>
  );
}
