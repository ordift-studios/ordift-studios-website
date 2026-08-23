"use client";

import { useState } from "react";
import Image from "next/image";
import MediaAsset from "@/components/media/MediaAsset";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import type { MediaAsset as MediaAssetType, PresentationImage } from "@/lib/content/types";

// Videography's poster-then-play film experience (2026-08-23). Never
// autoplays on mount — the poster is a plain image until the visitor
// clicks Play, at which point MediaAsset itself mounts for the first
// time (lazy by construction, not by a loading prop) and receives
// autoPlay — a real user gesture, not page-load autoplay. Reuses
// MediaAsset unchanged for the actual playback (native <video> or
// embed <iframe>), so this component only owns the poster/reveal state.
//
// Aspect ratio comes from the POSTER's own real dimensions, clamped to
// [0.5625, 2.76] (9:16 vertical through an ultra-wide cinematic ceiling)
// — MediaAsset video/embed assets carry no dimension metadata of their
// own (Sanity has none to give), and requiring admins to declare a
// separate orientation value would be new schema for something the
// deliberately-chosen poster already answers correctly in virtually
// every real case: an admin picking a poster for a vertical Reel picks
// a vertical image, and vice versa.
const MIN_RATIO = 0.5625;
const MAX_RATIO = 2.76;

export function clampedPosterRatio(poster: PresentationImage | null): number {
  if (!poster?.width || !poster?.height) return 16 / 9;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, poster.width / poster.height));
}

export default function VideoPlayer({
  media,
  poster,
  playLabel = "Play Film",
  priority = false,
}: {
  media: MediaAssetType;
  poster: PresentationImage | null;
  playLabel?: string;
  priority?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const ratio = clampedPosterRatio(poster);

  if (playing) {
    return (
      <div className="relative w-full" style={{ aspectRatio: ratio }}>
        <MediaAsset media={media} aspectRatio={String(ratio)} sizes="100vw" autoPlay />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={playLabel}
      className="group relative block w-full overflow-hidden cursor-pointer"
      style={{ aspectRatio: ratio }}
    >
      {poster?.url ? (
        <Image
          src={poster.url}
          alt={poster.alt || ""}
          fill
          priority={priority}
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: `${poster.focalX}% ${poster.focalY}%` }}
        />
      ) : (
        <MediaPlaceholder alt={media.alt} tone="dark" aspectRatio="auto" className="absolute inset-0" />
      )}
      {/* Literal rgba() throughout, never a Tailwind opacity-modifier or
          var()-backed color combined with a transition — see the
          root-caused rendering bug documented earlier this session
          (NavBar's transparent-header work). */}
      <div className="absolute inset-0 bg-[rgba(10,14,24,0.25)] transition-colors duration-300 group-hover:bg-[rgba(10,14,24,0.4)] motion-reduce:transition-none" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-center gap-3 rounded-full bg-[rgba(10,14,24,0.55)] px-6 py-3 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
            <path d="M0 0.5L13.5 8L0 15.5V0.5Z" fill="var(--color-gold)" />
          </svg>
          <span className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white">{playLabel}</span>
        </span>
      </div>
    </button>
  );
}
