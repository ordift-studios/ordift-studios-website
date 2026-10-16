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

// ------------------------------------------------------------------ main navigation (Founder-approved structure, 2026-10-17)
// The top navigation is exactly: ABOUT | PORTFOLIO | WORKSHOPS | TALENT | CONTACT | MY ACCOUNT, plus the gold Book a Service button (the
// Workshops item was restored to the top navigation 2026-10-18; it had briefly lived in the homepage hero). Services and Stories are not in
// the top navigation — their pages, records and links elsewhere are untouched (Services/departments from Portfolio, Stories from the footer).
//
// The destinations still come from the CMS where it already has them, so an edit to those links in Sanity keeps working: About, Work (shown
// as "Portfolio"), Workshops and Talent are read from the CMS navigation by their existing labels, and Contact from the footer's existing "Contact" link.
// Each falls back to today's address if the CMS entry is blank or missing. MY ACCOUNT goes to the visitor's own portal when signed in (the
// destination is precomputed from their role elsewhere, never here) and otherwise to the login page, which links to account creation.
export type MainNavItem = { label: string; href: string; key: "about" | "portfolio" | "workshops" | "talent" | "contact" | "account" };

export function buildMainNavigation(input: {
  cmsLinks: NavLink[];
  footerColumns: { links: { label: string; href: string }[] }[];
  accountHref: string | null;
}): MainNavItem[] {
  const cms = (label: string, fallback: string) => {
    const hit = input.cmsLinks.find((l) => l.label.trim().toLowerCase() === label.toLowerCase());
    return hit?.href?.trim() ? hit.href : fallback;
  };
  const footerContact = input.footerColumns.flatMap((c) => c.links).find((l) => l.label.trim().toLowerCase() === "contact");
  return [
    { key: "about", label: "About", href: cms("About", "/about") },
    { key: "portfolio", label: "Portfolio", href: cms("Work", "/work") },
    { key: "workshops", label: "Workshops", href: cms("Workshops", "/workshops") },
    { key: "talent", label: "Talent", href: cms("Talent", "/services/talent-management") },
    { key: "contact", label: "Contact", href: footerContact?.href?.trim() ? footerContact.href : "/book?service=general" },
    { key: "account", label: "My Account", href: input.accountHref ?? "/portal/login" },
  ];
}
