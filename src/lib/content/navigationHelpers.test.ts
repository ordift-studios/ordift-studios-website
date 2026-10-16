import { describe, expect, it } from "vitest";
import { buildMainNavigation, withHrefFallback } from "./navigationHelpers";

// Public Workshops nav defect (2026-09-20) — regression coverage for
// the reported symptom: clicking "Workshops" in the main nav produced
// no navigation at all, traced to a blank href in the live Sanity
// navigation singleton. withHrefFallback() is a pure function (no
// server-only imports), so these are real assertions.

describe("withHrefFallback", () => {
  it("repairs a link whose href is blank by matching its label against the canonical seed navigation", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "" }]);
    expect(result).toEqual([{ label: "Workshops", href: "/workshops" }]);
  });

  it("repairs a link whose href is whitespace-only", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "   " }]);
    expect(result[0].href).toBe("/workshops");
  });

  it("leaves a link with a real, non-blank href completely untouched — an intentionally repointed href is never overridden", () => {
    const result = withHrefFallback([{ label: "Workshops", href: "/workshops?category=photography" }]);
    expect(result).toEqual([{ label: "Workshops", href: "/workshops?category=photography" }]);
  });

  it("leaves a blank-href link with no matching seed label unchanged (nothing to fall back to)", () => {
    const result = withHrefFallback([{ label: "A Brand New Section", href: "" }]);
    expect(result).toEqual([{ label: "A Brand New Section", href: "" }]);
  });

  it("repairs only the affected link in a mixed list, preserving order and every other link exactly", () => {
    const input = [
      { label: "About", href: "/about" },
      { label: "Workshops", href: "" },
      { label: "Stories", href: "/journal" },
    ];
    const result = withHrefFallback(input);
    expect(result).toEqual([
      { label: "About", href: "/about" },
      { label: "Workshops", href: "/workshops" },
      { label: "Stories", href: "/journal" },
    ]);
  });
});

describe("buildMainNavigation — ABOUT | PORTFOLIO | TALENT | CONTACT | MY ACCOUNT", () => {
  const cmsLinks = [
    { label: "About", href: "/about" }, { label: "Services", href: "/services" }, { label: "Work", href: "/work" },
    { label: "Workshops", href: "/workshops" }, { label: "Talent", href: "/services/talent-management" }, { label: "Stories", href: "/journal" },
  ];
  const footerColumns = [{ links: [{ label: "About", href: "/about" }, { label: "Contact", href: "/book?service=general" }] }];

  it("is exactly five items in this order, with Work shown as Portfolio; Services, Workshops and Stories are not in it", () => {
    const nav = buildMainNavigation({ cmsLinks, footerColumns, accountHref: null });
    expect(nav.map((n) => n.label)).toEqual(["About", "Portfolio", "Talent", "Contact", "My Account"]);
    expect(nav.map((n) => n.href)).toEqual(["/about", "/work", "/services/talent-management", "/book?service=general", "/portal/login"]);
    expect(nav.map((n) => n.label.toLowerCase())).not.toEqual(expect.arrayContaining(["services", "workshops", "stories"]));
  });
  it("My Account goes to the visitor's own portal when signed in (precomputed from their role), and to the login page otherwise", () => {
    expect(buildMainNavigation({ cmsLinks, footerColumns, accountHref: "/portal/client" }).at(-1)).toEqual({ key: "account", label: "My Account", href: "/portal/client" });
    expect(buildMainNavigation({ cmsLinks, footerColumns, accountHref: null }).at(-1)?.href).toBe("/portal/login");
  });
  it("keeps following the CMS: a repointed CMS destination is used, and a blank or missing one falls back to today's address", () => {
    const repointed = buildMainNavigation({ cmsLinks: [{ label: "Work", href: "/work?discipline=photography" }, { label: "Talent", href: "" }], footerColumns: [], accountHref: null });
    expect(repointed.find((n) => n.key === "portfolio")?.href).toBe("/work?discipline=photography");
    expect(repointed.find((n) => n.key === "talent")?.href).toBe("/services/talent-management");
    expect(repointed.find((n) => n.key === "contact")?.href).toBe("/book?service=general");
  });
});
