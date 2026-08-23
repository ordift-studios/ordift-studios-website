"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { HomepageSlideshowSlide, PortfolioProject } from "@/lib/content/types";
import { DISCIPLINE_LABEL } from "@/lib/content/portfolioHelpers";

// Immersive, curated opening statement — deliberately not built on the
// shared `Gallery`/`ResponsiveImage` components, which are grid-tile-
// oriented (uniform crops, lazy-loaded, no crossfade). This is a
// full-bleed, auto-advancing single-image stage. Slide selection/ordering
// is decided upstream (getSlideshowProjects() for /work, or a curated
// homepage source) — this component only renders whatever list it's given.
//
// Two presentation variants, both sharing every piece of slideshow
// mechanics (transition, autoplay, swipe, wrap-around, reduced-motion,
// arrows/dots) unchanged (2026-08-23):
// - "portfolio" (default, unchanged behavior) — /work's own opening
//   section: 75-85vh, each slide links to its project, discipline/title
//   overlay shown.
// - "hero" — the homepage opening experience: full 100dvh, no project
//   metadata overlay, no click-through (a plain photographic showcase,
//   not a portfolio-project card) — the surrounding page is responsible
//   for any nav/CTA layered on top of it.
//
// `slides` (2026-08-23, hero variant only) — curated landscape/portrait
// pairs from Admin. When non-empty, these take priority over `projects`
// and each slide renders BOTH its landscape and portrait image
// simultaneously, toggled by a pure CSS `orientation` media query (not a
// width breakpoint, and not JS) — so rotating a capable device switches
// images instantly with no re-render, no autoplay/index reset, and no
// dependency on which width bucket the device happens to fall into.
// `projects` remains the fallback source when `slides` is empty/absent —
// see the homepage's own page.tsx for exactly when each is used.
export type PortfolioHeroSlideshowProps = {
  projects: PortfolioProject[];
  variant?: "portfolio" | "hero";
  slides?: HomepageSlideshowSlide[];
};

const AUTOPLAY_INTERVAL_MS = 6000;
const TRANSITION_MS = 900;

// Signed shortest-path offset (in whole slides) of slide `i` relative to
// the current `index`, wrapping around the ring of `count` slides — e.g.
// the immediate next slide is always +1 (positioned off-screen right),
// the immediate previous slide is always -1 (off-screen left), regardless
// of where they sit in the underlying array. Driving each slide's
// translateX purely from this formula (recomputed every render, no
// separate "direction" state needed) is what makes Next/autoplay always
// enter from the right and Previous always enter from the left, including
// across the wrap-around from the last slide back to the first.
function ringOffset(i: number, index: number, count: number): number {
  let diff = i - index;
  if (diff > count / 2) diff -= count;
  if (diff < -count / 2) diff += count;
  return diff;
}

const SWIPE_THRESHOLD_PX = 50;

export default function PortfolioHeroSlideshow({ projects, variant = "portfolio", slides }: PortfolioHeroSlideshowProps) {
  const isHero = variant === "hero";
  const curatedSlides = isHero && slides && slides.length > 0 ? slides : null;
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const pointerDeltaX = useRef(0);
  const count = curatedSlides ? curatedSlides.length : projects.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    pauseAutoplay();
    pointerStartX.current = e.clientX;
    pointerDeltaX.current = 0;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (pointerStartX.current === null) return;
    pointerDeltaX.current = e.clientX - pointerStartX.current;
  }

  function onPointerUp() {
    if (pointerStartX.current === null) return;
    const delta = pointerDeltaX.current;
    if (delta <= -SWIPE_THRESHOLD_PX) {
      goTo(index + 1); // swiped left -> next
    } else if (delta >= SWIPE_THRESHOLD_PX) {
      goTo(index - 1); // swiped right -> previous
    }
    pointerStartX.current = null;
    pointerDeltaX.current = 0;
  }

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
      className={`relative w-full overflow-hidden bg-ordift-navy-950 touch-pan-y ${
        isHero ? "h-dvh min-h-[480px]" : "h-[75vh] min-h-[420px] sm:h-[85vh] sm:min-h-[560px]"
      }`}
      aria-roledescription="carousel"
      aria-label={isHero ? "Ordift Studios" : "Featured Portfolio work"}
      onMouseEnter={pauseAutoplay}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {Array.from({ length: count }, (_, i) => {
        const slideStyle = {
          transform: `translateX(${ringOffset(i, index, count) * 100}%)`,
          transitionDuration: `${TRANSITION_MS}ms`,
        };
        const slideClassName = "absolute inset-0 block transition-transform ease-in-out motion-reduce:transition-none";

        // Curated slide (landscape/portrait pair): both images always
        // render; a CSS orientation media query shows exactly one. No
        // metadata overlay — same clean-photograph rule as any other
        // hero-variant slide.
        if (curatedSlides) {
          const slide = curatedSlides[i];
          return (
            <div key={i} aria-hidden={i !== index} className={slideClassName} style={slideStyle}>
              {slide.landscape?.url && (
                <Image
                  src={slide.landscape.url}
                  alt={slide.landscape.alt}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  placeholder={slide.landscape.lqip ? "blur" : "empty"}
                  blurDataURL={slide.landscape.lqip ?? undefined}
                  className="object-cover hidden [@media(orientation:landscape)]:block"
                />
              )}
              {slide.portrait?.url && (
                <Image
                  src={slide.portrait.url}
                  alt={slide.portrait.alt}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  placeholder={slide.portrait.lqip ? "blur" : "empty"}
                  blurDataURL={slide.portrait.lqip ?? undefined}
                  className="object-cover hidden [@media(orientation:portrait)]:block"
                />
              )}
            </div>
          );
        }

        const project = projects[i];
        const slideContent = (
          <>
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
            {/* Homepage "hero" variant is a clean photographic showcase —
                no project metadata overlay, no darkening scrim. Any nav
                legibility treatment over the top of the photo is the
                surrounding page's responsibility (see NavBar's own
                `transparent` mode), not this component's. */}
            {!isHero && (
              <>
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
              </>
            )}
          </>
        );

        // Homepage "hero" slides are a clean photographic showcase with no
        // project-specific click-through — a plain, non-interactive div,
        // not a Link (there's no visible affordance suggesting it's
        // clickable once the metadata/CTA overlay is gone).
        if (isHero) {
          return (
            <div key={project.id} aria-hidden={i !== index} className={slideClassName} style={slideStyle}>
              {slideContent}
            </div>
          );
        }

        return (
          <Link
            key={project.id}
            href={`/work/${project.slug}`}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
            className={slideClassName}
            style={{ ...slideStyle, pointerEvents: i === index ? "auto" : "none" }}
          >
            {slideContent}
          </Link>
        );
      })}

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
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={curatedSlides ? `Go to slide ${i + 1}` : `Go to slide ${i + 1}: ${projects[i].title}`}
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
