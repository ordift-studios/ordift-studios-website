import type { LedgerRow } from "@/lib/commercial/amountDue";
import { OVERRIDE_CATEGORIES } from "@/lib/commercial/amountDueRules";

const categoryLabel = (v: string | null) => OVERRIDE_CATEGORIES.find((c) => c.value === v)?.label ?? v ?? "";
const usd = (n: number | null) => (n == null ? "none" : `USD ${n.toFixed(2)}`);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Read-only list of the append-only ledger: every establishment and override, with before and after values, who and when.
export default function AmountEventsTable({ rows, showEnquiry = false }: { rows: LedgerRow[]; showEnquiry?: boolean }) {
  if (rows.length === 0) return <p className="font-sans text-body-small text-ordift-ink-muted">Nothing recorded yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-black/10">
            {["When", ...(showEnquiry ? ["Enquiry"] : []), "Kind", "Before", "After", "Detail", "By"].map((h) => (
              <th key={h} className="px-3 py-2 font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-black/5 last:border-0 align-top">
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink-muted whitespace-nowrap">{when(r.createdAt)}</td>
              {showEnquiry ? <td className="px-3 py-2 font-sans text-caption text-ordift-ink">{r.enquiryReference ?? ""}</td> : null}
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink">{r.kind === "override" ? "Override" : "Established"}</td>
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink-muted tabular-nums">{usd(r.amountBefore)}{r.sourceBefore ? ` (${r.sourceBefore.replace(/_/g, " ")})` : ""}</td>
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink tabular-nums">{usd(r.amountAfter)} ({r.sourceAfter.replace(/_/g, " ")})</td>
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink-muted">
                {r.kind === "established" ? (
                  <>
                    {r.quotationReference} · {r.quotationCurrency} {r.quotationTotal?.toFixed(2)}
                    {r.quotationCurrency && r.quotationCurrency !== "USD" && r.fxRateToUsd ? ` at 1 USD = ${r.fxRateToUsd} ${r.quotationCurrency}${r.fxRateEffectiveFrom ? ` (rate dated ${r.fxRateEffectiveFrom.slice(0, 10)})` : ""}` : ""}
                  </>
                ) : (
                  <>
                    <span className="block text-ordift-ink">{categoryLabel(r.category)}</span>
                    <span className="block whitespace-pre-wrap">{r.reason}</span>
                    {r.evidenceReference ? <span className="block">Evidence: {r.evidenceReference}</span> : null}
                  </>
                )}
              </td>
              <td className="px-3 py-2 font-sans text-caption text-ordift-ink-muted">{r.actorLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
