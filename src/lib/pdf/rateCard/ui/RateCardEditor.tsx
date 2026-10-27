"use client";
// The rate card editing + preview panel. Used by the admin page (server-backed drafts, approval, download) and by the local-only /dev page. Prices that come from the selling-rate tables are
// shown but NOT editable: they are the single source of truth, and a hand-typed price would silently disagree with quotations.
import { useEffect, useMemo, useRef, useState } from "react";
import { conversionReview } from "../convert";
import { CURRENCY_POLICY } from "../policy";
import type { EditionStatus, RateCardContent, RateCardItem, RateCardSection } from "../types";
import { validateRateCard } from "../validate";
import { renderRateCardPdf, saveBlob } from "./pdfClient";

const box: React.CSSProperties = { border: "1px solid #d9d5cb", borderRadius: 6, padding: 12, marginBottom: 12, background: "#fff" };
const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 4, font: "inherit", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 5, background: "#0b1220", color: "#f7f5f1", font: "inherit", fontWeight: 600, cursor: "pointer", marginRight: 8 };
const lab: React.CSSProperties = { display: "block", marginTop: 8, fontSize: 13 };

export function priceLine(p: RateCardItem["price"], cur: string): string { return p.kind === "on_request" ? "On request" : `${p.kind === "from" ? "From " : ""}${cur} ${p.amount.toLocaleString("en-US")}${p.unit ? ` ${p.unit}` : ""}`; }

export default function RateCardEditor({ content, onChange, readOnly, status, today, toolbar, filename }: { content: RateCardContent; onChange: (c: RateCardContent) => void; readOnly: boolean; status: EditionStatus; today: string; toolbar?: React.ReactNode; filename: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const draft = useMemo(() => validateRateCard(content, "draft", { today }), [content, today]);
  const approval = useMemo(() => validateRateCard(content, "approval", { today, currencyPolicyApproved: CURRENCY_POLICY.clientPublicationOfConvertedPricesApproved }), [content, today]);
  const review = useMemo(() => conversionReview(content), [content]);
  const patchSection = (si: number, f: (s: RateCardSection) => RateCardSection) => onChange({ ...content, sections: content.sections.map((s, i) => (i === si ? f(s) : s)) });
  const patchItem = (si: number, ii: number, f: (i: RateCardItem) => RateCardItem) => patchSection(si, (s) => ({ ...s, items: s.items.map((x, i) => (i === ii ? f(x) : x)) }));

  async function build(download: boolean) {
    setInfo("Preparing…"); const t0 = performance.now();
    try {
      const blob = await renderRateCardPdf(content, status);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob); urlRef.current = url; setPreview(url);
      if (download) saveBlob(blob, filename);
      const r = { bytes: blob.size, ms: Math.round(performance.now() - t0) };
      (window as unknown as { __rcLast?: unknown }).__rcLast = r;
      setInfo(`${download ? "Downloaded" : "Preview ready"}: ${(r.bytes / 1048576).toFixed(2)} MB, ${r.ms} ms${status.state === "draft" ? " (DRAFT watermark)" : ""}.`);
    } catch (e) { setInfo(`Could not create the PDF: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const ro = readOnly;
  return (
    <div style={{ fontSize: 14, color: "#1a1d24" }}>
      <div style={box}>
        <button id="preview-btn" style={btn} onClick={() => build(false)}>Preview</button>
        <button id="download-btn" style={btn} onClick={() => build(true)}>{status.state === "draft" ? "Download draft PDF (watermarked)" : "Download PDF"}</button>
        {toolbar}
        <span id="rc-status" style={{ marginLeft: 8 }}>{info}</span>
      </div>
      <div className="rc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <section>
          <div style={box}>
            <strong>Document</strong>
            {([["title", "Title"], ["subtitle", "Subtitle"], ["editionLabel", "Edition label"], ["effectiveDate", "Effective date (YYYY-MM-DD)"]] as const).map(([k, l]) => (
              <label key={k} style={lab}>{l}<input style={inp} disabled={ro} value={(content.meta[k] as string | undefined) ?? ""} onChange={(e) => onChange({ ...content, meta: { ...content.meta, [k]: e.target.value } })} /></label>
            ))}
            <p style={{ marginBottom: 0, color: "#555" }}>Market: <strong>{content.meta.marketName}</strong> · Currency: <strong>{content.meta.currency}</strong>{content.meta.conversionPolicy === "proposed" ? " (proposed conversion — indicative)" : ""}{content.meta.issuingEntity ? ` · Issuing entity: ${content.meta.issuingEntity.name} (checked ${content.meta.issuingEntity.checkedOn})` : ""}</p>
            <label style={lab}>Cover image (path or URL — a non-client Ordift image chosen by the Founder)<input style={inp} disabled={ro} value={content.coverImage} onChange={(e) => onChange({ ...content, coverImage: e.target.value })} /></label>
            <label style={lab}>Booking page introduction<textarea style={inp} rows={2} disabled={ro} value={content.intro ?? ""} onChange={(e) => onChange({ ...content, intro: e.target.value })} /></label>
          </div>
          {content.sections.map((sec, si) => (
            <div key={sec.key} style={box}>
              <label style={lab}>Category title<input style={inp} disabled={ro} value={sec.title} onChange={(e) => patchSection(si, (s) => ({ ...s, title: e.target.value }))} /></label>
              <label style={lab}>Category introduction<textarea style={inp} rows={2} disabled={ro} value={sec.intro ?? ""} onChange={(e) => patchSection(si, (s) => ({ ...s, intro: e.target.value }))} /></label>
              <label style={lab}>Wording for requirements that do not fit a standard package<textarea style={inp} rows={2} disabled={ro} value={sec.customQuotationNote ?? ""} onChange={(e) => patchSection(si, (s) => ({ ...s, customQuotationNote: e.target.value }))} /></label>
              {sec.items.map((it, ii) => (
                <div key={it.key} style={{ borderTop: "1px solid #eee", marginTop: 10, paddingTop: 8, opacity: it.included === false ? 0.55 : 1 }}>
                  <label style={{ fontSize: 13 }}><input type="checkbox" disabled={ro || (it.eligibility ? !it.eligibility.ok : false)} checked={it.included !== false} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, included: e.target.checked }))} /> Include in the PDF</label>
                  {it.eligibility && !it.eligibility.ok ? <div style={{ color: "#8a1c1c", fontSize: 12 }}>Left out: {it.eligibility.reason}</div> : null}
                  <input style={{ ...inp, marginTop: 4 }} aria-label="Item name" disabled={ro} value={it.name} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, name: e.target.value }))} />
                  <textarea style={{ ...inp, marginTop: 6 }} rows={2} aria-label="Description" placeholder="Approved service description" disabled={ro} value={it.description} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, description: e.target.value }))} />
                  <textarea style={{ ...inp, marginTop: 6 }} rows={3} aria-label="Inclusions, one per line" disabled={ro} value={it.inclusions.join("\n")} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, inclusions: e.target.value.split("\n").filter((l) => l.trim()) }))} />
                  <div style={{ marginTop: 6 }}><strong>{priceLine(it.price, content.meta.currency)}</strong>{it.source === "selling_rates" ? <span style={{ color: "#555" }}> · from the selling-rate tables (not editable here)</span> : <span style={{ color: "#555" }}> · {it.source}</span>}</div>
                  {it.source !== "selling_rates" && !ro && it.price.kind !== "on_request" ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <select style={inp} aria-label="Price type" value={it.price.kind} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, price: e.target.value === "on_request" ? { kind: "on_request" } : { kind: e.target.value as "fixed" | "from", amount: x.price.kind === "on_request" ? 1 : x.price.amount, unit: x.price.kind === "on_request" ? "" : x.price.unit } }))}><option value="fixed">Fixed price</option><option value="from">Starting price</option><option value="on_request">On request</option></select>
                      <input style={inp} aria-label="Amount" inputMode="decimal" value={String(it.price.amount)} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, price: { ...(x.price as { kind: "fixed" | "from"; amount: number; unit?: string }), amount: Number(e.target.value) } }))} />
                    </div>
                  ) : null}
                </div>
              ))}
              {sec.minimum ? <p style={{ marginBottom: 0 }}>{sec.minimum.label}: <strong>{priceLine(sec.minimum.price, content.meta.currency)}</strong></p> : null}
              {sec.addons?.length ? <p style={{ marginBottom: 0 }}>Additional services: {sec.addons.map((a) => `${a.name} (${priceLine(a.price, content.meta.currency)})${a.included === false ? " — left out" : ""}`).join("; ")}</p> : null}
            </div>
          ))}
          <div style={box}>
            <strong>Conditions</strong>
            {content.conditions.map((c, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <input style={inp} aria-label="Condition title" disabled={ro} value={c.title} onChange={(e) => onChange({ ...content, conditions: content.conditions.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
                <textarea style={{ ...inp, marginTop: 4 }} rows={2} aria-label="Condition text" disabled={ro} value={c.text} onChange={(e) => onChange({ ...content, conditions: content.conditions.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
              </div>
            ))}
            <strong style={{ display: "block", marginTop: 12 }}>Contact and booking details</strong>
            {content.contact.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input style={{ ...inp, width: 120 }} aria-label="Contact label" disabled={ro} value={c.label} onChange={(e) => onChange({ ...content, contact: content.contact.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                <input style={inp} aria-label="Contact value" disabled={ro} value={c.value} onChange={(e) => onChange({ ...content, contact: content.contact.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div style={{ ...box, padding: 0, height: 640 }}>
            {preview ? <iframe id="preview-frame" title="Rate card preview" src={preview} style={{ width: "100%", height: "100%", border: 0, borderRadius: 6 }} /> : <p style={{ padding: 16, color: "#666" }}>Press Preview to render the PDF here.</p>}
          </div>
          {review.length > 0 && (
            <details open style={box}>
              <summary><strong>Currency conversion review ({content.meta.currency})</strong> — USD base prices are never changed</summary>
              <p style={{ color: "#555", fontSize: 13 }}>Rate {content.meta.fx?.rateToUsd} ({content.meta.fx?.source}), effective {content.meta.fx?.effectiveFrom}; rounding {content.meta.fx?.rule.kind === "up_to_multiple" ? `up to the next ${content.meta.fx?.rule.multiple}` : `to the nearest ${content.meta.fx?.rule.multiple}`}.</p>
              <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}><thead><tr>{["Service", "USD", "Exact", "Rounded", "Diff"].map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 4 }}>{h}</th>)}</tr></thead>
                <tbody>{review.map((r) => <tr key={r.where}><td style={{ padding: 4 }}>{r.where}</td><td style={{ padding: 4 }}>{r.usd}</td><td style={{ padding: 4 }}>{r.exact}</td><td style={{ padding: 4 }}>{r.rounded}</td><td style={{ padding: 4 }}>{r.difference}</td></tr>)}</tbody></table></div>
            </details>
          )}
          <div style={box}>
            <strong>Checks</strong>
            {draft.errors.length === 0 ? <p style={{ color: "#256029" }}>The draft can be previewed and saved.</p> : <ul id="draft-errors" style={{ color: "#8a1c1c" }}>{draft.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            <details><summary id="approval-summary">{approval.errors.length === 0 ? "Ready for Founder approval" : `Not ready for approval (${approval.errors.length} blocker${approval.errors.length === 1 ? "" : "s"})`}</summary>
              <ul id="approval-blockers" style={{ color: approval.errors.length ? "#8a1c1c" : "#256029" }}>{(approval.errors.length ? approval.errors : ["No blockers."]).slice(0, 25).map((e, i) => <li key={i}>{e}</li>)}</ul></details>
          </div>
        </section>
      </div>
    </div>
  );
}
