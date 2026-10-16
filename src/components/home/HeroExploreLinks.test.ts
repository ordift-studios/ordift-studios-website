// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HeroExploreLinks from "./HeroExploreLinks";

const html = renderToStaticMarkup(createElement(HeroExploreLinks));
const anchors = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({ href: m[1], label: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
describe("homepage hero links (Founder-approved arrangement and reference)", () => {
  it("has exactly one link, lower-right: Meet the Minds Behind the Scenes (Workshops moved to the main navigation); nothing at the lower-left", () => {
    expect(anchors).toEqual([{ href: "/team", label: "Meet the Minds Behind the Scenes" }]);
    expect(html).not.toContain("Workshops");
    expect((html.match(/<ul/g) ?? []).length).toBe(1);
    expect(html).toMatch(/justify-end/);                 // the container is right-aligned
    expect(html).not.toMatch(/justify-between|-ml-/);     // no left group
    for (const gone of ["Our Process", "Our Departments", "Who We Are"]) expect(html).not.toContain(gone);
  });
  it("the long label is one line from tablet width up and wraps to two lines on narrow phones, so its gold rule matches the label", () => {
    expect(html).toMatch(/<span class="block md:inline">Meet the Minds<\/span> <span class="block md:inline">Behind the Scenes<\/span>/);
  });
  it("labels are small, refined, uppercase and not bold: about 8-9px on phones, 10px on tablets and 11px on desktop, with a 1px gold rule", () => {
    expect(html).toMatch(/\buppercase\b/);
    expect(html).toMatch(/text-\[0\.53rem\]/);            // 8.5px phones
    expect(html).toMatch(/md:text-\[0\.625rem\]/);        // 10px tablets
    expect(html).toMatch(/lg:text-\[0\.6875rem\]/);       // 11px desktop
    expect(html).toMatch(/font-normal/);
    expect(html).not.toMatch(/font-(medium|semibold|bold|extrabold|black)/);
    expect(html).toMatch(/border-b border-ordift-gold/);
  });
  it("keeps a comfortable invisible tap area: the link is a 44px-tall (h-11) target with side padding", () => {
    expect((html.match(/\bh-11\b/g) ?? []).length).toBe(1);
    expect((html.match(/\bpx-2\.5 md:px-2 lg:px-3\b/g) ?? []).length).toBe(1);
  });
  it("each link is text with a thin brand-gold rule only: no arrows, icons, buttons, backgrounds, panels or shadows boxes", () => {
    expect(html).not.toMatch(/<svg|<img|<button|→|←|&rarr;|&larr;|>›|»/);
    expect(html).not.toMatch(/\bbg-|rounded|shadow-(sm|md|lg)|backdrop|gradient/);
    expect([...new Set(html.match(/\bborder[^\s"]*/g) ?? [])].sort()).toEqual(["border-b", "border-ordift-gold"]);
    expect((html.match(/border-b border-ordift-gold/g) ?? []).length).toBe(1);
  });
  it("sits over the slideshow without blocking it: the container ignores the pointer and only the link accepts it", () => {
    expect(html).toMatch(/<nav[^>]*aria-label="Explore Ordift Studios"[^>]*class="[^"]*pointer-events-none absolute/);
    expect((html.match(/pointer-events-auto/g) ?? []).length).toBe(1);
  });
  it("shares the slideshow indicator's horizontal level: its row sits on the dots' line (dots are 1rem, sm+ 1.25rem, above the bottom and 6px tall; each link is 44px tall and centred)", () => {
    // dots centre = 16px+3px (sm+: 20px+3px) above the bottom; a 44px link centred there has its bottom edge at 19-22 = -3px (sm+: 23-22 = 1px)
    expect(html).toMatch(/class="[^"]*\bbottom-\[-3px\] sm:bottom-px\b/);
  });
  it("has a thin dark text halo for bright photographs: a text-shadow only, so no box, panel or gradient is introduced", () => {
    expect(html).toMatch(/text-shadow:0_0_3px_rgba\(0,0,0,0\.8\),0_0_8px_rgba\(0,0,0,0\.5\),0_1px_1px_rgba\(0,0,0,0\.85\)/);
    expect(html).not.toMatch(/\bbg-|gradient|backdrop|\bshadow-(sm|md|lg|xl)|drop-shadow|rounded/);
  });
  it("leaves the dots where they are: nothing here positions anything at the horizontal centre", () => {
    expect(html).not.toMatch(/left-1\/2|-translate-x-1\/2|justify-center/);
  });
});
