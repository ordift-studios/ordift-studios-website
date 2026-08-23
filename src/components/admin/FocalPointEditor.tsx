"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Image Repositioning / focal-point control (2026-08-23) — reusable
// drag-to-reposition editor shared by the Work Landing Images and
// Portfolio Cover/Index Image pickers. Same interaction model as a
// profile cover-photo repositioner: the crop frame stays fixed and the
// photograph moves behind it (pointer/touch drag, unified via Pointer
// Events — no separate mouse/touch handling needed). What you see while
// dragging is pixel-identical to the live public crop for the given
// previewAspectRatio, so there's no separate "preview" step.
//
// Stores only a focal point (0–100, 0–100) — see FocalPointEditor's
// callers for how that maps to Sanity's native image hotspot. Never
// touches the original uploaded asset; this is presentation-only data.
//
// Callers must pass a `key` that changes when the underlying image
// changes (e.g. `key={pending.assetId}`) — that remounts this component
// with fresh state instead of needing an effect to re-sync internal
// position to new initial props, which keeps every position update a
// plain derived calculation (no setState-in-effect).
export default function FocalPointEditor({
  imageUrl,
  previewAspectRatio,
  initialFocalX = 50,
  initialFocalY = 50,
  onChange,
}: {
  imageUrl: string;
  previewAspectRatio: number; // width / height
  initialFocalX?: number;
  initialFocalY?: number;
  onChange: (focalX: number, focalY: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [focal, setFocal] = useState({ x: initialFocalX, y: initialFocalY });
  // Non-null only mid-drag — an explicit pixel-position override so a
  // drag feels immediate; committed back into `focal` (and cleared) on
  // release, so `pos` is otherwise always a plain derived value.
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Track the frame's real rendered pixel size (it's responsive —
  // width: 100% up to a max-width) so the drag-bounds math stays
  // correct at any viewport width, including a resize/rotation on
  // iPad. Setting state from a ResizeObserver callback (not the effect
  // body itself) is the correct "subscribe to an external system"
  // pattern, not a derived-state effect.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setFrameSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
  }

  const renderedSize = (() => {
    if (!naturalSize || frameSize.width === 0 || frameSize.height === 0) return null;
    const naturalRatio = naturalSize.width / naturalSize.height;
    const frameRatio = frameSize.width / frameSize.height;
    if (naturalRatio > frameRatio) {
      const height = frameSize.height;
      return { width: height * naturalRatio, height };
    }
    const width = frameSize.width;
    return { width, height: width / naturalRatio };
  })();

  function focalToPos(focalX: number, focalY: number, rendered: { width: number; height: number }) {
    const maxLeftOffset = rendered.width - frameSize.width;
    const maxTopOffset = rendered.height - frameSize.height;
    return {
      left: maxLeftOffset > 0 ? -(focalX / 100) * maxLeftOffset : 0,
      top: maxTopOffset > 0 ? -(focalY / 100) * maxTopOffset : 0,
    };
  }

  function posToFocal(left: number, top: number, rendered: { width: number; height: number }) {
    const maxLeftOffset = rendered.width - frameSize.width;
    const maxTopOffset = rendered.height - frameSize.height;
    return {
      focalX: maxLeftOffset > 0 ? clamp((-left / maxLeftOffset) * 100, 0, 100) : 50,
      focalY: maxTopOffset > 0 ? clamp((-top / maxTopOffset) * 100, 0, 100) : 50,
    };
  }

  // Plain derived value, recomputed every render — never stored, so
  // there's nothing to keep in sync via an effect.
  const pos = dragPos ?? (renderedSize ? focalToPos(focal.x, focal.y, renderedSize) : { left: 0, top: 0 });

  function handlePointerDown(e: React.PointerEvent) {
    if (!renderedSize) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top };
    setDragPos(pos);
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current || !renderedSize) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const maxLeftOffset = renderedSize.width - frameSize.width;
    const maxTopOffset = renderedSize.height - frameSize.height;
    const nextLeft = clamp(dragState.current.startLeft + dx, -maxLeftOffset, 0);
    const nextTop = clamp(dragState.current.startTop + dy, -maxTopOffset, 0);
    setDragPos({ left: nextLeft, top: nextTop });
  }

  function handlePointerUp() {
    if (!dragState.current || !renderedSize) {
      dragState.current = null;
      setDragging(false);
      return;
    }
    dragState.current = null;
    setDragging(false);
    const finalPos = dragPos ?? pos;
    const { focalX, focalY } = posToFocal(finalPos.left, finalPos.top, renderedSize);
    const roundedX = Math.round(focalX);
    const roundedY = Math.round(focalY);
    setFocal({ x: roundedX, y: roundedY });
    setDragPos(null);
    onChange(roundedX, roundedY);
  }

  function handleReset() {
    setFocal({ x: 50, y: 50 });
    setDragPos(null);
    onChange(50, 50);
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        className="relative w-full max-w-[420px] overflow-hidden rounded-lg border-2 border-ordift-gold bg-black/5 touch-none select-none"
        style={{ aspectRatio: previewAspectRatio }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel-level drag positioning needs direct control incompatible with next/image's fill/object-fit model */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
          }}
          className={`absolute max-w-none ${dragging ? "" : "transition-[left,top] duration-150"}`}
          style={
            renderedSize
              ? { width: renderedSize.width, height: renderedSize.height, left: pos.left, top: pos.top, cursor: dragging ? "grabbing" : "grab" }
              : { opacity: 0, width: "100%", height: "100%" }
          }
        />
      </div>
      <div className="flex items-center gap-3">
        <p className="font-sans text-caption text-ordift-ink-muted">Drag the photo to reposition.</p>
        <button type="button" onClick={handleReset} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
          Reset Position
        </button>
      </div>
    </div>
  );
}
