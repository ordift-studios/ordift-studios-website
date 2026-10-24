"use client";

/* eslint-disable @next/next/no-img-element -- short-lived signed URLs to private files; next/image optimisation would need them to be allow-listed and cached */

import { useEffect, useState } from "react";
import { previewUrlsAction } from "@/app/admin/crew-support/releaseActions";
import type { SourceFile } from "@/lib/portfolio/sourceFiles";

// Quick Portfolio Picker: browse photographs already held for jobs, preview them through the existing short-lived signed links, and keep a TEMPORARY
// selection tray for the current conversation. Nothing is stored, shared or published from here: marketing clearance is not recorded yet, so every
// photograph is shown as NOT cleared, and the tray's only output is an internal list.
export default function PortfolioPicker({ files }: { files: SourceFile[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tray, setTray] = useState<SourceFile[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const ids = files.slice(0, 60).map((f) => f.id);
    if (ids.length === 0) return;
    previewUrlsAction(ids).then((r) => {
      if (!alive) return;
      if (!r.ok) { setNote(r.error); return; }
      const next: Record<string, string> = {};
      for (const [id, v] of Object.entries(r.urls)) if ("url" in v) next[id] = v.url;
      setUrls(next);
    }).catch(() => alive && setNote("Previews could not be loaded."));
    return () => { alive = false; };
  }, [files]);

  const inTray = (id: string) => tray.some((t) => t.id === id);
  const toggle = (f: SourceFile) => setTray((t) => (t.some((x) => x.id === f.id) ? t.filter((x) => x.id !== f.id) : [...t, f]));
  const list = tray.map((t, i) => `${i + 1}. ${t.filename} — ${t.jobLabel} — ${t.kindLabel} — NOT CLEARED for marketing`).join("\n");
  async function copy() { try { await navigator.clipboard.writeText(`Internal portfolio shortlist (not for sharing with clients; no marketing clearance recorded)\n${list}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }

  return (
    <div className="space-y-6">
      {note && <p role="alert" className="font-sans text-caption text-amber-900">{note}</p>}
      <section aria-labelledby="tray" className="rounded-xl border border-black/10 bg-white p-4 space-y-2 sticky top-2 z-10">
        <h2 id="tray" className="font-serif font-medium text-body text-ordift-ink">Selection tray ({tray.length})</h2>
        {tray.length === 0 ? <p className="font-sans text-caption text-ordift-ink-muted">Select photographs below. The tray is temporary and lives only in this tab.</p> : (
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
            <button type="button" onClick={() => setTray([])} className="rounded-md border border-black/15 px-3 py-1.5 font-sans text-caption">Clear tray</button>
            <span className="font-sans text-caption text-amber-900">All {tray.length} are NOT cleared for marketing: they cannot be sent to a client or published until clearance is recorded.</span>
          </div>
        )}
      </section>

      {files.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No photographs match. Only image files from jobs appear here.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <li key={f.id} className={`rounded-xl border bg-white p-2 ${inTray(f.id) ? "border-ordift-gold-pressed" : "border-black/10"}`}>
              {urls[f.id] ? <img src={urls[f.id]} alt={f.filename} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <div className="aspect-[4/3] w-full rounded-lg bg-black/5" />}
              <p className="mt-1 truncate font-sans text-caption font-medium text-ordift-ink" title={f.filename}>{f.filename}</p>
              <p className="truncate font-sans text-caption text-ordift-ink-muted" title={f.jobLabel}>{f.jobLabel}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">{f.kindLabel}{f.retained ? " · retained" : ""}</p>
              <p className="font-sans text-caption text-red-800">Not cleared for marketing</p>
              <button type="button" onClick={() => toggle(f)} aria-pressed={inTray(f.id)} className="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 font-sans text-caption">{inTray(f.id) ? "Remove from tray" : "Add to tray"}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
