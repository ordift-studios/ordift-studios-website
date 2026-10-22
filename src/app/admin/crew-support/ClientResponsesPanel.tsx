import { RATING_CATEGORIES } from "@/lib/portal/clientDelivery";
import type { AdminClientResponses } from "@/lib/crewSupport/clientResponses";

// "Client Acceptance & Feedback" + read-only closure summary for one Crew Support request. It only displays the client's real,
// audited responses and the current state - it has no buttons and changes nothing. Rendered only on the request screen, which
// is already limited to people authorised to manage Crew Support.

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qatar" }) + " (Qatar)";
const LABELS: Record<string, string> = { overall: "Overall", quality: "Photography quality", professionalism: "Professionalism", communication: "Communication", punctuality: "Punctuality" };
const TONE: Record<"good" | "attention" | "neutral", string> = { good: "text-green-800", attention: "text-amber-800", neutral: "text-ordift-ink" };

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-sans text-body-small text-ordift-ink">{value}</dd>
      {sub && <dd className="font-sans text-caption text-ordift-ink-muted">{sub}</dd>}
    </div>
  );
}

export default function ClientResponsesPanel({ data }: { data: AdminClientResponses }) {
  const { view, closure, acceptedButNotCompleted } = data;
  const lastCorrection = view.corrections[view.corrections.length - 1] ?? null;
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-5" aria-labelledby="client-responses-heading">
      <div>
        <h2 id="client-responses-heading" className="font-serif font-medium text-body text-ordift-ink">Client Acceptance &amp; Feedback</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">The client&apos;s own confirmations as recorded in the portal ({data.reference}). Display only — nothing here closes the request or completes the engagement.</p>
      </div>

      {acceptedButNotCompleted && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-900">
          The client has accepted this delivery, but the internal engagement is <strong>not yet formally completed</strong>. Closing is a separate, manual sequence (see the closure summary below).
        </p>
      )}

      {!view.hasAnyResponse ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">The client has not confirmed receipt, accepted the delivery or sent feedback yet.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Stat label="Receipt confirmed" value={view.receipt ? `Yes — ${fmt(view.receipt.at)}` : "No record"} sub={view.receipt && !view.receipt.coversCurrentFiles ? "Covers an earlier set of files" : undefined} />
          <Stat label="Delivery accepted" value={view.accepted ? `Yes — ${fmt(view.accepted.at)}` : "No record"} sub={view.accepted && !view.accepted.coversCurrentFiles ? "Covers an earlier set of files — more were released since" : undefined} />
          <Stat
            label="Correction requests"
            value={lastCorrection ? `${view.corrections.length} recorded — latest ${fmt(lastCorrection.at)}` : "None recorded"}
            sub={lastCorrection?.remarks ? `“${lastCorrection.remarks}”` : undefined}
          />
          <Stat label="Delivery batch" value={view.currentBatch ? `Current released set ${view.currentBatch}` : "No released files"} />
        </dl>
      )}

      {view.rating ? (
        <div className="rounded-lg bg-ordift-offwhite p-4 space-y-3">
          <p className="font-sans text-body-small font-medium text-ordift-ink">Experience rating — submitted {fmt(view.rating.at)}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {RATING_CATEGORIES.map((c) => (
              <div key={c.key}>
                <dt className="font-sans text-caption text-ordift-ink-muted">{LABELS[c.key]}</dt>
                <dd className="font-serif text-heading-4 text-ordift-ink">{view.rating!.ratings[c.key] !== undefined ? `${view.rating!.ratings[c.key]}/10` : "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="font-sans text-body-small text-ordift-ink"><span className="text-ordift-ink-muted">Client comment: </span>{view.rating.comment ? `“${view.rating.comment}”` : "None"}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">Professional: {data.professionalName ?? "not recorded"} · Project: {data.reference} · Service: Creative Crew Support · Batch {view.rating.batch ?? "—"}</p>
        </div>
      ) : (
        <p className="font-sans text-body-small text-ordift-ink-muted">Experience rating: not submitted.</p>
      )}

      <div>
        <h3 className="font-sans text-body-small font-medium text-ordift-ink">Closure summary <span className="font-normal text-ordift-ink-muted">(read-only)</span></h3>
        <dl className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10">
          {closure.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="font-sans text-body-small text-ordift-ink-muted">{row.label}</dt>
              <dd className={`font-sans text-body-small font-medium ${TONE[row.tone]}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {view.history.length > 0 && (
        <div>
          <h3 className="font-sans text-body-small font-medium text-ordift-ink">History <span className="font-normal text-ordift-ink-muted">(every submission and update, oldest first)</span></h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full min-w-[640px] text-left font-sans text-caption">
              <thead className="bg-ordift-offwhite text-ordift-ink-muted">
                <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">What</th><th className="px-3 py-2 font-medium">Detail</th><th className="px-3 py-2 font-medium">Internal email</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-ordift-ink">
                {view.history.map((h, i) => (
                  <tr key={`${h.at}-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(h.at)}</td>
                    <td className="px-3 py-2">{h.title}{!h.coversCurrentFiles && " (earlier file set)"}</td>
                    <td className="px-3 py-2 text-ordift-ink-muted">{h.detail ?? "—"}</td>
                    <td className="px-3 py-2 text-ordift-ink-muted">{h.notification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-sans text-caption text-ordift-ink-muted">The record above is the source of truth even if an email failed or was never attempted.</p>
        </div>
      )}
    </section>
  );
}
