"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PublicTeamMember } from "@/lib/team/types";

// Meet the Team's center-focus carousel (2026-08-24) — a horizontal
// scroll-snap row (same native-scroll base as VideographyReels.tsx: a
// genuine touch swipe on mobile, a natural drag/scroll on desktop, no
// separate responsive logic) with continuous, scroll-position-driven
// scaling layered on top: each portrait's size/opacity is a plain
// function of its own distance from the container's horizontal center,
// recomputed on every scroll frame via direct style mutation (not React
// state per item, to stay smooth at 60fps) — so the "enlarge as it
// approaches, shrink as it leaves" motion the brief asks for is a
// continuous scrub, not a discrete before/after snap.
//
// A slow ambient auto-scroll (matching the auto-advancing motion
// language already established by the homepage hero slideshow) runs
// while nothing is hovered/focused/touched, and stops the moment it is
// — "temporarily pause... movement so the visitor can comfortably
// select them" — resuming gracefully once hover/focus leaves without a
// selection. Both the scaling animation and the ambient auto-scroll are
// skipped entirely under prefers-reduced-motion; scroll/swipe/keyboard
// navigation and click-to-open still work exactly the same.
const MAX_SCALE = 1.32;
const MIN_SCALE = 0.74;
const MAX_OPACITY = 1;
const MIN_OPACITY = 0.55;
const DISTANCE_FACTOR = 1.7; // in item-widths, before an item is fully shrunk
const AUTO_SCROLL_PX_PER_SEC = 22;

export default function MeetTheTeamCarousel({
  members,
  onSelect,
}: {
  members: PublicTeamMember[];
  onSelect: (member: PublicTeamMember) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeId, setActiveId] = useState<string | null>(members[0]?.id ?? null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const applyScales = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const containerRect = track.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    let closestId: string | null = null;
    let closestDistance = Infinity;

    itemRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const distance = Math.abs(itemCenter - containerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = id;
      }
      if (!reducedMotion) {
        const normalized = Math.max(0, 1 - distance / (rect.width * DISTANCE_FACTOR));
        const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * normalized;
        const opacity = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * normalized;
        el.style.transform = `scale(${scale})`;
        el.style.opacity = String(opacity);
      }
    });

    setActiveId((prev) => (prev === closestId ? prev : closestId));
  }, [reducedMotion]);

  // Scroll-driven recompute, rAF-throttled.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        applyScales();
        ticking = false;
      });
    }
    applyScales();
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [applyScales]);

  // Ambient auto-scroll — plain rAF loop nudging scrollLeft forward,
  // looping back to the start at the end. Skipped under reduced motion.
  useEffect(() => {
    if (reducedMotion) return;
    const track = trackRef.current;
    if (!track) return;
    let lastTime: number | null = null;

    function step(time: number) {
      if (lastTime === null) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      const el = trackRef.current;
      if (el && !pausedRef.current) {
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        if (atEnd) {
          el.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          el.scrollLeft += AUTO_SCROLL_PX_PER_SEC * dt;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  function pause() {
    pausedRef.current = true;
  }
  function resume() {
    pausedRef.current = false;
  }

  function scrollToMember(id: string) {
    itemRefs.current.get(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" && index < members.length - 1) {
      e.preventDefault();
      scrollToMember(members[index + 1].id);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      scrollToMember(members[index - 1].id);
    }
  }

  const activeMember = members.find((m) => m.id === activeId) ?? members[0];

  return (
    <div onMouseLeave={resume} onTouchStart={pause} onTouchEnd={resume}>
      <div
        ref={trackRef}
        role="listbox"
        aria-label="Meet the Team"
        className="flex items-center gap-6 sm:gap-10 overflow-x-auto snap-x snap-mandatory scroll-smooth px-[calc(50%-70px)] sm:px-[calc(50%-90px)] py-6 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {members.map((member, index) => (
          <div
            key={member.id}
            ref={(el) => {
              if (el) itemRefs.current.set(member.id, el);
              else itemRefs.current.delete(member.id);
            }}
            className="snap-center shrink-0 transition-[opacity] duration-150 motion-reduce:transition-none"
            style={reducedMotion ? undefined : { transform: `scale(${member.id === activeId ? MAX_SCALE : MIN_SCALE})` }}
          >
            <button
              type="button"
              role="option"
              aria-selected={member.id === activeId}
              onMouseEnter={() => {
                pause();
                setActiveId(member.id);
              }}
              onFocus={() => {
                pause();
                setActiveId(member.id);
              }}
              onBlur={resume}
              onClick={() => onSelect(member)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-label={`View ${member.displayName}'s profile`}
              className="group relative block w-[140px] h-[140px] sm:w-[180px] sm:h-[180px] rounded-full overflow-hidden bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2"
            >
              {member.avatarUrl ? (
                <Image
                  src={member.avatarUrl}
                  alt=""
                  fill
                  sizes="180px"
                  className="object-cover"
                  style={{ objectPosition: `${member.avatarFocalX}% ${member.avatarFocalY}%` }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif text-card-title text-ordift-ink-muted">
                  {member.displayName.charAt(0)}
                </div>
              )}
            </button>
          </div>
        ))}
      </div>

      {activeMember && (
        <p className="text-center font-sans text-body-small text-ordift-ink mt-2" aria-live="polite">
          {activeMember.displayName}
        </p>
      )}
    </div>
  );
}
