"use client";

import { useState } from "react";

// Builds a short plain-text summary for the staff member to paste into WhatsApp or an email themselves. It stores nothing, sends nothing and
// cannot be mistaken for a quotation: the text it produces says "estimate".
const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";

export default function ClientSummaryBuilder() {
  const [service, setService] = useState("");
  const [option, setOption] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const ready = service.trim() && option.trim() && total.trim() && currency.trim();
  const text = ready
    ? [
        `Ordift Studios — estimate for ${service.trim()}`,
        `Option: ${option.trim()}`,
        `Estimated total: ${currency.trim()} ${total.trim()}`,
        notes.trim() ? `Assumptions / notes: ${notes.trim()}` : "",
        "This is an estimate, not a formal quotation. A formal quotation and booking confirmation follow if you wish to proceed.",
      ].filter(Boolean).join("\n")
    : "";
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="font-serif font-medium text-body text-ordift-ink">Copy a client summary</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">Type the figures exactly as shown by the calculator above. Nothing here is saved or sent.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-sans text-caption text-ordift-ink-muted">Service<input value={service} onChange={(e) => setService(e.target.value)} className={input} /></label>
        <label className="font-sans text-caption text-ordift-ink-muted">Option chosen<input value={option} onChange={(e) => setOption(e.target.value)} className={input} /></label>
        <label className="font-sans text-caption text-ordift-ink-muted">Estimated total<input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" className={input} /></label>
        <label className="font-sans text-caption text-ordift-ink-muted">Currency<input value={currency} onChange={(e) => setCurrency(e.target.value)} className={input} /></label>
      </div>
      <label className="block font-sans text-caption text-ordift-ink-muted">Assumptions / notes (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} /></label>
      {text && <pre className="whitespace-pre-wrap rounded-lg bg-ordift-offwhite p-3 font-sans text-caption text-ordift-ink">{text}</pre>}
      <button type="button" onClick={copy} disabled={!ready} className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-50">{copied ? "Copied" : "Copy summary"}</button>
    </section>
  );
}
