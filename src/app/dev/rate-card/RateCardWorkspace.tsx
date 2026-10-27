"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { freezeEdition } from "@/lib/pdf/rateCard/edition";
import { SAMPLE_RATE_CARD } from "@/lib/pdf/rateCard/sample";
import type { RateCardContent, RateCardItem, RateCardSection } from "@/lib/pdf/rateCard/types";
import { validateRateCard } from "@/lib/pdf/rateCard/validate";
import { loadDraftFromSellingRatesAction } from "./actions";

const KEY = "ordift-rate-card-draft-v1";
const COVER = "/pdf/cover-placeholder.jpg";
const box: React.CSSProperties = { border: "1px solid #d9d5cb", borderRadius: 6, padding: 12, marginBottom: 12, background: "#fff" };
const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 4, font: "inherit", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 5, background: "#0b1220", color: "#f7f5f1", font: "inherit", fontWeight: 600, cursor: "pointer", marginRight: 8 };
const btn2: React.CSSProperties = { ...btn, background: "#e8e4d9", color: "#0b1220" };

export default function RateCardWorkspace() {
  const [draft, setDraft] = useState<RateCardContent>({ ...SAMPLE_RATE_CARD, coverImage: COVER });
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState<string>("");
  const [freezeInfo, setFreezeInfo] = useState<string[]>([]);
  const [market, setMarket] = useState("");
  const urlRef = useRef<string | null>(null);

  // Restoring a locally saved draft after hydration is the one place a state update inside an effect is intended (browser storage does not exist on the server).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setDraft(JSON.parse(s)); } catch { /* storage unavailable: start from the sample */ } }, []);
  const save = (d: RateCardContent) => { setDraft(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } };
  const v = useMemo(() => validateRateCard(draft, "draft"), [draft]);
  const patchSection = (si: number, f: (s: RateCardSection) => RateCardSection) => save({ ...draft, sections: draft.sections.map((s, i) => (i === si ? f(s) : s)) });
  const patchItem = (si: number, ii: number, f: (i: RateCardItem) => RateCardItem) => patchSection(si, (s) => ({ ...s, items: s.items.map((x, i) => (i === ii ? f(x) : x)) }));

  async function build(download: boolean) {
    setInfo("Preparing…"); const t0 = performance.now();
    try {
      const [{ pdf }, { registerBrandFonts }, { RateCardDocument }] = await Promise.all([import("@react-pdf/renderer"), import("@/lib/pdf/fonts"), import("@/lib/pdf/rateCard/RateCardDocument")]);
      registerBrandFonts("/fonts/pdf");
      const blob = await pdf(<RateCardDocument content={draft} status={{ state: "draft" }} logoWhite="/brand/logo-full-white.png" />).toBlob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob); urlRef.current = url; setPreview(url);
      if (download) { const a = document.createElement("a"); a.href = url; a.download = "Ordift-Studios-Rate-Card-DRAFT.pdf"; document.body.appendChild(a); a.click(); a.remove(); }
      const r = { bytes: blob.size, ms: Math.round(performance.now() - t0) };
      (window as unknown as { __rcLast?: unknown }).__rcLast = r;
      setInfo(`${download ? "Downloaded" : "Preview ready"}: ${(r.bytes / 1048576).toFixed(2)} MB, ${r.ms} ms.`);
    } catch (e) { setInfo(`Could not create the PDF: ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function checkApproval() {
    const r = await freezeEdition(draft, { id: "local", name: "Founder (local test)" }, new Date(), "LOCAL-TEST");
    setFreezeInfo(r.ok ? [`Would be frozen. Content hash: ${r.edition.status.contentHash}`] : r.errors);
  }

  async function loadFromRates() {
    setInfo("Loading selling rates…");
    const r = await loadDraftFromSellingRatesAction(market);
    if (!r.ok) { setInfo(r.error); return; }
    save({ ...r.draft, coverImage: COVER }); setInfo(`Loaded ${r.draft.sections.length} categories from the selling-rate tables (draft; descriptions and conditions still needed).`);
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", fontSize: 14, color: "#1a1d24" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Rate card — Draft → Preview (local)</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Status: <strong>Draft</strong>. Placeholder content. Approval is not active; nothing is saved to a server (only this browser).</p>
      <div style={box}>
        <button id="preview-btn" style={btn} onClick={() => build(false)}>Preview</button>
        <button id="download-btn" style={btn} onClick={() => build(true)}>Download PDF</button>
        <button id="approval-btn" style={btn2} onClick={checkApproval}>Check approval readiness (design preview)</button>
        <button style={btn2} onClick={() => save({ ...SAMPLE_RATE_CARD, coverImage: COVER })}>Reset to sample</button>
        <span id="rc-status" style={{ marginLeft: 8 }}>{info}</span>
        <div style={{ marginTop: 10 }}>
          <input aria-label="Market slug" placeholder="Market slug (e.g. ghana)" value={market} onChange={(e) => setMarket(e.target.value)} style={{ ...inp, width: 220, marginRight: 8 }} />
          <button style={btn2} onClick={loadFromRates}>Load draft from selling rates</button>
        </div>
        {freezeInfo.length > 0 && <ul id="freeze-info" style={{ color: "#8a1c1c", marginBottom: 0 }}>{freezeInfo.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <section>
          <div style={box}>
            <strong>Document</strong>
            {([["title", "Title"], ["subtitle", "Subtitle"], ["editionLabel", "Edition label"], ["effectiveDate", "Effective date (YYYY-MM-DD)"], ["marketName", "Market"], ["currency", "Currency"]] as const).map(([k, label]) => (
              <label key={k} style={{ display: "block", marginTop: 8 }}>{label}<input style={inp} value={(draft.meta[k] as string | undefined) ?? ""} onChange={(e) => save({ ...draft, meta: { ...draft.meta, [k]: e.target.value } })} /></label>
            ))}
          </div>
          {draft.sections.map((sec, si) => (
            <div key={sec.key} style={box}>
              <label>Category title<input style={inp} value={sec.title} onChange={(e) => patchSection(si, (s) => ({ ...s, title: e.target.value }))} /></label>
              <label style={{ display: "block", marginTop: 6 }}>Pricing structure
                <select style={inp} value={sec.structure} onChange={(e) => patchSection(si, (s) => ({ ...s, structure: e.target.value as RateCardSection["structure"] }))}><option value="fixed">Fixed-price packages</option><option value="from">Starting prices</option><option value="mixed">Mixed</option></select></label>
              {sec.items.map((it, ii) => (
                <div key={it.key} style={{ borderTop: "1px solid #eee", marginTop: 10, paddingTop: 8 }}>
                  <input style={inp} aria-label="Item name" value={it.name} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, name: e.target.value }))} />
                  <textarea style={{ ...inp, marginTop: 6 }} rows={2} aria-label="Description" value={it.description} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, description: e.target.value }))} />
                  <textarea style={{ ...inp, marginTop: 6 }} rows={3} aria-label="Inclusions, one per line" value={it.inclusions.join("\n")} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, inclusions: e.target.value.split("\n").filter((l) => l.trim()) }))} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <select style={inp} aria-label="Price type" value={it.price.kind} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, price: e.target.value === "on_request" ? { kind: "on_request" } : { kind: e.target.value as "fixed" | "from", amount: x.price.kind === "on_request" ? 1 : x.price.amount, unit: x.price.kind === "on_request" ? "" : x.price.unit } }))}><option value="fixed">Fixed price</option><option value="from">Starting price</option><option value="on_request">On request</option></select>
                    {it.price.kind !== "on_request" && <input style={inp} aria-label="Amount" inputMode="decimal" value={String(it.price.amount)} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, price: { ...(x.price as { kind: "fixed" | "from"; amount: number; unit?: string }), amount: Number(e.target.value) } }))} />}
                    {it.price.kind !== "on_request" && <input style={inp} aria-label="Unit" placeholder="Unit (per session…)" value={it.price.unit ?? ""} onChange={(e) => patchItem(si, ii, (x) => ({ ...x, price: { ...(x.price as { kind: "fixed" | "from"; amount: number; unit?: string }), unit: e.target.value } }))} />}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div style={box}>
            <strong>Checks (draft)</strong>
            {v.errors.length === 0 ? <p style={{ color: "#256029" }}>The draft can be previewed.</p> : <ul style={{ color: "#8a1c1c" }}>{v.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            {v.warnings.length > 0 && <details><summary>{v.warnings.length} item(s) still need approved wording or are placeholders (block approval)</summary><ul>{v.warnings.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
          </div>
        </section>
        <section>
          <div style={{ ...box, padding: 0, height: 760 }}>
            {preview ? <iframe id="preview-frame" title="Rate card preview" src={preview} style={{ width: "100%", height: "100%", border: 0, borderRadius: 6 }} /> : <p style={{ padding: 16, color: "#666" }}>Press Preview to render the PDF here.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
