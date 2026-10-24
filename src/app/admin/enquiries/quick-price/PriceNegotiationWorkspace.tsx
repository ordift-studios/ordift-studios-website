"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildClientSummary, captureFromHref, compareOptions, discountState, previewDiscount, type Captured, type DiscountInput } from "@/lib/pricing/quickPriceModel";

// Negotiation workspace: up to three independent calculator "options" (A original, B revised, C alternative) of the SAME governed estimator, kept
// mounted side by side so each keeps its inputs and can be restored for further revision by switching back to it. Results are read from the booking
// link each calculator already builds; there is no second pricing engine. Everything here lives in this browser tab only: a page refresh or a change
// of service clears it. Nothing is saved, approved, sent or posted.

const SLOTS = ["A", "B", "C"] as const;
type Slot = (typeof SLOTS)[number];
const LABEL: Record<Slot, string> = { A: "Option A — original", B: "Option B — revised", C: "Option C — alternative" };
const usd = (n: number) => `$${n.toFixed(2)} USD`;
const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const btn = "rounded-md px-4 py-2 font-sans text-body-small";

export default function PriceNegotiationWorkspace({ slots, isSuperAdmin }: { slots: ReactNode[]; isSuperAdmin: boolean }) {
  const [active, setActive] = useState<Slot>("A");
  const [live, setLive] = useState<Record<Slot, Captured>>({ A: { status: "unpriced", reason: "No calculator result yet." }, B: { status: "unpriced", reason: "No calculator result yet." }, C: { status: "unpriced", reason: "No calculator result yet." } });
  const [locked, setLocked] = useState<Partial<Record<Slot, Captured>>>({});
  const [preferred, setPreferred] = useState<Slot>("A");
  const [dType, setDType] = useState<DiscountInput["type"]>("percentage");
  const [dValue, setDValue] = useState("");
  const [dReason, setDReason] = useState("");
  const [useDiscount, setUseDiscount] = useState(false);
  const [copied, setCopied] = useState(false);
  const refs = useRef<Record<Slot, HTMLDivElement | null>>({ A: null, B: null, C: null });

  // Read each calculator's current result from the booking link it renders.
  useEffect(() => {
    const observers: MutationObserver[] = [];
    for (const s of SLOTS) {
      const el = refs.current[s];
      if (!el) continue;
      const read = () => {
        const a = el.querySelector<HTMLAnchorElement>('a[href^="/book"]');
        const next = captureFromHref(a?.getAttribute("href"));
        setLive((prev) => (JSON.stringify(prev[s]) === JSON.stringify(next) ? prev : { ...prev, [s]: next }));
      };
      read();
      const o = new MutationObserver(read);
      o.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
      observers.push(o);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const effective = (s: Slot): Captured => locked[s] ?? live[s];
  const original = effective("A");
  const chosen = effective(preferred);
  const dInput: DiscountInput = { type: dType, value: Number(dValue), reason: dReason };
  const preview = useMemo(() => (useDiscount ? previewDiscount(chosen, dInput) : null), [useDiscount, chosen, dType, dValue, dReason]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = discountState(preview, isSuperAdmin);
  const summary = chosen.status === "unpriced" ? "" : buildClientSummary(chosen, { label: LABEL[preferred], original: preferred === "A" ? null : original, originalLabel: LABEL.A, discount: preview, discountInput: dInput });
  const priced = SLOTS.filter((s) => effective(s).status !== "unpriced");

  async function copy() { try { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Options" className="grid grid-cols-3 gap-2">
        {SLOTS.map((s) => {
          const c = effective(s);
          return (
            <button key={s} role="tab" aria-selected={active === s} onClick={() => setActive(s)} className={`rounded-lg border px-2 py-2 text-left font-sans text-caption ${active === s ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10" : "border-black/15"}`}>
              <span className="block font-medium text-ordift-ink">Option {s}{locked[s] ? " 🔒" : ""}</span>
              <span className="block text-ordift-ink-muted">{c.status === "unpriced" ? "no price yet" : c.status === "indicative" ? `fee ${usd(c.totalUsd)}` : usd(c.totalUsd)}</span>
            </button>
          );
        })}
      </div>
      <p className="font-sans text-caption text-ordift-ink-muted">Set up Option A as the original. Switch to Option B and enter the revised scope in its own calculator; each option keeps what you entered, so you can switch back at any time to revise further. Lock an option to freeze its figures while you keep experimenting.</p>

      {SLOTS.map((s, i) => (
        <div key={s} ref={(el) => { refs.current[s] = el; }} hidden={active !== s} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif font-medium text-body text-ordift-ink">{LABEL[s]}</h3>
            <div className="flex gap-2">
              {locked[s]
                ? <button type="button" className={`${btn} border border-black/15`} onClick={() => setLocked((p) => { const n = { ...p }; delete n[s]; return n; })}>Unlock (use live figures)</button>
                : <button type="button" disabled={live[s].status === "unpriced"} className={`${btn} border border-black/15 disabled:opacity-50`} onClick={() => setLocked((p) => ({ ...p, [s]: live[s] }))}>Lock these figures</button>}
            </div>
          </div>
          {slots[i]}
        </div>
      ))}

      <section className="rounded-xl border border-black/10 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="cmp">
        <h2 id="cmp" className="font-serif font-medium text-body text-ordift-ink">Compare</h2>
        {priced.length < 2 ? <p className="font-sans text-caption text-ordift-ink-muted">Calculate at least two options to compare them. An option with no price (a rate not published, or a custom proposal) is shown as unpriced and never counted as zero.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left font-sans text-caption">
              <thead className="text-ordift-ink-muted"><tr><th className="py-1 pr-3">Option</th><th className="py-1 pr-3">Scope</th><th className="py-1 pr-3">Total</th><th className="py-1">Versus A</th></tr></thead>
              <tbody className="text-ordift-ink align-top">
                {priced.map((s) => {
                  const c = effective(s); const cmp = s === "A" ? null : compareOptions(original, c);
                  return (
                    <tr key={s} className="border-t border-black/5">
                      <td className="py-2 pr-3 font-medium">{s}{locked[s] ? " (locked)" : ""}</td>
                      <td className="py-2 pr-3">{c.status !== "unpriced" ? c.title : ""}</td>
                      <td className="py-2 pr-3">{c.status === "unpriced" ? "—" : usd(c.totalUsd)}{c.status === "indicative" ? " (indicative fee)" : ""}</td>
                      <td className="py-2">{!cmp ? "original" : cmp.differenceUsd === null ? "not comparable" : cmp.differenceUsd === 0 ? "no difference" : `${cmp.differenceUsd < 0 ? "−" : "+"}${usd(Math.abs(cmp.differenceUsd))} ${cmp.differenceUsd < 0 ? "lower" : "higher"}`}
                        {cmp && (cmp.onlyInOriginal.length > 0 || cmp.onlyInRevised.length > 0) && (
                          <details className="mt-1"><summary className="cursor-pointer text-ordift-ink-muted">What changes</summary>
                            {cmp.onlyInOriginal.length > 0 && <p className="mt-1"><strong>Gives up (in A):</strong> {cmp.onlyInOriginal.join("; ")}</p>}
                            {cmp.onlyInRevised.length > 0 && <p className="mt-1"><strong>Gains (in {s}):</strong> {cmp.onlyInRevised.join("; ")}</p>}
                          </details>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted">A lower price from a smaller scope is a change in what is included. It is shown here separately from any discount.</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="pref">
        <h2 id="pref" className="font-serif font-medium text-body text-ordift-ink">Preferred option and discount preview</h2>
        <div className="flex flex-wrap gap-3">
          {SLOTS.map((s) => (
            <label key={s} className="flex items-center gap-2 font-sans text-body-small text-ordift-ink"><input type="radio" name="preferred" checked={preferred === s} onChange={() => setPreferred(s)} /> {LABEL[s]}</label>
          ))}
        </div>
        <div className="rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900">
          Discretionary discounts need <strong>Founder / Super Admin approval</strong>. {isSuperAdmin ? "You can preview one here, but this page records no approval: confirm it in the formal quotation." : "You can propose one here, but you cannot authorise it."} No percentage or amount limit has been set, and nothing below is saved. Persistent approval and an audit record need a database change that has not been authorised yet.
        </div>
        <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" checked={useDiscount} onChange={(e) => setUseDiscount(e.target.checked)} /> Preview a discount on {LABEL[preferred]}</label>
        {useDiscount && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="font-sans text-caption text-ordift-ink-muted">Type<select value={dType} onChange={(e) => setDType(e.target.value as DiscountInput["type"])} className={input}><option value="percentage">Percentage</option><option value="fixed">Fixed amount (USD)</option></select></label>
              <label className="font-sans text-caption text-ordift-ink-muted">Value<input value={dValue} onChange={(e) => setDValue(e.target.value)} inputMode="decimal" className={input} /></label>
              <label className="font-sans text-caption text-ordift-ink-muted sm:col-span-3">Reason (required)<input value={dReason} onChange={(e) => setDReason(e.target.value)} className={input} /></label>
            </div>
            {preview && !preview.ok && <p role="alert" className="font-sans text-caption text-red-800">{preview.error}</p>}
            {preview && preview.ok && (
              <dl className="grid grid-cols-2 gap-2 rounded-lg bg-ordift-offwhite p-3 font-sans text-body-small text-ordift-ink">
                <dt>Eligible subtotal</dt><dd>{usd(preview.eligibleSubtotalUsd)}</dd><dt>Proposed discount</dt><dd>−{usd(preview.discountUsd)}</dd><dt className="font-medium">Total after discount</dt><dd className="font-medium">{usd(preview.totalUsd)}</dd>
                <dt>Status</dt><dd>{state === "proposed_needs_approval" ? "Proposed — needs Founder / Super Admin approval" : "Preview — confirm in the formal quotation"}</dd>
              </dl>
            )}
            <button type="button" className={`${btn} border border-black/15`} onClick={() => { setUseDiscount(false); setDValue(""); setDReason(""); }}>Remove discount</button>
          </div>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted">One discount at a time: changing the values replaces the preview; discounts never stack. Change an option&apos;s scope and the preview recalculates on the new total (and shows a message if the discount no longer fits).</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="sum">
        <h2 id="sum" className="font-serif font-medium text-body text-ordift-ink">Client summary</h2>
        {summary ? <pre className="whitespace-pre-wrap rounded-lg bg-ordift-offwhite p-3 font-sans text-caption text-ordift-ink">{summary}</pre> : <p className="font-sans text-caption text-ordift-ink-muted">The preferred option has no price yet, so there is no summary. Nothing is assumed.</p>}
        <button type="button" onClick={copy} disabled={!summary} className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-50">{copied ? "Copied" : "Copy summary"}</button>
        <p className="font-sans text-caption text-ordift-ink-muted">Only in this browser tab: refreshing the page or changing the service clears the options. To keep a communicated figure, record the enquiry and note it there (saved pricing history is the next stage).</p>
      </section>
    </div>
  );
}
