import Link from "next/link";

// Four understated text links at the lower edge of the homepage slideshow (Founder-approved arrangement and reference, 2026-10-16): two at
// lower-left, two at lower-right, each stacked in the order given. Small uppercase labels with a thin brand-gold rule beneath — NO arrows,
// icons, buttons, cards or panels.
//
// Position and scale follow the approved reference: the groups sit about 11% up from the bottom of the slideshow (clear of its own dots, which
// are at the very bottom), in the same side margins, with small wide-tracked capitals. The long label is set on two lines ("Meet the Minds /
// Behind the Scenes") exactly as in the reference, so its gold rule lines up with the widest line instead of stretching across the wrap.
//
// This overlay lives in the homepage's own positioning wrapper OVER the slideshow, so PortfolioHeroSlideshow itself is untouched (same slides,
// timing, arrows, dots, swipe, crop and height). The container ignores pointer events and only the links accept them, so the slideshow's swipe
// and its arrow and dot controls are never blocked.
type Item = { href: string; lines: readonly string[] };
const LEFT: Item[] = [
  { href: "/process", lines: ["Our Process"] },
  { href: "/services", lines: ["Our Departments"] },
];
const RIGHT: Item[] = [
  { href: "/about", lines: ["Who We Are"] },
  { href: "/team", lines: ["Meet the Minds", "Behind the Scenes"] },
];

// The anchor carries the padding (the tap area); the inner span carries the gold rule so the rule hugs the label, not the tap area.
const anchorClass =
  "pointer-events-auto block w-fit py-2.5 font-sans font-medium uppercase text-[0.6875rem] sm:text-xs lg:text-[0.8125rem] " +
  "tracking-[0.1em] sm:tracking-[0.16em] leading-[1.5] text-white/90 hover:text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";
const labelClass = "inline-block border-b border-ordift-gold pb-1.5 text-left";

function Links({ items, align }: { items: Item[]; align: "left" | "right" }) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href} className={`${anchorClass} ${align === "right" ? "ml-auto" : ""}`}>
            <span className={labelClass}>
              {it.lines.map((line, i) => (
                <span key={i} className="block">{line}{i < it.lines.length - 1 ? " " : ""}</span>
              ))}
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
      className="pointer-events-none absolute inset-x-0 bottom-[11%] z-10 px-5 sm:px-10 lg:px-14 flex items-end justify-between gap-4"
    >
      <Links items={LEFT} align="left" />
      <Links items={RIGHT} align="right" />
    </nav>
  );
}
