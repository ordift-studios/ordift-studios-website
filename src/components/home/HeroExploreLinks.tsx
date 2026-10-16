import Link from "next/link";

// One understated text link at the lower-RIGHT of the homepage slideshow (Founder-approved, 2026-10-17): Meet the Minds Behind the Scenes.
// Workshops used to sit directly above it here; it moved into the main navigation (2026-10-18), so this is now the only hero link. The
// lower-left stays free of links. A small uppercase label with a thin brand-gold rule — NO
// arrows, icons, buttons, cards or panels — with a thin dark text halo for readability on bright photographs (a text-shadow only: no box,
// panel or gradient, and the photograph is not altered).
//
// "Meet the Minds Behind the Scenes" keeps its approved lower-right position: on the slideshow indicator's own horizontal level (the dots sit
// 1rem, sm+ 1.25rem, above the bottom and are 6px tall, so their centre is 19px, sm+ 23px, above it; each link here is a 44px-tall tap area
// centred on a line, so a link whose bottom edge sits 22px below that centre is centred on the dots' level: bottom -3px, sm+ 1px). It is
// right-aligned in the right-hand corner, well clear of the dots in the centre and of the arrows at mid-height. On narrow phones the long label wraps to two lines and is lifted half a line so its LAST line (and gold rule) stays on the dots'
// level, exactly as approved before.
//
// This overlay lives in the homepage's own wrapper OVER the slideshow, so PortfolioHeroSlideshow itself is untouched (same slides, timing,
// arrows, dots, swipe, crop and height). The container ignores pointer events and only the links accept them, so swipe and the arrow and
// dot controls are never blocked.
type Item = { href: string; label: string; wrap?: readonly [string, string] };
const RIGHT: Item[] = [
  { href: "/team", label: "Meet the Minds Behind the Scenes", wrap: ["Meet the Minds", "Behind the Scenes"] },
];

// The anchor is the (invisible) tap area: 44px tall with side padding. The inner span carries the thin gold rule, sized in em so it stays
// proportional to the text; its top padding mirrors the bottom padding plus the 1px rule so the text sits dead centre.
const anchorClass =
  "pointer-events-auto flex h-11 items-center px-2.5 md:px-2 lg:px-3 font-sans font-normal uppercase leading-[1.5] text-white/90 hover:text-white " +
  "text-[0.53rem] tracking-[0.08em] max-[359px]:text-[0.5rem] max-[359px]:tracking-[0.06em] md:text-[0.625rem] md:tracking-[0.06em] lg:text-[0.6875rem] lg:tracking-[0.16em] " +
  "[text-shadow:0_0_3px_rgba(0,0,0,0.8),0_0_8px_rgba(0,0,0,0.5),0_1px_1px_rgba(0,0,0,0.85)] " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ordift-gold";
const labelClass = "inline-block border-b border-ordift-gold pt-[calc(0.55em+1px)] pb-[0.55em] text-left whitespace-nowrap";

export default function HeroExploreLinks() {
  return (
    <nav
      aria-label="Explore Ordift Studios"
      className="pointer-events-none absolute inset-x-0 bottom-[-3px] sm:bottom-px z-10 px-5 sm:px-10 lg:px-14 flex items-end justify-end"
    >
      <ul className="flex flex-col items-end -mr-2.5 md:-mr-2 lg:-mr-3">
        {RIGHT.map((it) => (
          <li key={it.href} className="flex justify-end">
            <Link href={it.href} className={anchorClass}>
              <span className={`${labelClass} ${it.wrap ? "max-md:-translate-y-[0.75em]" : ""}`}>
                {it.wrap ? (
                  <>
                    <span className="block md:inline">{it.wrap[0]}</span>{" "}
                    <span className="block md:inline">{it.wrap[1]}</span>
                  </>
                ) : (
                  it.label
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
