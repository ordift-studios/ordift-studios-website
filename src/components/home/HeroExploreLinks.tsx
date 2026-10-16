import Link from "next/link";

// Four understated text links at the lower edge of the homepage slideshow (Founder-approved arrangement, 2026-10-16): two at lower-left, two at
// lower-right, each stacked in the order given. Text and a thin brand-gold underline ONLY — no arrows, icons, buttons, cards or panels.
//
// This sits in the homepage's own positioning wrapper OVER the slideshow, so PortfolioHeroSlideshow itself is untouched (same slides, timing,
// arrows, dots, swipe, crop and height). The container ignores pointer events and only the links accept them, so the slideshow's swipe and its
// arrow and dot controls are never blocked. It is lifted just above the slideshow's own dots so nothing overlaps; the two groups are capped to a
// share of the width so they can never meet, and the long label wraps on narrow screens rather than shrinking the type or moving the groups.
const LEFT = [
  { label: "Our Process", href: "/process" },
  { label: "Our Departments", href: "/services" },
] as const;
const RIGHT = [
  { label: "Who We Are", href: "/about" },
  { label: "Meet the Minds Behind the Scenes", href: "/team" },
] as const;

const linkClass =
  "pointer-events-auto block w-fit py-3 sm:py-2.5 font-sans text-caption sm:text-body-small text-white/90 hover:text-white " +
  "underline decoration-ordift-gold decoration-1 underline-offset-[6px] [text-shadow:0_1px_8px_rgba(0,0,0,0.55)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export default function HeroExploreLinks() {
  return (
    <nav
      aria-label="Explore Ordift Studios"
      className="pointer-events-none absolute inset-x-0 bottom-11 sm:bottom-8 z-10 px-4 sm:px-8 flex items-end justify-between gap-4"
    >
      <ul className="max-w-[42%] sm:max-w-none">
        {LEFT.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkClass}>{l.label}</Link>
          </li>
        ))}
      </ul>
      <ul className="max-w-[46%] sm:max-w-none text-right">
        {RIGHT.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={`${linkClass} ml-auto`}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
