"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Photo from "@/app/connect/Photo";
import PortfolioSlideshow from "@/app/connect/PortfolioSlideshow";
import { PortfolioProvider, usePortfolio } from "@/app/connect/PortfolioProvider";
import { prepareQrPortfolioImage } from "@/lib/media/qrPortfolioImagePrep";
import type { ManagerView, ViewItem } from "@/lib/connectPortfolio/view";
import { changeDraftAction, discardDraftAction, publishAction, restoreRevisionAction, type ActionResult } from "./actions";

const GOLD = "inline-flex min-h-11 items-center justify-center rounded-lg bg-ordift-gold px-5 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE = "inline-flex min-h-11 items-center justify-center rounded-lg border border-black/20 px-4 font-sans text-body-small font-medium text-ordift-ink hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50";
const SMALL = "inline-flex min-h-9 items-center justify-center rounded-md border border-black/20 px-3 font-sans text-caption font-medium text-ordift-ink hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD = "w-full rounded-lg border border-black/20 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";

type Notice = { tone: "ok" | "error"; text: string; warnings: string[]; conflict?: boolean } | null;
type Staged = { assetId: string; filename: string; width: number; height: number; previewUrl: string; hadLocation: boolean };
type Target = { mode: "add" } | { mode: "replace"; key: string };

// Starts the slideshow as soon as the preview opens (the card page waits for a tap on View Portfolio; the preview should not).
function OpenOnMount() {
  const { open } = usePortfolio();
  useEffect(() => { open(); }, [open]);
  return null;
}

export default function PortfolioManager({ initialView }: { initialView: ManagerView }) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [seenInitial, setSeenInitial] = useState(initialView);
  if (seenInitial !== initialView) { setSeenInitial(initialView); setView(initialView); }   // router.refresh() delivers a newer view from the server
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "discard" | "reset" | "remove" | "restore"; key?: string; revisionId?: string }>(null);
  const [publishNote, setPublishNote] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [alt, setAlt] = useState("");
  const [rights, setRights] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<{ key: string; alt: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const total = view.items.length;
  const visibleImages = useMemo(() => view.items.filter((i) => !i.hidden).map((i) => i.image), [view.items]);
  const previewKey = useMemo(() => visibleImages.map((i) => i.id).join("|"), [visibleImages]);

  function show(result: ActionResult, after?: () => void) {
    if (result.ok) {
      setView(result.view);
      setNotice({ tone: "ok", text: result.message, warnings: result.warnings });
      after?.();
    } else {
      setNotice({ tone: "error", text: result.message, warnings: [], conflict: result.code === "conflict" });
    }
    noticeRef.current?.focus();
  }
  function run(action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      try { show(await action(), after); }
      catch { setNotice({ tone: "error", text: "That did not go through. Nothing was changed. Check your connection and try again.", warnings: [] }); noticeRef.current?.focus(); }
    });
  }
  const change = (op: Record<string, unknown>, after?: () => void) => run(() => changeDraftAction(view.draftRev, op), after);

  function clearUploader() {
    if (staged) URL.revokeObjectURL(staged.previewUrl);
    setStaged(null); setAlt(""); setRights(false); setTarget(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (staged) URL.revokeObjectURL(staged.previewUrl);
    setStaged(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setNotice({ tone: "error", text: "Only JPEG, PNG and WebP photographs can be added.", warnings: [] }); return; }
    setUploading(true); setNotice(null);
    try {
      const prepared = await prepareQrPortfolioImage(file);
      if (prepared.size > view.limits.maxUploadBytes) throw new Error("That photograph is larger than 8 MB even after shrinking.");
      const body = new FormData();
      body.append("file", prepared);
      const res = await fetch("/api/admin/qr-portfolio/upload", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; assetId?: string; width?: number; height?: number; filename?: string; hadLocation?: boolean } | null;
      if (!res.ok || !json?.ok || !json.assetId) throw new Error(json?.message ?? (res.status === 413 ? "That photograph is too large to upload." : "The upload did not go through."));
      setStaged({ assetId: json.assetId, filename: json.filename ?? file.name, width: json.width ?? 0, height: json.height ?? 0, previewUrl: URL.createObjectURL(prepared), hadLocation: json.hadLocation === true });
      setTarget((t) => t ?? { mode: "add" });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "The upload did not go through.", warnings: [] });
    } finally { setUploading(false); }
  }

  function submitUpload() {
    if (!staged || !target) return;
    const base = { assetId: staged.assetId, filename: staged.filename, alt, rightsConfirmed: rights };
    change(target.mode === "add" ? { type: "addUploaded", ...base } : { type: "replace", key: target.key, ...base }, clearUploader);
  }

  const idx = (k: string) => view.items.findIndex((i) => i.key === k) + 1;
  const replacing = target?.mode === "replace" ? view.items.find((i) => i.key === target.key) : null;
  const canAddMore = view.draftVisibleCount < view.limits.maxPublished;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ status */}
      <section aria-labelledby="qp-status" className="rounded-xl border border-black/10 bg-white p-5">
        <h2 id="qp-status" className="sr-only">Status</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="font-sans text-caption text-ordift-ink-muted">Live on the card page</dt>
            <dd className="mt-1 font-sans text-body font-medium text-ordift-ink">{view.liveVisibleCount} photographs</dd>
            <dd className="font-sans text-caption text-ordift-ink-muted">{view.liveSource === "original" ? "The original 15, unchanged" : `Published ${view.publishedAt ? new Date(view.publishedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}${view.publishedByLabel ? ` by ${view.publishedByLabel}` : ""}`}</dd>
          </div>
          <div>
            <dt className="font-sans text-caption text-ordift-ink-muted">Pending changes</dt>
            <dd className="mt-1 font-sans text-body font-medium text-ordift-ink">{view.pending ? `Yes, ${view.draftVisibleCount} photographs once published` : "None"}</dd>
            <dd className="font-sans text-caption text-ordift-ink-muted">{view.pending ? "Visitors do not see these yet." : "What you see below is what is live."}</dd>
          </div>
          <div>
            <dt className="font-sans text-caption text-ordift-ink-muted">Limit</dt>
            <dd className="mt-1 font-sans text-body font-medium text-ordift-ink">{view.draftVisibleCount} of {view.limits.maxPublished} visible</dd>
            <dd className="font-sans text-caption text-ordift-ink-muted">Hidden photographs do not count.</dd>
          </div>
        </dl>
        {view.unreadable > 0 && <p role="alert" className="mt-3 font-sans text-caption text-red-800">{view.unreadable} stored entries could not be read and are not shown. Contact the developer before publishing.</p>}
      </section>

      <div ref={noticeRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {notice && (
          <div className={`rounded-lg border p-4 font-sans text-body-small ${notice.tone === "ok" ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
            <p>{notice.text}</p>
            {notice.warnings.map((w) => <p key={w} className="mt-1 font-medium">{w}</p>)}
            {notice.conflict && <button type="button" onClick={() => { setNotice(null); router.refresh(); }} className={`${SMALL} mt-2`}>Reload the latest version</button>}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ actions */}
      <section aria-labelledby="qp-actions" className="rounded-xl border border-black/10 bg-white p-5">
        <h2 id="qp-actions" className="font-sans text-body font-medium text-ordift-ink">Publish</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Check the preview first. Publishing makes the card page show this list on the next scan, with no website update. Every publish is kept in the history below, so it can be undone.</p>
        {view.publishProblems.length > 0 && <ul role="alert" className="mt-2 list-disc pl-5 font-sans text-caption text-red-800">{view.publishProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button type="button" className={OUTLINE} onClick={() => setPreviewOpen((o) => !o)} aria-expanded={previewOpen}>{previewOpen ? "Hide preview" : "Preview pending changes"}</button>
          <label className="min-w-[14rem] flex-1 font-sans text-caption text-ordift-ink-muted">Note for the history (optional)
            <input id="qp-note" value={publishNote} onChange={(e) => setPublishNote(e.target.value)} maxLength={200} className={`${FIELD} mt-1`} disabled={!view.canPublish} />
          </label>
          <button type="button" className={GOLD} disabled={busy || !view.canPublish} onClick={() => run(() => publishAction(view.draftRev, publishNote || null), () => setPublishNote(""))}>Publish changes</button>
          <button type="button" className={OUTLINE} disabled={busy || !view.pending} onClick={() => setConfirm({ kind: "discard" })}>Discard pending changes</button>
        </div>
        {confirm?.kind === "discard" && (
          <ConfirmBar text="Discard all pending changes and go back to what is live? The published version is not affected." action="Discard" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => run(() => discardDraftAction(view.draftRev), () => setConfirm(null))} />
        )}
      </section>

      {previewOpen && (
        <section aria-labelledby="qp-preview" className="rounded-xl border border-black/10 bg-white p-5">
          <h2 id="qp-preview" className="font-sans text-body font-medium text-ordift-ink">Preview of the pending list</h2>
          <p className="mt-1 font-sans text-caption text-ordift-ink-muted">This is the card page&rsquo;s own slideshow and View All gallery, showing the {visibleImages.length} visible photographs in order. Visitors do not see it until you publish.</p>
          {visibleImages.length === 0 ? <p className="mt-3 font-sans text-body-small text-ordift-ink-muted">No photographs are visible.</p> : (
            <div className="mt-4 max-w-[30rem] rounded-xl bg-ordift-navy-950 p-5 text-white">
              <PortfolioProvider key={previewKey} images={visibleImages}><OpenOnMount /><PortfolioSlideshow /></PortfolioProvider>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ add / replace */}
      <section aria-labelledby="qp-add" className="rounded-xl border border-black/10 bg-white p-5">
        <h2 id="qp-add" className="font-sans text-body font-medium text-ordift-ink">{replacing ? `Replace photograph ${idx(replacing.key)}` : "Add a photograph"}</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">JPEG, PNG or WebP, at least {view.limits.minLongEdge} px on the longer side, up to 8 MB. Large photographs are shrunk to 2560 px in your browser first. Camera, date and location details are removed from every photograph when it is uploaded. The photograph is added to the pending changes only.</p>
        <div className="mt-3 space-y-3">
          <label className="block font-sans text-caption text-ordift-ink-muted" htmlFor="qp-file">Photograph
            <input id="qp-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading || (!replacing && !canAddMore)} onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block w-full font-sans text-body-small" />
          </label>
          {!replacing && !canAddMore && <p className="font-sans text-caption text-red-800">The limit of {view.limits.maxPublished} visible photographs is reached. Hide or remove one first.</p>}
          {uploading && <p role="status" className="font-sans text-caption text-ordift-ink-muted">Preparing and uploading&hellip;</p>}
          {staged && (
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the file just chosen */}
              <img src={staged.previewUrl} alt="Preview of the photograph you chose" className="h-auto w-32 rounded-md border border-black/10" />
              <div className="space-y-3">
                <p className="font-sans text-caption text-ordift-ink-muted">{staged.filename} &middot; {staged.width} &times; {staged.height} px</p>
                <p className="font-sans text-caption text-green-800">{staged.hadLocation ? "Location details were found in this photograph and have been removed." : "Camera and location details removed."}</p>
                <label className="block font-sans text-caption text-ordift-ink-muted" htmlFor="qp-alt">Description for people who cannot see it (shown to screen readers)
                  <textarea id="qp-alt" value={alt} onChange={(e) => setAlt(e.target.value)} rows={2} maxLength={300} className={`${FIELD} mt-1`} placeholder="e.g. A woman in a red dress poses on a rocky outcrop against a clear blue sky" />
                </label>
                <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink" htmlFor="qp-rights">
                  <input id="qp-rights" type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span>I confirm that ORDIFT STUDIOS has the right to publish this photograph on the QR card page. This confirmation is recorded with my name and the date.</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={GOLD} disabled={busy || !rights || alt.trim().length < 10} onClick={submitUpload}>{target?.mode === "replace" ? "Use as replacement" : "Add to pending changes"}</button>
                  <button type="button" className={OUTLINE} onClick={clearUploader}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {replacing && !staged && <button type="button" className={SMALL} onClick={clearUploader}>Cancel replacing</button>}
        </div>
      </section>

      {/* ------------------------------------------------------------ the list */}
      <section aria-labelledby="qp-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="qp-list" className="font-sans text-body font-medium text-ordift-ink">Photographs ({total})</h2>
          <button type="button" className={SMALL} disabled={busy} onClick={() => setConfirm({ kind: "reset" })}>Reset to the original 15</button>
        </div>
        {confirm?.kind === "reset" && <ConfirmBar text="Replace the pending list with the original 15 photographs in their approved order? Added photographs stay in the content service and the history." action="Reset" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => change({ type: "resetToOriginal" }, () => setConfirm(null))} />}
        <ol className="mt-3 space-y-3">
          {view.items.map((item, i) => (
            <li key={item.key} className={`rounded-xl border bg-white p-3 sm:p-4 ${item.hidden ? "border-dashed border-black/25 opacity-80" : "border-black/10"}`}>
              <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
                <div className="relative h-28 w-[5.5rem] overflow-hidden rounded-md bg-black/5">
                  <Photo img={item.image} sizes="88px" className="block h-full w-full object-cover" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sans text-body-small font-medium tabular-nums text-ordift-ink">{i + 1}</span>
                    <Badge>{item.kind === "builtin" ? "Original" : "Added"}</Badge>
                    {item.hidden && <Badge tone="warn">Hidden</Badge>}
                    <span className="font-sans text-caption text-ordift-ink-muted">{item.image.width} &times; {item.image.height} px</span>
                  </div>
                  {editing?.key === item.key ? (
                    <div className="space-y-2">
                      <label className="block font-sans text-caption text-ordift-ink-muted" htmlFor={`alt-${item.key}`}>Description
                        <textarea id={`alt-${item.key}`} value={editing.alt} onChange={(e) => setEditing({ key: item.key, alt: e.target.value })} rows={2} maxLength={300} className={`${FIELD} mt-1`} />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" className={SMALL} disabled={busy} onClick={() => change({ type: "editAlt", key: item.key, alt: editing.alt }, () => setEditing(null))}>Save description</button>
                        <button type="button" className={SMALL} onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : <p className="font-sans text-body-small text-ordift-ink">{item.alt}</p>}
                  <ItemFacts item={item} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={SMALL} disabled={busy || i === 0} aria-label={`Move photograph ${i + 1} up`} onClick={() => change({ type: "moveUp", key: item.key })}>Move up</button>
                    <button type="button" className={SMALL} disabled={busy || i === total - 1} aria-label={`Move photograph ${i + 1} down`} onClick={() => change({ type: "moveDown", key: item.key })}>Move down</button>
                    <label className="flex items-center gap-1 font-sans text-caption text-ordift-ink-muted">Position
                      <select value={i + 1} disabled={busy} aria-label={`Position of photograph ${i + 1}`} onChange={(e) => change({ type: "moveTo", key: item.key, index: Number(e.target.value) - 1 })} className="min-h-9 rounded-md border border-black/20 bg-white px-1 font-sans text-caption">
                        {view.items.map((_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}
                      </select>
                    </label>
                    {item.hidden
                      ? <button type="button" className={SMALL} disabled={busy || !canAddMore} onClick={() => change({ type: "restore", key: item.key })}>Restore</button>
                      : <button type="button" className={SMALL} disabled={busy} onClick={() => change({ type: "hide", key: item.key })}>Hide</button>}
                    <button type="button" className={SMALL} disabled={busy} onClick={() => { setTarget({ mode: "replace", key: item.key }); setStaged(null); document.getElementById("qp-add")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Replace</button>
                    {item.kind === "uploaded" && <button type="button" className={SMALL} disabled={busy} onClick={() => setEditing({ key: item.key, alt: item.alt })}>Edit description</button>}
                    <button type="button" className={`${SMALL} text-red-800`} disabled={busy} onClick={() => setConfirm({ kind: "remove", key: item.key })}>Remove from QR portfolio</button>
                  </div>
                  {confirm?.kind === "remove" && confirm.key === item.key && (
                    <ConfirmBar text="Remove this photograph from the QR portfolio list? The image itself is not deleted and can be added back from the history." action="Remove" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => change({ type: "remove", key: item.key }, () => setConfirm(null))} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {view.addable.length > 0 && (
          <div className="mt-4 rounded-xl border border-black/10 bg-white p-4">
            <h3 className="font-sans text-body-small font-medium text-ordift-ink">Original photographs not in the list</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {view.addable.map((a) => (
                <li key={a.builtinId} className="flex items-center gap-3">
                  <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-black/5"><Photo img={a.image} sizes="44px" className="block h-full w-full object-cover" /></div>
                  <p className="min-w-0 flex-1 truncate font-sans text-caption text-ordift-ink-muted" title={a.image.alt}>{a.image.alt}</p>
                  <button type="button" className={SMALL} disabled={busy || !canAddMore} onClick={() => change({ type: "addBuiltin", builtinId: a.builtinId })}>Add back</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ history */}
      <section aria-labelledby="qp-history" className="rounded-xl border border-black/10 bg-white p-5">
        <h2 id="qp-history" className="font-sans text-body font-medium text-ordift-ink">Version history</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Every publish is kept. Restoring a version puts it into the pending changes; it goes live only when you publish it.</p>
        {view.revisions.length === 0 ? <p className="mt-3 font-sans text-body-small text-ordift-ink-muted">Nothing has been published through this page yet. The card page shows the original 15 photographs.</p> : (
          <ul className="mt-3 divide-y divide-black/10">
            {view.revisions.map((r, n) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">{new Date(r.publishedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} &middot; {r.visibleCount} photographs{n === 0 && view.liveSource === "published" ? " · live now" : ""}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">By {r.byLabel}{r.note ? ` — ${r.note}` : ""}{r.restoredFrom ? " — restored from an earlier version" : ""}</p>
                </div>
                <button type="button" className={SMALL} disabled={busy} onClick={() => (view.hasDraft ? setConfirm({ kind: "restore", revisionId: r.id }) : run(() => restoreRevisionAction(r.id, view.draftRev)))}>Restore this version</button>
                {confirm?.kind === "restore" && confirm.revisionId === r.id && (
                  <div className="w-full"><ConfirmBar text="This replaces your current pending changes with that version. Continue?" action="Restore" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => run(() => restoreRevisionAction(r.id, view.draftRev), () => setConfirm(null))} /></div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" }) {
  return <span className={`rounded-full px-2 py-0.5 font-sans text-caption ${tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-black/5 text-ordift-ink-muted"}`}>{children}</span>;
}

function ItemFacts({ item }: { item: ViewItem }) {
  const facts = [item.rightsNote, item.replaces ? "Replaced an earlier photograph" : null, item.originalFilename ? `File: ${item.originalFilename}` : null].filter(Boolean);
  return facts.length ? <p className="font-sans text-caption text-ordift-ink-muted">{facts.join(" · ")}</p> : null;
}

function ConfirmBar({ text, action, busy, onCancel, onConfirm }: { text: string; action: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="alertdialog" aria-label="Confirm" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="min-w-[12rem] flex-1 font-sans text-body-small text-amber-950">{text}</p>
      <button type="button" className={OUTLINE} onClick={onCancel}>Cancel</button>
      <button type="button" className={GOLD} disabled={busy} onClick={onConfirm}>{action}</button>
    </div>
  );
}
