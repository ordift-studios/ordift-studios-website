"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { BeforeAfterPair } from "@/lib/content/types";

// Graphic Design's Before & After comparison (2026-08-24) — a
// dependency-free drag slider, reusing the Pointer Events pattern
// established by FocalPointEditor.tsx (unified mouse/touch handling,
// no separate listeners). Unlike a standalone artwork image, a
// before/after pair inherently shows the same framing at two points in
// time, so both sides deliberately share one object-cover container
// sized to the "before" image's own real aspect ratio — this is the one
// place in the Graphic Design case study where object-cover is correct.
const MIN_RATIO = 0.6;
const MAX_RATIO = 2.2;
const FALLBACK_RATIO = 4 / 5;

function clampedRatio(image: BeforeAfterPair["before"]): number {
  if (!image.width || !image.height) return FALLBACK_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height));
}

export type BeforeAfterSliderProps = {
  pair: BeforeAfterPair;
  quality?: number;
};

export default function BeforeAfterSlider({ pair, quality }: BeforeAfterSliderProps) {
  const [percent, setPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!pair.before.url || !pair.after.url) return null;
  const ratio = clampedRatio(pair.before);

  function updateFromClientX(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPercent(Math.min(100, Math.max(0, pct)));
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  }
  function handlePointerUp() {
    setDragging(false);
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setPercent((p) => Math.max(0, p - 5));
    else if (e.key === "ArrowRight") setPercent((p) => Math.min(100, p + 5));
    else if (e.key === "Home") setPercent(0);
    else if (e.key === "End") setPercent(100);
    else return;
    e.preventDefault();
  }

  return (
    <figure>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg bg-black/5 touch-none select-none cursor-ew-resize"
        style={{ aspectRatio: ratio }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Image
          src={pair.after.url}
          alt={pair.after.alt}
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          quality={quality}
          className="object-cover pointer-events-none"
        />
        <div
          className={`absolute inset-0 overflow-hidden pointer-events-none ${dragging ? "" : "transition-[clip-path] duration-150"}`}
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
        >
          <Image
            src={pair.before.url}
            alt={pair.before.alt}
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            quality={quality}
            className="object-cover"
          />
        </div>

        <span className="absolute top-3 left-3 font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] pointer-events-none">
          Before
        </span>
        <span className="absolute top-3 right-3 font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] pointer-events-none">
          After
        </span>

        <div
          className={`absolute inset-y-0 w-px bg-white/90 pointer-events-none ${dragging ? "" : "transition-[left] duration-150"}`}
          style={{ left: `${percent}%` }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Reveal more of the before or after image"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          onKeyDown={handleKeyDown}
          className={`absolute top-1/2 w-9 h-9 -mt-[18px] -ml-[18px] rounded-full bg-white shadow-md flex items-center justify-center cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold ${dragging ? "" : "transition-[left] duration-150"}`}
          style={{ left: `${percent}%` }}
        >
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
            <path d="M4 1L1 5L4 9M10 1L13 5L10 9" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {pair.caption && (
        <figcaption className="mt-2 font-sans text-caption text-ordift-ink-muted text-center">{pair.caption}</figcaption>
      )}
    </figure>
  );
}
