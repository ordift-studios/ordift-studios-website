"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fileUrl, splitColumns, srcSet, type ConnectImage } from "./gallery";

// Keeps the page behind a full-screen viewer from scrolling.
const lockScroll = (on: boolean) => { document.documentElement.style.overflow = on ? "hidden" : ""; };

// One photograph, served as AVIF with a WebP fallback at several widths so each phone downloads only what it needs. width/height reserve the exact space (no layout shift, no cropping),
// and the photograph's average colour shows until it has loaded. Loading is lazy, and the enlarged copy exists only while the viewer is open, so nothing extra is downloaded or sent in the page for it. These are already-optimised static files, so the plain <picture> element is used instead of next/image.
function Photo({ img, sizes, className }: { img: ConnectImage; sizes: string; className: string }) {
  const fallbackWidth = img.widths[Math.min(1, img.widths.length - 1)];
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(img, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(img, "webp")} sizes={sizes} />
      <img src={fileUrl(img, fallbackWidth, "webp")} alt={img.alt} width={img.width} height={img.height} loading="lazy" decoding="async" style={{ backgroundColor: img.color }} className={className} />
    </picture>
  );
}

// The photograph grid: two level columns, each photograph at its own proportions, lazily loaded. Tapping one opens it larger; previous/next, the close button, a tap on the dark area
// and the keyboard (arrows, Esc) all work. No captions: the alternative text carries the description for screen readers.
export default function ConnectGallery({ images }: { images: ConnectImage[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(false);          // the enlarged photograph is only put on the page while the viewer is open
  const n = images.length;
  const step = useCallback((d: number) => setIndex((i) => (i + d + n) % n), [n]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); };
    const unlock = () => { lockScroll(false); setOpened(false); };
    dlg.addEventListener("keydown", onKey);
    dlg.addEventListener("close", unlock);
    return () => { dlg.removeEventListener("keydown", onKey); dlg.removeEventListener("close", unlock); unlock(); };
  }, [step]);

  if (n === 0) return null;
  const current = images[index];
  const open = (i: number) => { setIndex(i); setOpened(true); lockScroll(true); ref.current?.showModal(); };
  const columns = splitColumns(images.map((img, i) => ({ img, i, width: img.width, height: img.height })));

  return (
    <>
      <div className="grid grid-cols-2 items-start gap-2">
        {columns.map((col, c) => (
          <ul key={c} className="grid gap-2">
            {col.map(({ img, i }) => (
              <li key={img.id}>
                <button type="button" onClick={() => open(i)} aria-haspopup="dialog" aria-label={`Enlarge photograph ${i + 1} of ${n}: ${img.alt}`} className="block w-full overflow-hidden rounded-md">
                  <Photo img={img} sizes="(max-width: 480px) 46vw, 220px" className="block h-auto w-full" />
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>

      <dialog
        ref={ref}
        aria-label="Photograph"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-0 h-svh max-h-none w-screen max-w-none border-0 bg-ordift-navy-950/95 p-0 text-white backdrop:bg-ordift-navy-950"
      >
        <div className="relative flex h-full w-full items-center justify-center p-3">
          <div className="flex max-h-full w-full max-w-4xl justify-center">
            {opened && <Photo key={current.id} img={current} sizes="(max-width: 896px) 100vw, 896px" className="block h-auto max-h-[85svh] w-auto max-w-full object-contain" />}
          </div>
          <p className="absolute left-4 top-4 font-sans text-xs tabular-nums tracking-[0.08em] text-white/70" aria-live="polite">{index + 1} / {n}</p>
          <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="absolute right-2 top-2 px-4 py-2 text-3xl leading-none text-white">×</button>
          {n > 1 && (
            <>
              <button type="button" aria-label="Previous photograph" onClick={() => step(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/90">‹</button>
              <button type="button" aria-label="Next photograph" onClick={() => step(1)} className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-6 text-3xl text-white/90">›</button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
