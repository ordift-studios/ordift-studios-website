// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HeroExploreLinks from "./HeroExploreLinks";

const html = renderToStaticMarkup(createElement(HeroExploreLinks));
const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], label: m[2] }));
const groups = html.split("</ul>").slice(0, 2).map((g) => [...g.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => m[2]));

describe("homepage hero links (Founder-approved arrangement)", () => {
  it("has exactly four links, lower-left Our Process / Our Departments and lower-right Who We Are / Meet the Minds Behind the Scenes, in that order", () => {
    expect(groups).toEqual([["Our Process", "Our Departments"], ["Who We Are", "Meet the Minds Behind the Scenes"]]);
    expect(links).toEqual([
      { href: "/process", label: "Our Process" }, { href: "/services", label: "Our Departments" },
      { href: "/about", label: "Who We Are" }, { href: "/team", label: "Meet the Minds Behind the Scenes" },
    ]);
  });
  it("each link is text with a thin brand-gold underline only: no arrows, icons, buttons, backgrounds or panels", () => {
    expect(html).not.toMatch(/<svg|<img|<button|→|←|&rarr;|&larr;|>›|»/);
    expect(html).not.toMatch(/\bbg-|border|rounded|shadow-(sm|md|lg)|backdrop|gradient/);
    expect((html.match(/decoration-ordift-gold decoration-1/g) ?? []).length).toBe(4);
    expect((html.match(/underline /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it("sits over the slideshow without blocking it: the container ignores the pointer and only the links accept it", () => {
    expect(html).toMatch(/<nav[^>]*aria-label="Explore Ordift Studios"[^>]*class="[^"]*pointer-events-none absolute/);
    expect((html.match(/pointer-events-auto/g) ?? []).length).toBe(4);
  });
});
