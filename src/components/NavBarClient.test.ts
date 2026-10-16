// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NavBarClient from "./NavBarClient";
import { buildMainNavigation } from "@/lib/content/navigationHelpers";

const items = buildMainNavigation({ cmsLinks: [], footerColumns: [], accountHref: null });
const html = renderToStaticMarkup(createElement(NavBarClient, { items, primaryCta: { label: "Book a Service", href: "/book" }, transparent: true }));
const labelsIn = (chunk: string) => [...chunk.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => `${m[2]}→${m[1]}`);

describe("main navigation (desktop strip and mobile menu)", () => {
  const desktop = html.slice(0, html.indexOf('id="mobile-nav"'));
  const mobile = html.slice(html.indexOf('id="mobile-nav"'));
  const SIX = ["About→/about", "Portfolio→/work", "Workshops→/workshops", "Talent→/services/talent-management", "Contact→/book?service=general", "My Account→/portal/login"];
  it("desktop shows exactly About, Portfolio, Workshops, Talent, Contact, My Account in that order, then the gold Book a Service button", () => {
    expect(labelsIn(desktop).filter((l) => !l.startsWith("Book") && !l.startsWith("<"))).toEqual(expect.arrayContaining(SIX));
    const order = SIX.map((l) => desktop.indexOf(l.split("→")[0] + "</a>"));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(desktop).toContain("Book a Service");
  });
  it("the mobile menu holds the same six items in the same order, plus Book a Service", () => {
    const order = SIX.map((l) => mobile.indexOf(l.split("→")[0] + "</a>"));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(mobile).toContain("Book a Service");
  });
  it("Services, Stories, Log in and Create account are no longer in the top navigation", () => {
    for (const gone of [">Services<", ">Stories<", ">Log in<", ">Create account<", ">Work<"]) expect(html).not.toContain(gone);
  });
  it("Workshops appears once in the desktop strip and once in the mobile menu, never duplicated", () => {
    expect((html.match(/>Workshops<\/a>/g) ?? []).length).toBe(2);
  });
  it("the header runs close to the corners on desktop: no centred max-width container around the logo, links and Book a Service button", () => {
    expect(html).not.toMatch(/max-w-6xl/);
  });
  it("the labels are small refined capitals with letter-spacing", () => {
    expect(html).toMatch(/uppercase tracking-\[0\.12em\]/);
  });
});
