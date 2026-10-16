import Link from "next/link";

// Four understated text links on the SAME horizontal level as the slideshow's own indicator (the dots), two at lower-left and two at
// lower-right (Founder-approved, 2026-10-16/17). Small uppercase labels with a thin brand-gold rule — NO arrows, icons, buttons, cards or
// panels. The dots stay exactly where they are, centred; this overlay only shares their level.
//
// How the level is shared: the slideshow places its dots 1rem (sm and up: 1.25rem) above the bottom edge and 6px tall, so their centre is 19px
// (sm+: 23px) above the bottom. Every link here is a 44px-tall, vertically centred tap area, so a link whose bottom edge sits 22px below that
// centre is centred on the dots' level: bottom -3px (sm+: 1px). The label inside is symmetrical about its own centre (the rule's space above is
// matched by padding), so the TEXT centres on the dots' line.
//
// Layout: from tablet width up all four share one row (left pair beside each other, right pair beside each other) with the long label on one
// line. On narrow portrait phones four labels cannot share one line with the dots in the middle at a readable size, so each side is a short
// stack: the lower link of each side is on the dots' level and its partner sits directly above it. The long label wraps to two lines and is
// lifted half a line so its LAST line (and its gold rule) sit at exactly the same level as the other bottom link, with the first line above.
//
// The overlay lives in the homepage's own wrapper OVER the slideshow, so PortfolioHeroSlideshow itself is untouched. The container ignores
// pointer events and only the links accept them, so swipe and the arrow and dot controls are never blocked.
type Item = { href: string; label: string; wrap?: readonly [string, string] };
const LEFT: Item[] = [
  { href: "/process", label: "Our Process" },
  { href: "/services", label: "Our Departments" },
];
const RIGHT: Item[] = [
  { href: "/about", label: "Who We Are" },
  { href: "/team", label: "Meet the Minds Behind the Scenes", wrap: ["Meet the Minds", "Behind the Scenes"] },
];

// The anchor is the (invisible) tap area: 44px tall with side padding. The inner span carries the thin gold rule, sized in em so it stays
// proportional to the text; its top padding mirrors the bottom padding plus the 1px rule so the text sits dead centre.
const anchorClass =
  "pointer-events-auto flex h-11 items-center px-2.5 md:px-2 lg:px-3 font-sans font-normal uppercase leading-[1.5] text-white/90 hover:text-white " +
  "text-[0.53rem] tracking-[0.08em] max-[359px]:text-[0.5rem] max-[359px]:tracking-[0.06em] md:text-[0.625rem] md:tracking-[0.06em] lg:text-[0.6875rem] lg:tracking-[0.16em] " +
  "[text-shadow:0_1px_8px_rgba(0,0,0,0.5)] " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ordift-gold";
const labelClass = "inline-block border-b border-ordift-gold pt-[calc(0.55em+1px)] pb-[0.55em] text-left whitespace-nowrap";

function Links({ items, side }: { items: Item[]; side: "left" | "right" }) {
  return (
    <ul className={`flex flex-col md:flex-row md:items-center ${side === "left" ? "-ml-2.5 md:-ml-2 lg:-ml-3" : "-mr-2.5 md:-mr-2 lg:-mr-3 items-end"}`}>
      {items.map((it) => (
        <li key={it.href} className={side === "right" ? "flex justify-end" : undefined}>
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
  );
}

export default function HeroExploreLinks() {
  return (
    <nav
      aria-label="Explore Ordift Studios"
      className="pointer-events-none absolute inset-x-0 bottom-[-3px] sm:bottom-px z-10 px-5 sm:px-10 lg:px-14 flex items-end justify-between"
    >
      <Links items={LEFT} side="left" />
      <Links items={RIGHT} side="right" />
    </nav>
  );
}
