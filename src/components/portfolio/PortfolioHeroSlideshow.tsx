"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PortfolioProject } from "@/lib/content/types";
import { DISCIPLINE_LABEL } from "@/lib/content/portfolioHelpers";

// Immersive, curated opening statement for the Portfolio landing page —
// deliberately not built on the shared `Gallery`/`ResponsiveImage`
// components, which are grid-tile-oriented (uniform crops, lazy-loaded,
// no crossfade). This is a full-bleed, auto-advancing single-image stage.
// Slide selection/ordering is decided upstream by getSlideshowProjects()
// (portfolioHelpers.ts) — this component only renders whatever list it's
// given, so it stays reusable if the curation logic changes later.
export type PortfolioHeroSlideshowProps = {
  projects: PortfolioProject[];
};

const AUTOPLAY_INTERVAL_MS = 6000;
const TRANSITION_MS = 900;

export default function PortfolioHeroSlideshow({ projects }: PortfolioHeroSlideshowProps) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = projects.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    // Respect prefers-reduced-motion — a slideshow that keeps moving
    // regardless of this signal is exactly the kind of motion the media
    // query exists to let people opt out of.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count]);

  function pauseAutoplay() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  if (count === 0) return null;

  return (
    <section
      className="relative w-full h-[75vh] min-h-[420px] sm:h-[85vh] sm:min-h-[560px] overflow-hidden bg-ordift-navy-950"
      aria-roledescription="carousel"
      aria-label="Featured Portfolio work"
      onMouseEnter={pauseAutoplay}
    >
      {projects.map((project, i) => (
        <Link
          key={project.id}
          href={`/work/${project.slug}`}
          aria-hidden={i !== index}
          tabIndex={i === index ? 0 : -1}
          className="absolute inset-0 block transition-opacity ease-in-out"
          style={{
            opacity: i === index ? 1 : 0,
            transitionDuration: `${TRANSITION_MS}ms`,
            pointerEvents: i === index ? "auto" : "none",
          }}
        >
          <Image
            src={project.heroMedia.url!}
            alt={project.heroMedia.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            placeholder={project.heroMedia.lqip ? "blur" : "empty"}
            blurDataURL={project.heroMedia.lqip ?? undefined}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ordift-navy-950/70 via-ordift-navy-950/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 pb-10 sm:pb-14">
            <div className="max-w-6xl mx-auto">
              {project.disciplines[0] && (
                <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-2">
                  {DISCIPLINE_LABEL[project.disciplines[0]]}
                </p>
              )}
              <p className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-white max-w-2xl">
                {project.title}
              </p>
            </div>
          </div>
        </Link>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={(e) => {
              e.preventDefault();
              pauseAutoplay();
              goTo(index - 1);
            }}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={(e) => {
              e.preventDefault();
              pauseAutoplay();
              goTo(index + 1);
            }}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>

          <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {projects.map((project, i) => (
              <button
                key={project.id}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${project.title}`}
                aria-current={i === index}
                onClick={(e) => {
                  e.preventDefault();
                  pauseAutoplay();
                  goTo(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-ordift-gold" : "w-1.5 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
