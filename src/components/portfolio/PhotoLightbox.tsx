"use client";

import { useEffect, useRef, useState } from "react";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import type { GalleryImage } from "@/lib/content/types";

// Full-screen gallery viewer (2026-08-23, Photography detail redesign) —
// the first lightbox in this codebase; nothing existed to reuse (see
// investigation before this feature). Deliberately hand-rolled with
// Pointer Events for swipe, matching the same no-library approach
// PortfolioHeroSlideshow already established for its own drag/swipe,
// rather than introducing a new dependency for this one component.
//
// Caption is shown only when `image.caption` is genuinely set in the
// CMS — never invented. Focus is trapped within the dialog and restored
// to whatever triggered it on close, per WAI-ARIA dialog pattern.
export default function PhotoLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: GalleryImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  const dragState = useRef<{ startX: number; active: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const image = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  function goPrev() {
    if (hasPrev) setIndex((i) => i - 1);
  }
  function goNext() {
    if (hasNext) setIndex((i) => i + 1);
  }

  // Body scroll lock + focus management, mirroring the standard modal
  // dialog pattern: remember what had focus, move focus into the
  // dialog, restore on unmount.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  // Keyboard: Escape closes, arrows navigate, Tab is trapped within the
  // dialog's own focusable elements.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        goNext();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPrev, hasNext, onClose]);

  function handlePointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, active: true };
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current?.active) return;
    setDragOffset(e.clientX - dragState.current.startX);
  }
  function handlePointerUp() {
    if (!dragState.current?.active) return;
    const SWIPE_THRESHOLD = 60;
    if (dragOffset > SWIPE_THRESHOLD) goPrev();
    else if (dragOffset < -SWIPE_THRESHOLD) goNext();
    dragState.current = null;
    setDragOffset(0);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${image.alt || "Photograph"} — image ${index + 1} of ${images.length}`}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col motion-reduce:transition-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 py-4">
        <p className="font-sans text-caption text-white/60">
          {index + 1} / {images.length}
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            &times;
          </span>
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4 sm:px-14 pb-4 sm:pb-6 overflow-hidden touch-none select-none">
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photograph"
            className="hidden sm:flex absolute left-2 lg:left-4 top-1/2 -translate-y-1/2 min-h-11 min-w-11 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 z-10"
          >
            <span aria-hidden="true" className="text-3xl leading-none">
              &larr;
            </span>
          </button>
        )}

        <div
          className="max-w-full transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
        >
          <ResponsiveImage
            key={image.id}
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            lqip={image.lqip}
            objectFit="contain"
            priority
            sizes="92vw"
            // aspect-ratio alone (as ResponsiveImage's wrapper sets by
            // default) needs at least one definite dimension to derive
            // the other — with only max-width/max-height as caps and
            // no intrinsic content (the actual <img> is `fill`, i.e.
            // position:absolute, so it contributes no size of its own),
            // the wrapper collapsed to 0×0 (confirmed live). Anchoring
            // on an explicit height and letting width derive from
            // aspect-ratio, capped by max-width for wide images, gives
            // the browser a definite dimension to start from.
            style={{ height: "78vh", maxWidth: "92vw" }}
          />
        </div>

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photograph"
            className="hidden sm:flex absolute right-2 lg:right-4 top-1/2 -translate-y-1/2 min-h-11 min-w-11 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 z-10"
          >
            <span aria-hidden="true" className="text-3xl leading-none">
              &rarr;
            </span>
          </button>
        )}
      </div>

      {/* Mobile-only prev/next — swipe is primary on touch, but a visible
          tap target still matters for reachability/accessibility. */}
      <div className="flex sm:hidden items-center justify-between px-6 pb-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Previous photograph"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white/70 disabled:opacity-30"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            &larr;
          </span>
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!hasNext}
          aria-label="Next photograph"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-white/70 disabled:opacity-30"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            &rarr;
          </span>
        </button>
      </div>

      {image.caption && (
        <p className="text-center font-sans text-caption text-white/60 px-6 pb-6 -mt-2">{image.caption}</p>
      )}
    </div>
  );
}
