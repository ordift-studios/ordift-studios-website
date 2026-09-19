import { NAVIGATION } from "@/lib/content/local/siteWideData";
import type { NavLink } from "@/lib/content/types";

// Nav-link self-heal (2026-09-20) — Human QA found the public
// "Workshops" nav item produced no navigation at all. NavBarClient's
// rendering (`<Link href={link.href}>`) is and was already correct;
// the Sanity `navigation` singleton's href field is a freeform string
// with no validation, so a blank/whitespace value there silently
// resolves to Link's no-op self-href, which reads exactly as "nothing
// happens." The canonical, already-correct href for every known label
// lives in NAVIGATION (this same file's sibling siteWideData.ts, the
// constant this Sanity singleton was originally seeded from) — this
// repairs any link whose live CMS href has drifted to blank, by that
// label, without touching Sanity content or inventing a second nav
// config. A link with a genuinely different (intentionally repointed)
// href, or a label with no seed match, is left exactly as Sanity has
// it. Pure function, no server-only imports, so it's directly
// unit-testable.
export function withHrefFallback(links: NavLink[]): NavLink[] {
  const canonicalByLabel = new Map(NAVIGATION.links.map((l) => [l.label, l.href] as const));
  return links.map((link) => {
    if (link.href?.trim()) return link;
    const fallback = canonicalByLabel.get(link.label);
    return fallback ? { ...link, href: fallback } : link;
  });
}
