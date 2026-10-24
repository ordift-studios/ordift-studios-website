"use client";

/* eslint-disable @next/next/no-img-element -- short-lived signed URLs to private files; next/image optimisation would need them to be allow-listed and cached */
import { useEffect, useState } from "react";
import { previewUrlsAction } from "@/app/admin/crew-support/releaseActions";
import { addCandidatesAction, addToCollectionAction } from "@/app/admin/portfolio-library/actions";
import type { SourceFile } from "@/lib/portfolio/sourceFiles";

// Quick Portfolio Picker: browse photographs already held for jobs, preview them through the existing short-lived signed links, and keep a TEMPORARY
// selection tray for the current conversation. The tray follows you between Final Images, Jobs & Projects and Collections (this browser tab only; it holds
// file ids and labels, never images or links). Nothing is stored, shared or published from here. Marketing permission and internal approval are separate
// stages: every photograph is shown with its current standing, and by default that is "not cleared".
const TRAY_KEY = "ordift-portfolio-picker-tray";
type TrayItem = Pick<SourceFile, "id" | "filename" | "jobLabel" | "kindLabel">;
const toItem = (f: TrayItem): TrayItem => ({ id: f.id, filename: f.filename, jobLabel: f.jobLabel, kindLabel: f.kindLabel });

export type PickerStanding = { permission: string; internal: string };

export default function PortfolioPicker({ files, standing, candidatesNote, canPropose = false, collections = [] }: { files: SourceFile[]; standing?: Record<string, PickerStanding>; candidatesNote?: string; canPropose?: boolean; collections?: { id: string; name: string }[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tray, setTrayState] = useState<TrayItem[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [proposed, setProposed] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [colId, setColId] = useState("");
  const [colName, setColName] = useState("");

  // Reading browser-only storage can only happen after mount (server rendering has none), so this one-time state restore belongs in an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { const raw = window.sessionStorage.getItem(TRAY_KEY); if (raw) setTrayState(JSON.parse(raw) as TrayItem[]); } catch { /* storage unavailable: the tray starts empty */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const setTray = (next: (t: TrayItem[]) => TrayItem[]) => setTrayState((cur) => {
    const v = next(cur);
    try { window.sessionStorage.setItem(TRAY_KEY, JSON.stringify(v)); } catch { /* ignore */ }
    return v;
  });

  const trayKey = tray.map((t) => t.id).join(",");
  useEffect(() => {
    let alive = true;
    const ids = [...new Set([...files.slice(0, 48).map((f) => f.id), ...trayKey.split(",").filter(Boolean)])].slice(0, 60);
    if (ids.length === 0) return;
    previewUrlsAction(ids).then((r) => {
      if (!alive) return;
      if (!r.ok) { setNote(r.error); return; }
      const next: Record<string, string> = {};
      for (const [id, v] of Object.entries(r.urls)) if ("url" in v) next[id] = v.url;
      setUrls(next);
    }).catch(() => alive && setNote("Previews could not be loaded."));
    return () => { alive = false; };
  }, [files, trayKey]);

  const inTray = (id: string) => tray.some((t) => t.id === id);
  const toggle = (f: TrayItem) => setTray((t) => (t.some((x) => x.id === f.id) ? t.filter((x) => x.id !== f.id) : [...t, toItem(f)]));
  const list = tray.map((t, i) => `${i + 1}. ${t.filename} — ${t.jobLabel} — ${t.kindLabel}${standing?.[t.id] ? ` — ${standing[t.id].permission} / ${standing[t.id].internal}` : " — NOT CLEARED for marketing"}`).join("\n");
  async function copy() { try { await navigator.clipboard.writeText(`Internal portfolio shortlist (not for sharing with clients)\n${list}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }
  async function propose() { setProposing(true); try { const r = await addCandidatesAction(tray.map((t) => t.id), "picker"); setProposed(r.message); } finally { setProposing(false); } }
  async function toCollection() { setProposing(true); try { const r = await addToCollectionAction(tray.map((t) => t.id), colId, colName); setProposed(r.message); } finally { setProposing(false); } }
  const jobCount = new Set(tray.map((t) => t.jobLabel)).size;

  return (
    <div className="space-y-6">
      {note && <p role="alert" className="font-sans text-caption text-amber-900">{note}</p>}
      <section aria-labelledby="tray" className="rounded-xl border border-black/10 bg-white p-4 space-y-2 sticky top-2 z-10">
        <h2 id="tray" className="font-serif font-medium text-body text-ordift-ink">Selection tray ({tray.length}{jobCount > 1 ? ` · ${jobCount} jobs` : ""})</h2>
        {tray.length === 0 ? <p className="font-sans text-caption text-ordift-ink-muted">Select photographs below. The tray is temporary and lives only in this tab (it survives switching between Final Images, Jobs &amp; Projects and Collections).</p> : (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {tray.map((t) => (
              <li key={t.id} className="shrink-0 w-24">
                {urls[t.id] ? <img src={urls[t.id]} alt={t.filename} className="h-20 w-24 rounded-md object-cover" /> : <div className="h-20 w-24 rounded-md bg-black/5" />}
                <button type="button" onClick={() => toggle(t)} className="mt-1 w-full rounded border border-black/15 px-1 py-0.5 font-sans text-caption">Remove</button>
              </li>
            ))}
          </ul>
        )}
        {tray.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} className="rounded-md bg-ordift-ink px-3 py-1.5 font-sans text-caption text-white">{copied ? "Copied" : "Copy internal list"}</button>
            {canPropose && <button type="button" onClick={propose} disabled={proposing} className="rounded-md border border-ordift-ink px-3 py-1.5 font-sans text-caption">Add to Portfolio Candidates</button>}
            {canPropose && (
              <span className="flex flex-wrap items-center gap-1">
                <select aria-label="Collection" value={colId} onChange={(e) => setColId(e.target.value)} className="rounded-md border border-black/15 px-2 py-1.5 font-sans text-caption"><option value="">New collection…</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                {!colId && <input aria-label="New collection name" value={colName} onChange={(e) => setColName(e.target.value)} placeholder="Collection name" className="rounded-md border border-black/15 px-2 py-1.5 font-sans text-caption" />}
                <button type="button" onClick={toCollection} disabled={proposing || (!colId && colName.trim().length < 2)} className="rounded-md border border-ordift-ink px-3 py-1.5 font-sans text-caption disabled:opacity-50">Add tray to collection</button>
              </span>
            )}
            <button type="button" onClick={() => setTray(() => [])} className="rounded-md border border-black/15 px-3 py-1.5 font-sans text-caption">Clear tray</button>
            <span className="font-sans text-caption text-amber-900">A photograph can be sent to a client or published only when both marketing permission and internal approval cover that use. Until then the list is internal.</span>
          </div>
        )}
        {proposed && <p role="status" className="font-sans text-caption text-green-800">{proposed}</p>}
        {candidatesNote && <p className="font-sans text-caption text-ordift-ink-muted">{candidatesNote}</p>}
      </section>

      {files.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No photographs match. Only image files from jobs appear here.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => {
            const st = standing?.[f.id];
            return (
              <li key={f.id} className={`rounded-xl border bg-white p-2 ${inTray(f.id) ? "border-ordift-gold-pressed" : "border-black/10"}`}>
                {urls[f.id] ? <img src={urls[f.id]} alt={f.filename} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <div className="aspect-[4/3] w-full rounded-lg bg-black/5" />}
                <p className="mt-1 truncate font-sans text-caption font-medium text-ordift-ink" title={f.filename}>{f.filename}</p>
                <p className="truncate font-sans text-caption text-ordift-ink-muted" title={f.jobLabel}>{f.jobLabel}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">{f.kindLabel}{f.retained ? " · retained" : ""}</p>
                {st ? (
                  <p className="font-sans text-caption text-ordift-ink">{st.permission}<br />{st.internal}</p>
                ) : (
                  <p className="font-sans text-caption text-red-800">Not cleared for marketing</p>
                )}
                <button type="button" onClick={() => toggle(f)} aria-pressed={inTray(f.id)} className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 font-sans text-caption">{inTray(f.id) ? "Remove from tray" : "Add to tray"}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
