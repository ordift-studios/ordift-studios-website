// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HeroExploreLinks from "./HeroExploreLinks";

const html = renderToStaticMarkup(createElement(HeroExploreLinks));
const anchors = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({ href: m[1], label: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
const groups = html.split("</ul>").slice(0, 2).map((g) => [...g.matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()));

describe("homepage hero links (Founder-approved arrangement and reference)", () => {
  it("has exactly four links: lower-left Our Process / Our Departments, lower-right Who We Are / Meet the Minds Behind the Scenes, in that order, to the right pages", () => {
    expect(groups).toEqual([["Our Process", "Our Departments"], ["Who We Are", "Meet the Minds Behind the Scenes"]]);
    expect(anchors).toEqual([
      { href: "/process", label: "Our Process" }, { href: "/services", label: "Our Departments" },
      { href: "/about", label: "Who We Are" }, { href: "/team", label: "Meet the Minds Behind the Scenes" },
    ]);
  });
  it("the long label is set on two lines so its gold rule lines up with the widest line", () => {
    expect(html).toMatch(/<span class="block">Meet the Minds <\/span><span class="block">Behind the Scenes<\/span>/);
  });
  it("each link is text with a thin brand-gold rule only: no arrows, icons, buttons, backgrounds, panels or shadows boxes", () => {
    expect(html).not.toMatch(/<svg|<img|<button|→|←|&rarr;|&larr;|>›|»/);
    expect(html).not.toMatch(/\bbg-|rounded|shadow-(sm|md|lg)|backdrop|gradient/);
    expect([...new Set(html.match(/\bborder[^\s"]*/g) ?? [])].sort()).toEqual(["border-b", "border-ordift-gold"]);
    expect((html.match(/border-b border-ordift-gold/g) ?? []).length).toBe(4);
  });
  it("sits over the slideshow without blocking it: the container ignores the pointer and only the four links accept it", () => {
    expect(html).toMatch(/<nav[^>]*aria-label="Explore Ordift Studios"[^>]*class="[^"]*pointer-events-none absolute/);
    expect((html.match(/pointer-events-auto/g) ?? []).length).toBe(4);
  });
  it("sits clear of the slideshow's own dots (which are at the very bottom) — raised by a share of the hero's height, not pinned to the edge", () => {
    expect(html).toMatch(/bottom-\[11%\]/);
  });
});
