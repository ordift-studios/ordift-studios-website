import { quotationDates } from "@/lib/commercial/quotationValidity";

// Created on / Issued on / Valid until, the same three facts everywhere. A draft shows a prominent DRAFT indicator and "Not yet issued": an issue date is only ever the REAL recorded
// issue time, never the creation date and never invented. Creation, issuance, delivery to the client and client acceptance are four different things and are shown as such.
export default function QuotationDatesCard({ createdAt, issuedAt, validUntil, status, deliveryText, acceptanceText, today }: { createdAt: string; issuedAt: string | null; validUntil: string | null; status: string; deliveryText: string; acceptanceText: string; today: string }) {
  const d = quotationDates({ createdAt, issuedAt, validUntil, status }, today);
  const rows: { label: string; value: string; tone?: "warn" | "bad" }[] = [
    { label: "Created on", value: d.createdText },
    { label: "Issued on", value: d.issuedText, tone: d.draft ? "warn" : undefined },
    { label: "Valid until", value: d.validText, tone: d.expired ? "bad" : undefined },
    { label: "Delivered to client", value: deliveryText },
    { label: "Client acceptance", value: acceptanceText },
  ];
  return (
    <section aria-label="Quotation dates and status" className="rounded-xl border border-black/10 bg-white p-4 sm:p-6 mb-6">
      {d.draft && (
        <p role="status" className="mb-3 inline-flex items-center rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 font-sans text-body-small font-semibold uppercase tracking-wide text-amber-900">Draft — not yet issued</p>
      )}
      {d.expired && !d.draft && (
        <p role="status" className="mb-3 inline-flex items-center rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-sans text-body-small font-semibold uppercase tracking-wide text-red-900">Expired — cannot be accepted</p>
      )}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-black/5 py-1.5 sm:block sm:border-0">
            <dt className="font-sans text-caption text-ordift-ink-muted">{r.label}</dt>
            <dd className={`font-sans text-body-small font-medium ${r.tone === "bad" ? "text-red-800" : r.tone === "warn" ? "text-amber-900" : "text-ordift-ink"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
