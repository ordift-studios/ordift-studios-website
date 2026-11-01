"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RateCardEditor, { type CoverUpload } from "@/lib/pdf/rateCard/ui/RateCardEditor";
import { DEFAULT_COVER } from "@/lib/pdf/rateCard/cover";
import { compressImageFile } from "@/lib/media/clientImageCompress";
import { renderRateCardPdf, saveBlob } from "@/lib/pdf/rateCard/ui/pdfClient";
import type { EditionRecord, EditionSummary } from "@/lib/pdf/rateCard/editions";
import type { EditionStatus, RateCardContent } from "@/lib/pdf/rateCard/types";
import type { ContentReport } from "@/lib/pdf/rateCard/content/schema";
import { ISSUING_RULES, currencyOptionsFor } from "@/lib/pdf/rateCard/jurisdictions";
import { approveEditionAction, buildDraftAction, downloadApprovedAction, saveNewDraftAction, startNextEditionAction, updateDraftAction } from "./actions";

const box: React.CSSProperties = { border: "1px solid #d9d5cb", borderRadius: 6, padding: 12, marginBottom: 12, background: "#fff" };
const inp: React.CSSProperties = { padding: "6px 8px", border: "1px solid #bbb", borderRadius: 4, font: "inherit" };
const btn: React.CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 5, background: "#0b1220", color: "#f7f5f1", font: "inherit", fontWeight: 600, cursor: "pointer", marginRight: 8 };
const btn2: React.CSSProperties = { ...btn, background: "#e8e4d9", color: "#0b1220" };

type Props = { today: string; editions: EditionSummary[]; markets: { slug: string; name: string }[]; entities: { id: string; name: string; jurisdiction: string | null }[]; selected: { edition: EditionRecord; integrity: "ok" | "not_applicable" | "FAILED" } | null; selectedError: string | null };

export default function RateCardAdmin({ today, editions, markets, entities, selected, selectedError }: Props) {
  const router = useRouter();
  const [content, setContent] = useState<RateCardContent | null>(selected?.edition.content ?? null);
  const [updatedAt, setUpdatedAt] = useState<string>(selected?.edition.updatedAt ?? "");
  const [msg, setMsg] = useState("");
  const [report, setReport] = useState<{ summary: string; r: ContentReport } | null>(null);
  const [market, setMarket] = useState(markets[0]?.slug ?? ""); const [entity, setEntity] = useState(""); const [currency, setCurrency] = useState("USD");
  const [clearance, setClearance] = useState(""); const [nextLabel, setNextLabel] = useState("");
  const rule = ISSUING_RULES[market];
  const currencies = currencyOptionsFor(market);
  const entityChoices = rule ? entities.filter((x) => x.jurisdiction === rule.jurisdiction) : [];
  const ed = selected?.edition ?? null;
  const frozen = ed ? ed.status !== "draft" : false;
  const status: EditionStatus = ed && ed.status === "approved" ? { state: "approved", editionId: ed.id, approvedBy: ed.approvedBy ?? "", approvedAt: ed.approvedAt ?? "", contentHash: ed.contentSha256 ?? "" } : { state: "draft" };

  async function build() {
    setMsg("Building a draft from the selling-rate tables…");
    const r = await buildDraftAction({ marketSlug: market, entityId: entity, currency });
    if (!r.ok) { setMsg(r.error); return; }
    const c = { ...r.content, coverImage: "/pdf/cover-placeholder.jpg", cover: { ...DEFAULT_COVER } }; setContent(c); setReport({ summary: r.contentSummary, r: r.contentReport });
    setMsg(`Draft built: ${c.sections.length} categories. Placeholder wording is marked [PLACEHOLDER]; it is not saved until you press Save.`);
  }
  // Stores the chosen photograph as an image asset (Super Admin only) and keeps its immutable address in the draft. Photographs over the platform's request limit are resized in the browser first.
  const uploadCover: CoverUpload = async (file) => {
    try {
      const small = await compressImageFile(file);
      const body = new FormData(); body.append("file", small);
      const res = await fetch("/api/admin/pricing/rate-card/cover", { method: "POST", body });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !j?.ok || !j.url) return { ok: false, error: `The cover photograph could not be uploaded (${j?.error ?? res.status}).` };
      return { ok: true, url: j.url, label: file.name };
    } catch { return { ok: false, error: "The cover photograph could not be uploaded." }; }
  };
  async function save() {
    if (!content) return;
    if (!ed) { const r = await saveNewDraftAction(content); if (!r.ok) { setMsg(r.error); return; } router.push(`/admin/pricing/rate-card?id=${r.id}`); return; }
    const r = await updateDraftAction(ed.id, content, updatedAt); if (!r.ok) { setMsg(r.error); return; } setUpdatedAt(r.updatedAt); setMsg("Draft saved.");
  }
  async function approve() {
    if (!ed || !content) return;
    if (!confirm("Approve this edition? Its content and prices will be frozen.")) return;
    const r = await approveEditionAction(ed.id, ed.marketSlug, content.meta.issuingEntity?.entityId ?? null, clearance);
    if (!r.ok) { setMsg(r.error); return; } setMsg(`Approved. Content hash ${r.contentSha256}`); router.refresh();
  }
  async function nextEdition() {
    if (!ed) return; const r = await startNextEditionAction(ed.id, nextLabel, today); if (!r.ok) { setMsg(r.error); return; } router.push(`/admin/pricing/rate-card?id=${r.id}`);
  }
  async function downloadFinal() {
    if (!ed) return; setMsg("Verifying the approved edition…");
    const r = await downloadApprovedAction(ed.id); if (!r.ok) { setMsg(r.error); return; }
    const blob = await renderRateCardPdf(r.content, { state: "approved", editionId: r.editionId, approvedBy: r.approvedBy, approvedAt: r.approvedAt, contentHash: r.contentSha256 });
    saveBlob(blob, `Ordift-Studios-Rate-Card-${r.content.meta.marketSlug}-${r.content.meta.editionLabel.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`); setMsg(`Downloaded the approved edition (${(blob.size / 1048576).toFixed(2)} MB). The download was recorded.`);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Rate card editions</h1>
      <p style={{ color: "#555", marginTop: 0 }}>The standalone price list: Draft → Preview → Founder approval → Approved edition → Download. It is not a quotation and not the portfolio. Drafts are watermarked; an approved edition is frozen.</p>
      <div style={box}>
        <strong>Editions</strong>
        {editions.length === 0 ? <p>No editions yet.</p> : <ul>{editions.map((e) => <li key={e.id}><a href={`/admin/pricing/rate-card?id=${e.id}`}>{e.editionLabel}</a> — {e.marketSlug} — {e.status}{e.currency ? ` — ${e.currency}` : ""}</li>)}</ul>}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
          <strong>New draft from the selling-rate tables</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <select aria-label="Market" style={inp} value={market} onChange={(e) => { setMarket(e.target.value); setEntity(""); setCurrency("USD"); }}>{markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select>
            <select aria-label="Issuing entity" style={inp} value={entity} disabled={!rule} onChange={(e) => setEntity(e.target.value)}><option value="">{rule ? "Issuing entity (needed for approval)…" : "No issuing entity for this market"}</option>{entityChoices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select aria-label="Currency" style={inp} value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c} value={c}>{c === "USD" ? "USD (base prices)" : `${c} (proposed conversion, indicative)`}</option>)}</select>
            <button style={btn} onClick={build}>Build draft</button>
          </div>
        </div>
      </div>
      {msg ? <p id="rc-msg" role="status">{msg}</p> : null}
      {report ? (
        <details id="rc-content-report" style={box} open={report.r.approvalBlockers.length > 0 || report.r.missingDescriptions.length > 0 || report.r.rejected.length > 0 || report.r.unknownKeys.length > 0}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{report.summary}</summary>
          {report.r.approvalBlockers.map((b) => <p key={b} style={{ fontSize: 13, fontWeight: 600 }}>Not ready for approval: {b}</p>)}
          {report.r.reviewedDraft.length ? <p style={{ fontSize: 13 }}>Reviewed drafts on the card, exact-text approval pending: {report.r.reviewedDraft.join(", ")}</p> : null}
          {report.r.draftOnly.length ? <p style={{ fontSize: 13 }}>New proposals awaiting Founder approval (held back, not on the card): {report.r.draftOnly.join(", ")}</p> : null}
          {report.r.missingDescriptions.length ? <p style={{ fontSize: 13 }}>Packages with no registry entry (left empty; they must be supplied before approval): {report.r.missingDescriptions.join(", ")}</p> : null}
          <p style={{ fontSize: 13 }}>Quotation notes — approved: {report.r.quotationNotes.approved.length}; deliberately withheld in this market: {report.r.quotationNotes.withheld.length}{report.r.quotationNotes.withheld.length ? ` (${report.r.quotationNotes.withheld.join(", ")})` : ""}; market-specific wording: {report.r.quotationNotes.marketVariants.length}{report.r.quotationNotes.marketVariants.length ? ` (${report.r.quotationNotes.marketVariants.join(", ")})` : ""}; missing: {report.r.missingSectionWording.length}{report.r.missingSectionWording.length ? ` (${report.r.missingSectionWording.join(", ")})` : ""}{report.r.quotationNotes.draft.length ? `; drafts held back: ${report.r.quotationNotes.draft.join(", ")}` : ""}.</p>
          {report.r.publicationBlockers.length ? <div style={{ fontSize: 13 }}><p style={{ fontWeight: 600, marginBottom: 2 }}>Remaining publication blockers (complete wording does not clear these):</p><ul style={{ marginTop: 0 }}>{report.r.publicationBlockers.map((b) => <li key={b}>{b}</li>)}</ul></div> : null}
          {report.r.rejected.length ? <ul style={{ fontSize: 13 }}>{report.r.rejected.map((x) => <li key={x}>Rejected: {x}</li>)}</ul> : null}
          {report.r.unknownKeys.length ? <p style={{ fontSize: 13 }}>Registry keys with no matching package: {report.r.unknownKeys.join(", ")}</p> : null}
          {report.r.notices.map((n) => <p key={n} style={{ fontSize: 13 }}>Note: {n}</p>)}
        </details>
      ) : null}
      {selectedError ? <p style={{ color: "#8a1c1c" }}>{selectedError}</p> : null}
      {ed && selected?.integrity === "FAILED" ? <p style={{ color: "#8a1c1c", fontWeight: 600 }}>Integrity check FAILED: this edition&apos;s stored content does not match its approved hash. It will not be released.</p> : null}
      {ed && frozen ? <div style={box}><strong>{ed.status === "approved" ? "Approved edition — frozen" : "Superseded edition — frozen"}</strong><div style={{ fontSize: 13, color: "#555" }}>Approved {ed.approvedAt} · hash {ed.contentSha256}{ed.clearanceStatement ? ` · Clearance: ${ed.clearanceStatement}` : ""}</div>
        {ed.status === "approved" ? <button id="download-final" style={{ ...btn, marginTop: 8 }} onClick={downloadFinal}>Download final PDF</button> : null}
        <div style={{ marginTop: 8 }}><input aria-label="New edition label" placeholder="New edition label" style={inp} value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} /> <button style={btn2} onClick={nextEdition}>Start a new edition from this one</button></div></div> : null}
      {content ? (
        <RateCardEditor content={content} onChange={setContent} readOnly={frozen} status={status} today={today} uploadCover={uploadCover} filename={`Ordift-Studios-Rate-Card-DRAFT-${content.meta.marketSlug}.pdf`}
          toolbar={!frozen ? <><button id="save-btn" style={btn2} onClick={save}>{ed ? "Save draft" : "Save as new draft"}</button></> : null} />
      ) : <p>Build a draft above, or open an edition.</p>}
      {ed && !frozen ? (
        <div style={box}>
          <strong>Founder approval</strong>
          <p style={{ color: "#555", fontSize: 13 }}>Approval freezes the content and prices. The server re-checks every rule, the issuing entity&apos;s licensed activities, the currency policy and the current selling rates.</p>
          <textarea aria-label="Clearance statement" style={{ ...inp, width: "100%", boxSizing: "border-box" }} rows={2} placeholder="Clearance statement: what you checked and cleared (prices, wording, licensed services)" value={clearance} onChange={(e) => setClearance(e.target.value)} />
          <button id="approve-btn" style={{ ...btn, marginTop: 8 }} onClick={approve}>Approve this edition</button>
        </div>
      ) : null}
    </div>
  );
}
