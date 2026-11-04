"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import Photo, { fitStyle } from "./Photo";
import PortfolioGallery from "./PortfolioGallery";
import { usePortfolio } from "./PortfolioProvider";
import type { ConnectImage } from "./gallery";
import { FADE_MS, SLIDE_INTERVAL_MS, initialSlides, neighbours, shouldAutoplay, slidesReducer, type Layer } from "./slideshowModel";

const STAGE_SIZES = "(max-width: 480px) 100vw, 424px";
const ROUND_BUTTON = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-ordift-navy-950/70 text-white transition-colors hover:border-ordift-gold hover:bg-ordift-navy-950/90";
const SECONDARY_BUTTON = "flex min-h-14 w-full items-center justify-center rounded-lg border border-white/25 px-5 font-sans text-base font-semibold text-white transition-colors hover:border-ordift-gold hover:bg-ordift-gold/10";
const SVG = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "h-5 w-5" } as const;

// Whether the visitor has asked their device for reduced motion. Re-read if the setting changes while the page is open.
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_QUERY) : null;
      mq?.addEventListener?.("change", notify);
      return () => mq?.removeEventListener?.("change", notify);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_QUERY).matches : false),
    () => false,
  );
}

function usePageHidden(): boolean {
  return useSyncExternalStore(
    (notify) => { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); },
    () => document.hidden,
    () => false,
  );
}

// One photograph on the stage. A new layer starts transparent and fades in on the next frames; a leaving layer fades out. Both are instant when reduced motion is requested.
function StageLayer({ layer, img }: { layer: Layer; img: ConnectImage }) {
  const [shown, setShown] = useState(!layer.entering);
  useEffect(() => {
    if (shown) return;
    // Two animation frames, so the browser has painted the transparent start; a short timer is a backstop in case frames are throttled, so a new photograph can never stay invisible.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)); });
    const backstop = setTimeout(() => setShown(true), 80);
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(backstop); };
  }, [shown]);
  const visible = shown && !layer.leaving;
  return (
    <div aria-hidden={layer.leaving || undefined} data-layer={layer.index} style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }} className="absolute inset-0 flex items-center justify-center transition-opacity ease-in-out motion-reduce:transition-none">
      <Photo img={img} sizes={STAGE_SIZES} eager style={fitStyle(img, "var(--stage-h)")} className="block" />
    </div>
  );
}

// The portfolio slideshow: one large photograph at a time, advancing every 3 seconds with a soft cross-fade, Previous / Next arrows, a Pause / Play control, and a "View All" button that opens
// the full-screen gallery. It shows only after View Portfolio is tapped.
//
// It holds still (see shouldAutoplay) while the visitor is interacting with it, while the page is hidden, while the full gallery is open, and always when reduced motion is requested (then it
// only moves when asked, there is nothing to pause, and photographs change without a fade).
export default function PortfolioSlideshow() {
  const { images, revealed, token } = usePortfolio();
  return revealed ? <Slideshow images={images} token={token} /> : null;
}

function Slideshow({ images, token }: { images: ConnectImage[]; token: number }) {
  const count = images.length;
  const [state, dispatch] = useReducer(slidesReducer, undefined, initialSlides);
  const reduced = useReducedMotion();
  const pageHidden = usePageHidden();
  const [playing, setPlaying] = useState(() => !(typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches));
  const [pressed, setPressed] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reducedRef = useRef(reduced);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);

  // Each View Portfolio tap (including the first): bring the slideshow into view and (re)start it.
  useEffect(() => {
    sectionRef.current?.scrollIntoView?.({ behavior: reducedRef.current ? "auto" : "smooth", block: "start" });
    headingRef.current?.focus({ preventScroll: true });
    setPlaying(!reducedRef.current);
  }, [token]);

  // Advance every 3 seconds from the moment the current photograph appeared. Any change (a new photograph, a pause, an interaction, the page coming back) restarts the 3 seconds.
  const autoplay = shouldAutoplay({ playing, reducedMotion: reduced, pressed, keyboardFocus, pageHidden, galleryOpen, count });
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => dispatch({ type: "step", delta: 1, count }), SLIDE_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [autoplay, state.index, count]);

  // Remove faded-out layers once the cross-fade is over.
  const hasLeaving = state.layers.some((l) => l.leaving);
  useEffect(() => {
    if (!hasLeaving) return;
    const id = setTimeout(() => dispatch({ type: "prune" }), FADE_MS + 60);
    return () => clearTimeout(id);
  }, [hasLeaving, state.nextKey]);

  const step = (delta: number) => dispatch({ type: "step", delta, count });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };
  const onFocus = (e: React.FocusEvent) => {
    try { setKeyboardFocus(e.target.matches(":focus-visible")); } catch { setKeyboardFocus(false); }
  };

  const stageStyle = { "--stage-h": "min(68svh, 32rem)" } as CSSProperties;

  return (
    <section ref={sectionRef} id="portfolio" aria-labelledby="connect-portfolio-title" className="mt-10 scroll-mt-4" style={stageStyle}>
      <h2 id="connect-portfolio-title" ref={headingRef} tabIndex={-1} className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-white/60 outline-none">Portfolio</h2>

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Portfolio slideshow"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setKeyboardFocus(false)}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        <div className="relative overflow-hidden rounded-lg bg-ordift-navy-900" style={{ height: "var(--stage-h)" }}>
          <div role="group" aria-roledescription="slide" aria-label={`${state.index + 1} of ${count}`} aria-live={autoplay ? "off" : "polite"} className="absolute inset-0">
            {state.layers.map((layer) => <StageLayer key={layer.key} layer={layer} img={images[layer.index]} />)}
          </div>
          <button type="button" aria-label="Show previous photograph" onClick={() => step(-1)} className={`${ROUND_BUTTON} left-2`}>
            <svg {...SVG}><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button type="button" aria-label="Show next photograph" onClick={() => step(1)} className={`${ROUND_BUTTON} right-2`}>
            <svg {...SVG}><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="font-sans text-xs tabular-nums tracking-[0.08em] text-white/70" aria-hidden="true">{state.index + 1} / {count}</p>
          {!reduced && (
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"} className="flex h-11 items-center gap-2 rounded-full px-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-white/80 transition-colors hover:text-white">
              <svg {...SVG}>{playing ? <path d="M9 5v14M15 5v14" /> : <path d="m8 5 11 7-11 7z" />}</svg>
              {playing ? "Pause" : "Play"}
            </button>
          )}
        </div>

        {/* The photographs on either side, fetched ahead of time so Next and Previous (and the automatic advance) never wait for a download. */}
        <div aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
          {neighbours(state.index, count).map((i) => <Photo key={i} img={images[i]} sizes={STAGE_SIZES} eager />)}
        </div>
      </div>

      <button type="button" onClick={() => setGalleryOpen(true)} aria-haspopup="dialog" className={`${SECONDARY_BUTTON} mt-3`}>
        View All
      </button>

      <PortfolioGallery images={images} open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </section>
  );
}
