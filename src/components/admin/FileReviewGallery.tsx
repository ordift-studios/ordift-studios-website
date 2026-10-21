"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BUCKET_LABELS, bucketFor, formatBytes, isPreviewableImage, shouldAutoLoadThumbnail, statusLabel, type FileOutcome, type GalleryFile, type ReviewBucket } from "@/lib/crewSupport/fileReview";

export type { GalleryFile };

// Internal review gallery for an assignment's files: thumbnails, status, selection, a full-screen viewer with
// previous/next and zoom, and clearly confirmed single or bulk actions. It only ever receives short-lived signed
// links from the server (nothing is public, nothing is copied or resized); every action is re-authorised and
// re-checked per file on the server. What the actions DO is defined by the wrapper that mounts this component.

export type GalleryAction = {
  key: string;
  label: string;
  tone: "primary" | "neutral" | "danger";
  // Plain-language meaning, shown in the confirmation so nobody has to guess what a button does.
  meaning: string;
  needsNote?: boolean;
  noteLabel?: string;
  attestation?: string;
  // Exact consequences for the selected files, shown in the confirmation (e.g. the cleanup grace period).
  implications?: (files: GalleryFile[]) => string[];
  // Does this action apply to this file right now?
  eligible: (file: GalleryFile) => boolean;
  // Skips the viewer's separation-of-duties block (retention actions are not part of the review).
  ignoresBlock?: boolean;
  run: (fileIds: string[], note: string, attested: boolean) => Promise<{ ok: boolean; message: string; outcomes: FileOutcome[] }>;
};

export type PreviewUrlResult = { ok: true; urls: Record<string, { url: string } | { error: string }> } | { ok: false; error: string };

const TONE: Record<string, string> = {
  private: "bg-black/5 text-ordift-ink-muted",
  submitted: "bg-amber-50 text-amber-900",
  changes_requested: "bg-red-50 text-red-800",
  approved: "bg-blue-50 text-blue-800",
  released: "bg-green-50 text-green-800",
  withdrawn: "bg-black/5 text-ordift-ink-muted",
};
const BTN_TONE: Record<GalleryAction["tone"], string> = {
  primary: "bg-ordift-navy-950 text-white",
  neutral: "border border-black/20 text-ordift-ink",
  danger: "border border-red-300 text-red-800",
};
const URL_LIFETIME_MS = 8 * 60 * 1000; // links are signed for 10 minutes; refresh a little earlier

type UrlEntry = { url?: string; error?: string; at: number };
type Filter = "all" | ReviewBucket;
type Pending = { action: GalleryAction; ids: string[] } | null;
const ZOOMS = ["fit", 1, 2, 3] as const;

export default function FileReviewGallery({ files, actions, fetchUrls, emptyText = "No files.", cleanupNote }: { files: GalleryFile[]; actions: GalleryAction[]; fetchUrls: (ids: string[]) => Promise<PreviewUrlResult>; emptyText?: string; cleanupNote?: (file: GalleryFile) => string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [urls, setUrls] = useState<Record<string, UrlEntry>>({});
  const [viewer, setViewer] = useState<string | null>(null);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>("fit");
  const [natural, setNatural] = useState<{ w: number } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; outcomes: FileOutcome[] } | null>(null);
  const wanted = useRef<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: files.length };
    for (const f of files) c[bucketFor(f.releaseStatus)] = (c[bucketFor(f.releaseStatus)] ?? 0) + 1;
    return c;
  }, [files]);
  const visible = useMemo(() => (filter === "all" ? files : files.filter((f) => bucketFor(f.releaseStatus) === filter)), [files, filter]);
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  // ---- signed links: requested in batches, only for what is on screen, refreshed when they near expiry
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const flush = useCallback(async () => {
    const ids = [...wanted.current].filter((id) => !inFlight.current.has(id)).slice(0, 30);
    wanted.current = new Set([...wanted.current].filter((id) => !ids.includes(id)));
    if (ids.length === 0) return;
    ids.forEach((id) => inFlight.current.add(id));
    const r = await fetchUrls(ids);
    const now = Date.now();
    setUrls((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (!r.ok) next[id] = { error: r.error, at: now };
        else {
          const hit = r.urls[id];
          next[id] = hit && "url" in hit ? { url: hit.url, at: now } : { error: hit && "error" in hit ? hit.error : "Preview unavailable.", at: now };
        }
      }
      return next;
    });
    ids.forEach((id) => inFlight.current.delete(id));
    if (wanted.current.size > 0) setTimeout(() => void flushRef.current(), 0);
  }, [fetchUrls]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const want = useCallback(
    (id: string, force = false) => {
      const have = urls[id];
      if (!force && have && (have.error || Date.now() - have.at < URL_LIFETIME_MS)) return;
      wanted.current.add(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 120);
    },
    [urls, flush]
  );
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ---- selection (only files an action can currently act on may be selected)
  const actionable = useCallback((f: GalleryFile) => actions.some((a) => a.eligible(f) && (a.ignoresBlock || !f.blockedReason)), [actions]);
  const selectableVisible = visible.filter(actionable);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedFiles = [...selected].map((id) => byId.get(id)).filter((f): f is GalleryFile => Boolean(f));

  // ---- viewer
  const viewerIndex = viewer ? visible.findIndex((f) => f.id === viewer) : -1;
  const current = viewerIndex >= 0 ? visible[viewerIndex] : null;
  function openViewer(id: string, el?: HTMLElement | null) {
    openerRef.current = el ?? (document.activeElement as HTMLElement | null);
    setZoom("fit");
    setNatural(null);
    setViewer(id);
  }
  function closeViewer() {
    setViewer(null);
    setPending((p) => (p && p.ids.length === 1 && p.ids[0] === viewer ? null : p));
    openerRef.current?.focus?.();
  }
  const step = useCallback((delta: number) => {
    if (viewerIndex < 0 || visible.length === 0) return;
    setZoom("fit");
    setNatural(null);
    setViewer(visible[(viewerIndex + delta + visible.length) % visible.length].id);
  }, [viewerIndex, visible]);

  useEffect(() => {
    if (!current) return;
    want(current.id);
    const next = visible[(viewerIndex + 1) % visible.length];
    if (next && next.id !== current.id && isPreviewableImage(next.mimeType, next.filename)) want(next.id);
    closeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "Escape") closeViewer();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => ZOOMS[Math.min(ZOOMS.indexOf(z) + 1, ZOOMS.length - 1)]);
      else if (e.key === "-") setZoom((z) => ZOOMS[Math.max(ZOOMS.indexOf(z) - 1, 0)]);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, step]);

  // ---- actions
  function begin(action: GalleryAction, ids: string[]) {
    setPending({ action, ids });
    setNote("");
    setAttested(false);
    setResult(null);
  }
  async function confirm() {
    if (!pending) return;
    const { action, ids } = pending;
    if (action.needsNote && note.trim().length < 5) return setResult({ ok: false, message: `${action.noteLabel ?? "A note"} is required (at least 5 characters).`, outcomes: [] });
    if (action.attestation && !attested) return setResult({ ok: false, message: "Tick the box to confirm before continuing.", outcomes: [] });
    setRunning(true);
    setResult(null);
    const r = await action.run(ids, note.trim(), attested).catch(() => ({ ok: false, message: "Something went wrong. Some files may have been processed — refresh to see their current status.", outcomes: [] as FileOutcome[] }));
    setRunning(false);
    setResult(r);
    setPending(null);
    setSelected((s) => { const n = new Set(s); for (const o of r.outcomes) if (o.ok) n.delete(o.fileId); return n; });
    router.refresh();
  }

  // Rendered by calling these as plain functions (not as components) so typing in the note field never remounts them.
  const renderActionBar = (ids: string[], target: GalleryFile[]) => {
    const usable = actions.filter((a) => target.length > 0 && target.every((f) => a.eligible(f) && (a.ignoresBlock || !f.blockedReason)));
    // Offer an action when it applies to at least one of the targets; the confirmation states the exact count.
    const partial = actions.filter((a) => !usable.includes(a) && target.some((f) => a.eligible(f) && (a.ignoresBlock || !f.blockedReason)));
    return (
      <div className="flex flex-wrap items-center gap-2">
        {[...usable, ...partial].map((a) => {
          const n = target.filter((f) => a.eligible(f) && (a.ignoresBlock || !f.blockedReason)).length;
          return (
            <button key={a.key} type="button" disabled={running} onClick={() => begin(a, target.filter((f) => a.eligible(f) && (a.ignoresBlock || !f.blockedReason)).map((f) => f.id))} className={`rounded-md px-3 py-1.5 font-sans text-caption font-semibold disabled:opacity-50 ${BTN_TONE[a.tone]}`}>
              {a.label}{ids.length > 1 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>
    );
  };

  const renderConfirm = () => {
    if (!pending) return null;
    const { action, ids } = pending;
    const names = ids.map((id) => byId.get(id)).filter((f): f is GalleryFile => Boolean(f)).map((f) => f.title ?? f.filename);
    return (
      <div role="group" aria-label="Confirm action" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-ordift-ink">
        <p className="font-sans text-body-small font-semibold">{action.label}: {ids.length} file{ids.length === 1 ? "" : "s"}</p>
        <p className="font-sans text-caption">{action.meaning}</p>
        {action.implications && (
          <ul className="list-disc space-y-1 pl-5 font-sans text-caption" data-testid="implications">
            {action.implications(ids.map((id) => byId.get(id)).filter((f): f is GalleryFile => Boolean(f))).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted">{names.slice(0, 5).join(", ")}{names.length > 5 ? ` and ${names.length - 5} more` : ""}</p>
        {action.needsNote && (
          <label className="block font-sans text-caption">{action.noteLabel ?? "Note"}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
          </label>
        )}
        {action.attestation && (
          <label className="flex items-start gap-2 font-sans text-caption"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5" /> {action.attestation}</label>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void confirm()} disabled={running} className={`rounded-md px-3 py-1.5 font-sans text-caption font-semibold disabled:opacity-50 ${BTN_TONE[action.tone === "danger" ? "danger" : "primary"]}`}>{running ? "Working…" : `Apply to ${ids.length} file${ids.length === 1 ? "" : "s"}`}</button>
          <button type="button" onClick={() => setPending(null)} disabled={running} className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption">Cancel</button>
        </div>
      </div>
    );
  };

  const tabs: Filter[] = ["all", "awaiting", "approved", "changes", "released", "private", "other"];
  const active = pending && current && pending.ids.length === 1 && pending.ids[0] === current.id;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Filter files" className="flex flex-wrap gap-2">
        {tabs.filter((t) => t === "all" || (counts[t] ?? 0) > 0).map((t) => (
          <button key={t} role="tab" aria-selected={filter === t} type="button" onClick={() => setFilter(t)} className={`rounded-full border px-3 py-1 font-sans text-caption ${filter === t ? "border-ordift-navy-950 bg-ordift-navy-950 text-white" : "border-black/15 text-ordift-ink"}`}>
            {t === "all" ? "All" : BUCKET_LABELS[t]} ({counts[t] ?? 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2">
        <button type="button" onClick={() => setSelected(new Set(selectableVisible.map((f) => f.id)))} disabled={selectableVisible.length === 0} className="rounded-md border border-black/20 px-2.5 py-1 font-sans text-caption disabled:opacity-40">Select all eligible ({selectableVisible.length})</button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0} className="rounded-md border border-black/20 px-2.5 py-1 font-sans text-caption disabled:opacity-40">Clear selection</button>
        <span aria-live="polite" className="font-sans text-caption text-ordift-ink-muted">{selected.size} selected</span>
        {selected.size > 0 && renderActionBar([...selected], selectedFiles)}
      </div>

      {!current && renderConfirm()}
      {result && (
        <div role={result.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 ${result.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <p className="font-sans text-body-small">{result.message}</p>
          {result.outcomes.some((o) => !o.ok) && (
            <ul className="mt-1 list-disc pl-5 font-sans text-caption">{result.outcomes.filter((o) => !o.ok).map((o) => <li key={o.fileId}>{o.label}: {o.error}</li>)}</ul>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">{emptyText}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((f) => (
            <Tile key={f.id} f={f} note={cleanupNote?.(f) ?? null} entry={urls[f.id]} checked={selected.has(f.id)} selectable={actionable(f)} onToggle={() => toggle(f.id)} onOpen={(el) => openViewer(f.id, el)} onVisible={() => { if (shouldAutoLoadThumbnail(f.sizeBytes, f.mimeType, f.filename)) want(f.id); }} onBroken={() => want(f.id, true)} />
          ))}
        </ul>
      )}

      {current && (
        <div role="dialog" aria-modal="true" aria-label={`Viewing ${current.title ?? current.filename}`} className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-sans text-body-small font-semibold">{current.title ?? current.filename}</p>
              <p className="truncate font-sans text-caption text-white/70">{current.filename} · {formatBytes(current.sizeBytes)} · {current.classification} · {statusLabel(current.releaseStatus)} · {viewerIndex + 1} of {visible.length}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ZOOMS.map((z) => (
                <button key={String(z)} type="button" onClick={() => setZoom(z)} aria-pressed={zoom === z} className={`rounded-md border px-2.5 py-1 font-sans text-caption ${zoom === z ? "border-white bg-white text-black" : "border-white/40"}`}>{z === "fit" ? "Fit" : `${z * 100}%`}</button>
              ))}
              {urls[current.id]?.url && <a href={urls[current.id].url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/40 px-2.5 py-1 font-sans text-caption">Open full file</a>}
              <button ref={closeRef} type="button" onClick={closeViewer} className="rounded-md bg-white px-3 py-1 font-sans text-caption font-semibold text-black">Close</button>
            </div>
          </div>
          <div className="relative flex-1 overflow-auto" data-testid="viewer-stage">
            {isPreviewableImage(current.mimeType, current.filename) ? (
              urls[current.id]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  src={urls[current.id].url}
                  alt={current.title ?? current.filename}
                  onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth })}
                  onError={() => want(current.id, true)}
                  className={zoom === "fit" ? "mx-auto max-h-full max-w-full object-contain" : "mx-auto max-w-none"}
                  style={zoom === "fit" ? undefined : { width: `${(natural?.w ?? 1200) * zoom}px` }}
                />
              ) : urls[current.id]?.error ? (
                <p className="p-8 text-center font-sans text-body-small">This preview isn&apos;t available: {urls[current.id].error}</p>
              ) : (
                <p className="p-8 text-center font-sans text-body-small">Loading the image…</p>
              )
            ) : (
              <p className="p-8 text-center font-sans text-body-small">A preview isn&apos;t available for this file type. {urls[current.id]?.url ? "Use “Open full file” above." : ""}</p>
            )}
            <button type="button" onClick={() => step(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-black">‹</button>
            <button type="button" onClick={() => step(1)} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-black">›</button>
          </div>
          <div className="space-y-2 px-4 py-3">
            {current.note && <p className="font-sans text-caption text-white/80">Note: {current.note}</p>}
            {current.blockedReason && <p className="rounded-md bg-amber-100 px-3 py-2 font-sans text-caption text-amber-950">{current.blockedReason}</p>}
            {renderActionBar([current.id], [current])}
            {active && renderConfirm()}
            {result && !pending && <p role={result.ok ? "status" : "alert"} className="font-sans text-caption">{result.message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ f, note, entry, checked, selectable, onToggle, onOpen, onVisible, onBroken }: { f: GalleryFile; note?: string | null; entry?: UrlEntry; checked: boolean; selectable: boolean; onToggle: () => void; onOpen: (el: HTMLElement) => void; onVisible: () => void; onBroken: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { onVisible(); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { onVisible(); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);
  const previewable = isPreviewableImage(f.mimeType, f.filename);
  return (
    <li ref={ref} className={`overflow-hidden rounded-lg border bg-white ${checked ? "border-ordift-navy-950 ring-2 ring-ordift-navy-950" : "border-black/10"}`}>
      <div className="relative">
        <button type="button" onClick={(e) => onOpen(e.currentTarget)} aria-label={`View ${f.title ?? f.filename}`} className="block aspect-[4/3] w-full bg-black/5">
          {entry?.url && previewable ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.url} alt="" loading="lazy" onError={onBroken} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center font-sans text-caption text-ordift-ink-muted">
              {!previewable ? "No preview for this file type" : entry?.error ? entry.error : shouldAutoLoadThumbnail(f.sizeBytes, f.mimeType, f.filename) ? "Loading…" : `Large file (${formatBytes(f.sizeBytes)}) — click to view`}
            </span>
          )}
        </button>
        {selectable && (
          <label className="absolute left-2 top-2 rounded bg-white/90 p-1">
            <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${f.title ?? f.filename}`} />
          </label>
        )}
      </div>
      <div className="space-y-1 p-2">
        <p className="truncate font-sans text-caption font-medium text-ordift-ink" title={f.filename}>{f.title ?? f.filename}</p>
        {f.title && <p className="truncate font-sans text-caption text-ordift-ink-muted" title={f.filename}>{f.filename}</p>}
        <p className="flex flex-wrap items-center gap-1">
          <span className={`inline-flex rounded-full px-2 py-0.5 font-sans text-caption font-medium ${TONE[f.releaseStatus] ?? ""}`}>{statusLabel(f.releaseStatus)}</span>
          {f.blockedReason && <span title="Separation of duties: open the file to see why" className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-sans text-caption text-amber-950">Can&apos;t act on own work</span>}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">{f.classification}{f.categoryLabel ? ` · ${f.categoryLabel}` : ""} · {formatBytes(f.sizeBytes)}</p>
        {note && <p className="font-sans text-caption text-ordift-ink-muted" data-testid="cleanup-note">{note}</p>}
      </div>
    </li>
  );
}
