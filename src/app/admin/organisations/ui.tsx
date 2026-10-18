import Link from "next/link";
import type { LinkedRecordView } from "@/lib/directory/directory";
import type { TransactionContext } from "@/lib/directory/links";

// Shared read-only pieces for the directory screens. Entities and markets are SHOWN from the existing contracting-entity and payment-market
// records; nothing on these screens sets either.

export const FIELD = "rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
export const BUTTON = "rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small";
export const BUTTON_QUIET = "rounded-lg border border-black/20 px-3 py-1.5 font-sans text-caption text-ordift-ink";

const MARKET: Record<string, string> = { GH: "Ghana market", QA: "Qatar market" };

export function ContextSummary({ context }: { context: TransactionContext }) {
  if (context.entities.length === 0 && context.markets.length === 0 && context.warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {context.entities.map((e) => (
          <span key={e} className="rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink">Contracted by {e}</span>
        ))}
        {context.markets.map((m) => (
          <span key={m} className="rounded-full border border-black/15 px-3 py-1 font-sans text-caption text-ordift-ink">{MARKET[m]}</span>
        ))}
        {context.withoutEntity > 0 ? <span className="rounded-full border border-dashed border-black/20 px-3 py-1 font-sans text-caption text-ordift-ink-muted">{context.withoutEntity} without a contracting entity yet</span> : null}
      </div>
      {context.warnings.map((w) => (
        <p key={w} className="rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 font-sans text-body-small text-amber-900">{w}</p>
      ))}
    </div>
  );
}

export function LinkedRecords({ records }: { records: LinkedRecordView[] }) {
  if (records.length === 0) return <p className="font-sans text-body-small text-ordift-ink-muted">Nothing is linked yet.</p>;
  return (
    <ul className="divide-y divide-black/5">
      {records.map((r) => (
        <li key={`${r.type}-${r.id}`} className="py-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={r.type === "enquiry" ? `/admin/enquiries/${r.id}` : `/admin/pricing/quotations/${r.id}`} className="font-sans text-body-small font-medium text-ordift-ink underline underline-offset-4">
              {r.type === "enquiry" ? "Enquiry" : "Quotation"} {r.label}
            </Link>
            {r.isTest ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-caption text-amber-900">test</span> : null}
            <p className="font-sans text-caption text-ordift-ink-muted">{[r.service, r.status.replace(/_/g, " ")].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2 font-sans text-caption text-ordift-ink-muted">
            {r.entityName ? <span>{r.entityName}</span> : null}
            {r.paymentCountry ? <span>{MARKET[r.paymentCountry]}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function strengthLabel(strength: string): string {
  switch (strength) {
    case "same_person": return "same personal email";
    case "exact": return "same name";
    case "likely": return "very similar";
    default: return "possibly the same";
  }
}
