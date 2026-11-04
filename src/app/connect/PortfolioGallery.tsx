"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Photo, { fitStyle } from "./Photo";
import { acquireScrollLock, releaseScrollLock } from "./scrollLock";
import { splitColumns, type ConnectImage } from "./gallery";

const THUMB_SIZES = "(max-width: 480px) 46vw, (max-width: 1023px) 30vw, 300px";
const VIEWER_SIZES = "(max-width: 896px) 100vw, 896px";

// Columns for the full-screen gallery: two on a phone, three on larger screens.
const WIDE_QUERY = "(min-width: 768px)";
function useColumnCount(): number {
  return useSyncExternalStore(
    (notify) => {
      const mq = typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;
      mq?.addEventListener?.("change", notify);
      return () => mq?.removeEventListener?.("change", notify);
    },
    () => (typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches ? 3 : 2),
    () => 2,
  );
}

// Owns a native <dialog> through a boolean: `open` true shows it (modal), false closes it, and the page's scroll lock is held for exactly as long as it is open.
//
// React state is the single source of truth. Every in-app way of closing (the Close button, a tap on the backdrop) calls `onClose` and the dialog follows the state straight away. The browser's own
// close signals are handled so they cannot disagree with it: Esc and the Android back gesture raise a synchronous `cancel` event, which is turned into the same `onClose`; and the later,
// asynchronous `close` event (which can arrive well after the dialog was closed, even after it was opened again) is ignored if the dialog is open by then. Without this, a photograph tapped
// shortly after another was closed could be lost. Native dialogs also keep keyboard focus inside while open and return it to the button that opened them.
function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const held = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const release = () => { if (held.current) { held.current = false; releaseScrollLock(); } };

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onCancel = (e: Event) => { e.preventDefault(); onCloseRef.current(); };           // Esc / back gesture: let state close it
    const onNativeClose = () => { if (dlg.open) return; release(); onCloseRef.current(); };  // a late `close` event: only act if it is really closed
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("close", onNativeClose);
    return () => { dlg.removeEventListener("cancel", onCancel); dlg.removeEventListener("close", onNativeClose); release(); };
  }, []);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      if (!held.current) { held.current = true; acquireScrollLock(); }
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
      release();
    }
  }, [open]);

  return ref;
}

// All the photographs in level columns, each at its own proportions, loaded as they scroll into view. Pure (no state, no browser APIs), so it renders on the server too.
export function GalleryGrid({ images, columns = 2, onOpen }: { images: ConnectImage[]; columns?: number; onOpen?: (index: number) => void }) {
  const n = images.length;
  const cols = splitColumns(images.map((img, i) => ({ img, i, width: img.width, height: img.height })), columns);
  return (
    <div className="grid items-start gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cols.map((col, c) => (
        <ul key={c} className="grid gap-2">
          {col.map(({ img, i }) => (
            <li key={img.id}>
              <button type="button" onClick={() => onOpen?.(i)} aria-haspopup="dialog" aria-label={`Enlarge photograph ${i + 1} of ${n}: ${img.alt}`} className="block w-full overflow-hidden rounded-md">
                <Photo img={img} sizes={THUMB_SIZES} className="block h-auto w-full" />
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// One photograph enlarged, on top of the gallery. Previous / next, the close button, a tap on the dark area and the keyboard (arrows, Esc) all work.
// Unlike the thumbnails it is NOT lazy-loaded, and its box is sized from the photograph's proportions before the file arrives: a lazy image with no size can wait indefinitely before it
// starts downloading, which is what made this view unreliable on some phones. It is only in the page while the viewer is open, so loading it eagerly costs nothing extra.
function PhotoViewer({ images, index, onIndexChange, onClose }: { images: ConnectImage[]; index: number | null; onIndexChange: (i: number) => void; onClose: () => void }) {
  const n = images.length;
  const ref = useModalDialog(index !== null, onClose);
  const step = useCallback((d: number) => onIndexChange(((index ?? 0) + d + n) % n), [index, n, onIndexChange]);
  const img = index !== null ? images[index] : null;
  return (
    <dialog
      ref={ref}
      aria-label="Photograph"
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      onKeyDown={(e) => { if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); }}
      className="m-0 h-svh max-h-none w-screen max-w-none border-0 bg-ordift-navy-950/95 p-0 text-white backdrop:bg-ordift-navy-950"
    >
      {img && (
        <div className="relative flex h-full w-full items-center justify-center p-3">
          <div className="flex max-h-full w-full max-w-4xl justify-center">
            <Photo key={img.id} img={img} sizes={VIEWER_SIZES} eager style={fitStyle(img, "85svh")} className="block max-w-full" />
          </div>
          <p className="absolute left-4 top-4 font-sans text-xs tabular-nums tracking-[0.08em] text-white/70" aria-live="polite">{(index ?? 0) + 1} / {n}</p>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-2 px-4 py-2 text-3xl leading-none text-white">×</button>
          {n > 1 && (
            <>
              <button type="button" aria-label="Previous photograph" onClick={() => step(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/90">‹</button>
              <button type="button" aria-label="Next photograph" onClick={() => step(1)} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/90">›</button>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

// The full-screen gallery behind "View All": every photograph, a clear Close button that returns to the landing page, and tap-to-enlarge. Its contents exist only while it is open, so none of
// the thumbnails are downloaded until a visitor asks for them.
export default function PortfolioGallery({ images, open, onClose }: { images: ConnectImage[]; open: boolean; onClose: () => void }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const columns = useColumnCount();
  const closeViewer = useCallback(() => setViewer(null), []);
  const handleClose = useCallback(() => { setViewer(null); onClose(); }, [onClose]);
  const ref = useModalDialog(open, handleClose);

  return (
    <dialog ref={ref} aria-label="Portfolio gallery" className="m-0 h-svh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-ordift-navy-950 p-0 text-white backdrop:bg-ordift-navy-950">
      {open && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between bg-ordift-navy-950/95 px-4 py-3 backdrop-blur">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Portfolio</h2>
            <button type="button" onClick={handleClose} aria-label="Close portfolio gallery" className="flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 font-sans text-sm font-semibold text-white transition-colors hover:border-ordift-gold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
              Close
            </button>
          </div>
          <div className="mx-auto max-w-5xl px-3 pb-10 pt-1">
            <GalleryGrid images={images} columns={columns} onOpen={setViewer} />
          </div>
          <PhotoViewer images={images} index={viewer} onIndexChange={setViewer} onClose={closeViewer} />
        </>
      )}
    </dialog>
  );
}
