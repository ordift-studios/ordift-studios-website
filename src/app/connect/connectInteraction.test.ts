// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectContactSheet from "./ConnectContactSheet";
import ConnectView from "./ConnectView";
import { getConnectGalleryImages } from "./gallery";
import { acquireScrollLock, releaseScrollLock } from "./scrollLock";

// jsdom has no native <dialog> behaviour, no matchMedia and no scrollIntoView, so the few things the components use are provided here with the same observable effect.
let reducedMotion = false;
let wideScreen = false;
let hiddenFlag = false;
let deferCloseEvents = false;                                  // real browsers deliver a dialog's `close` event later, as a queued task; tests can reproduce that
const pendingCloseEvents: HTMLDialogElement[] = [];
const flushCloseEvents = () => act(() => { for (const d of pendingCloseEvents.splice(0)) d.dispatchEvent(new Event("close")); });
const scrollCalls: unknown[] = [];
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    if (deferCloseEvents) pendingCloseEvents.push(this); else this.dispatchEvent(new Event("close"));
  };
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduced-motion") ? reducedMotion : q.includes("min-width") ? wideScreen : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = function (arg?: unknown) { scrollCalls.push(arg); };
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hiddenFlag });
});

let root: Root | null = null; let host: HTMLElement | null = null;
beforeEach(() => { vi.useFakeTimers(); deferCloseEvents = false; pendingCloseEvents.length = 0; reducedMotion = false; wideScreen = false; hiddenFlag = false; scrollCalls.length = 0; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; document.documentElement.style.overflow = ""; vi.useRealTimers(); });

function mount(el: ReturnType<typeof createElement>) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(el)); return host; }
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const pointer = (el: Element, type: string, pointerType = "mouse") => act(() => { const e = new Event(type, { bubbles: true }); Object.defineProperty(e, "pointerType", { value: pointerType }); el.dispatchEvent(e); });

const images = getConnectGalleryImages();
const N = images.length;
const page = () => mount(createElement(ConnectView, { images }));
const byLabel = (h: ParentNode, label: string) => h.querySelector(`[aria-label="${label}"]`)!;
const viewPortfolio = (h: HTMLElement) => [...h.querySelectorAll("nav > button")].find((b) => b.textContent?.startsWith("View Portfolio"))!;
const section = (h: ParentNode) => h.querySelector("#portfolio") as HTMLElement | null;
const counter = (h: ParentNode) => [...section(h)!.querySelectorAll("p")].find((p) => /^\d+ \/ \d+$/.test(p.textContent!.trim()) && !p.closest("dialog"))!.textContent!.trim();
const currentAlt = (h: ParentNode) => section(h)!.querySelector('[role="group"] > div:not([aria-hidden]) img')!.getAttribute("alt");
const layers = (h: ParentNode) => section(h)!.querySelectorAll('[role="group"] > div[data-layer]');
const next = (h: ParentNode) => click(byLabel(h, "Show next photograph"));
const prev = (h: ParentNode) => click(byLabel(h, "Show previous photograph"));
const galleryDialog = (h: ParentNode) => h.querySelector('dialog[aria-label="Portfolio gallery"]') as HTMLDialogElement;
const viewerDialog = (h: ParentNode) => h.querySelector('dialog[aria-label="Photograph"]') as HTMLDialogElement | null;
const thumb = (h: ParentNode, n: number) => galleryDialog(h).querySelector(`button[aria-label^="Enlarge photograph ${n} of"]`)!;

describe("the contact panel", () => {
  it("is closed until Contact Us is pressed, then opens and locks the page behind it", () => {
    const h = mount(createElement(ConnectContactSheet));
    const dlg = h.querySelector("dialog")!;
    expect(dlg.hasAttribute("open")).toBe(false);
    click([...h.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Contact Us"))!);
    expect(dlg.hasAttribute("open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
  it("is easy to dismiss: the close button, a tap outside the panel, and the dialog's own close event all release the page", () => {
    const h = mount(createElement(ConnectContactSheet));
    const dlg = h.querySelector("dialog")!;
    const open = () => click([...h.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Contact Us"))!);
    open(); click(h.querySelector('dialog button[aria-label="Close"]')!);
    expect(dlg.hasAttribute("open")).toBe(false); expect(document.documentElement.style.overflow).toBe("");
    open(); click(dlg);
    expect(dlg.hasAttribute("open")).toBe(false); expect(document.documentElement.style.overflow).toBe("");
    open(); click(h.querySelector("dialog a")!);
    expect(dlg.hasAttribute("open")).toBe(true);
  });
  it("selects nothing for the visitor: both numbers are present and unselected until one is tapped", () => {
    const h = mount(createElement(ConnectContactSheet));
    expect([...h.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href"))).toEqual(["tel:+97455104490", "tel:+233504981277"]);
  });
});

describe("View Portfolio", () => {
  it("shows nothing about the photographs until it is tapped: no slideshow, no image, no gallery thumbnails", () => {
    const h = page();
    expect(section(h)).toBeNull();
    expect(h.querySelectorAll('img[src*="/connect/portfolio/"]').length).toBe(0);
    expect(viewPortfolio(h).getAttribute("aria-expanded")).toBe("false");
  });
  it("shows one large photograph, the first, and starts the slideshow; the page scrolls to it", () => {
    const h = page();
    click(viewPortfolio(h));
    expect(section(h)).not.toBeNull();
    expect(viewPortfolio(h).getAttribute("aria-expanded")).toBe("true");
    expect(counter(h)).toBe(`1 / ${N}`);
    expect(layers(h)).toHaveLength(1);
    expect(currentAlt(h)).toBe(images[0].alt);
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0]).toEqual({ behavior: "smooth", block: "start" });
    expect(byLabel(h, "Pause slideshow")).toBeTruthy();                                    // it is playing
  });
  it("fetches the next and previous photograph ahead of time, out of sight", () => {
    const h = page(); click(viewPortfolio(h));
    const hidden = section(h)!.querySelector('div[aria-hidden="true"].opacity-0')!;
    expect([...hidden.querySelectorAll("img")].map((i) => i.getAttribute("alt"))).toEqual([images[1].alt, images[N - 1].alt]);
    expect([...hidden.querySelectorAll("img")].every((i) => i.getAttribute("loading") === "eager")).toBe(true);
  });
  it("tapping it again brings the slideshow back into view and restarts a paused slideshow", () => {
    const h = page(); click(viewPortfolio(h));
    click(byLabel(h, "Pause slideshow")); expect(byLabel(h, "Play slideshow")).toBeTruthy();
    click(viewPortfolio(h));
    expect(scrollCalls).toHaveLength(2);
    expect(byLabel(h, "Pause slideshow")).toBeTruthy();
    expect(layers(h)).toHaveLength(1);
  });
});

describe("the automatic slideshow", () => {
  it("advances every 3 seconds, not before", () => {
    const h = page(); click(viewPortfolio(h));
    tick(2999); expect(counter(h)).toBe(`1 / ${N}`);
    tick(1);    expect(counter(h)).toBe(`2 / ${N}`);
    expect(currentAlt(h)).toBe(images[1].alt);
    tick(3000); expect(counter(h)).toBe(`3 / ${N}`);
  });
  it("cycles continuously through all 15 photographs and starts again from the first", () => {
    const h = page(); click(viewPortfolio(h));
    const seen: string[] = [];
    for (let i = 0; i < N; i++) { tick(3000); seen.push(counter(h)); }
    expect(seen[0]).toBe(`2 / ${N}`);
    expect(seen[N - 2]).toBe(`${N} / ${N}`);
    expect(seen[N - 1]).toBe(`1 / ${N}`);                                                  // wrapped
    tick(3000); expect(counter(h)).toBe(`2 / ${N}`);                                       // and keeps going
  });
  it("cross-fades: the new photograph is stacked on top and fades in while the old one fades out, then the old one is removed", () => {
    const h = page(); click(viewPortfolio(h));
    tick(3000);
    expect(layers(h)).toHaveLength(2);
    const [old, fresh] = [...layers(h)] as HTMLElement[];
    expect(old.getAttribute("aria-hidden")).toBe("true");
    expect(old.style.opacity).toBe("0");
    expect(fresh.style.opacity).toBe("0");                                                 // starts transparent ...
    tick(40);
    expect(fresh.style.opacity).toBe("1");                                                 // ... and fades in (the CSS transition does the easing)
    expect(fresh.style.transitionDuration).toBe("700ms");
    tick(800);
    expect(layers(h)).toHaveLength(1);
    expect(currentAlt(h)).toBe(images[1].alt);
  });
  it("never shows an empty or lazy-loaded main photograph: every layer is eager and sized before it loads", () => {
    const h = page(); click(viewPortfolio(h)); tick(3000);
    for (const img of section(h)!.querySelectorAll('[role="group"] img')) {
      expect(img.getAttribute("loading")).toBe("eager");
      const st = (img as HTMLElement).style;
      expect(st.aspectRatio).toMatch(/^\d+ \/ \d+$/);
      expect(st.width).toContain("var(--stage-h)");
    }
  });
});

describe("manual navigation", () => {
  it("Next and Previous move one photograph at a time and wrap at both ends", () => {
    const h = page(); click(viewPortfolio(h));
    next(h); expect(counter(h)).toBe(`2 / ${N}`);
    prev(h); expect(counter(h)).toBe(`1 / ${N}`);
    prev(h); expect(counter(h)).toBe(`${N} / ${N}`);
    next(h); expect(counter(h)).toBe(`1 / ${N}`);
  });
  it("the arrow keys work inside the slideshow", () => {
    const h = page(); click(viewPortfolio(h));
    const region = section(h)!.querySelector('[role="region"]')!;
    const key = (k: string) => act(() => { region.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
    key("ArrowRight"); expect(counter(h)).toBe(`2 / ${N}`);
    key("ArrowLeft"); key("ArrowLeft"); expect(counter(h)).toBe(`${N} / ${N}`);
  });
  it("a manual move restarts the 3 seconds, so the photograph just chosen is shown for its full time", () => {
    const h = page(); click(viewPortfolio(h));
    tick(2000); next(h); expect(counter(h)).toBe(`2 / ${N}`);
    tick(2999); expect(counter(h)).toBe(`2 / ${N}`);
    tick(1);    expect(counter(h)).toBe(`3 / ${N}`);
  });
  it("tapping Next several times quickly stacks the photographs and ends on the right one, with only one left once the fades finish", () => {
    const h = page(); click(viewPortfolio(h));
    next(h); next(h); next(h);
    expect(counter(h)).toBe(`4 / ${N}`);
    expect(layers(h).length).toBeGreaterThan(1);
    tick(1000);
    expect(layers(h)).toHaveLength(1);
    expect(currentAlt(h)).toBe(images[3].alt);
  });
});

describe("when the slideshow holds still", () => {
  it("Pause stops it and Play starts it again (3 seconds after pressing Play)", () => {
    const h = page(); click(viewPortfolio(h));
    click(byLabel(h, "Pause slideshow")); tick(20000);
    expect(counter(h)).toBe(`1 / ${N}`);
    click(byLabel(h, "Play slideshow")); tick(2999); expect(counter(h)).toBe(`1 / ${N}`);
    tick(1); expect(counter(h)).toBe(`2 / ${N}`);
  });
  it("it pauses while it is pressed or touched, and carries on afterwards", () => {
    const h = page(); click(viewPortfolio(h));
    const region = section(h)!.querySelector('[role="region"]')!;
    pointer(region, "pointerdown", "touch"); tick(10000); expect(counter(h)).toBe(`1 / ${N}`);
    pointer(region, "pointerup", "touch"); tick(3000); expect(counter(h)).toBe(`2 / ${N}`);
  });
  it("a mouse resting over it does not hold it (opening the slideshow scrolls it under an unmoved pointer, which must not stall it)", () => {
    const h = page(); click(viewPortfolio(h));
    const region = section(h)!.querySelector('[role="region"]')!;
    pointer(region, "pointerover"); pointer(region, "pointerenter");
    tick(3000); expect(counter(h)).toBe(`2 / ${N}`);
    tick(3000); expect(counter(h)).toBe(`3 / ${N}`);
  });
  it("it pauses while a keyboard user is focused inside it, and carries on when focus leaves", () => {
    const h = page(); click(viewPortfolio(h));
    const orig = Element.prototype.matches;
    Element.prototype.matches = function (this: Element, sel: string) { return sel === ":focus-visible" ? true : orig.call(this, sel); };
    try {
      const btn = byLabel(h, "Show next photograph");
      act(() => { btn.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
      tick(10000); expect(counter(h)).toBe(`1 / ${N}`);
      act(() => { btn.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
      tick(3000); expect(counter(h)).toBe(`2 / ${N}`);
    } finally { Element.prototype.matches = orig; }
  });
  it("it pauses while the page is hidden and resumes (with a fresh 3 seconds) when it is visible again", () => {
    const h = page(); click(viewPortfolio(h));
    tick(2000);
    hiddenFlag = true; act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    tick(20000); expect(counter(h)).toBe(`1 / ${N}`);
    hiddenFlag = false; act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    tick(2999); expect(counter(h)).toBe(`1 / ${N}`);
    tick(1); expect(counter(h)).toBe(`2 / ${N}`);
  });
  it("it pauses while the full gallery is open and resumes from the same photograph when it closes", () => {
    const h = page(); click(viewPortfolio(h));
    tick(3000); expect(counter(h)).toBe(`2 / ${N}`);
    click([...section(h)!.querySelectorAll("button")].find((b) => b.textContent === "View All")!);
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    tick(20000); expect(counter(h)).toBe(`2 / ${N}`);
    click(byLabel(galleryDialog(h), "Close portfolio gallery"));
    expect(galleryDialog(h).hasAttribute("open")).toBe(false);
    tick(3000); expect(counter(h)).toBe(`3 / ${N}`);
  });
});

describe("reduced motion", () => {
  it("never advances by itself, has no Play/Pause control, still allows Next and Previous, and changes photographs without a fade", () => {
    reducedMotion = true;
    const h = page(); click(viewPortfolio(h));
    expect(scrollCalls[0]).toEqual({ behavior: "auto", block: "start" });
    tick(30000); expect(counter(h)).toBe(`1 / ${N}`);
    expect(h.querySelector('[aria-label="Pause slideshow"], [aria-label="Play slideshow"]')).toBeNull();
    next(h); expect(counter(h)).toBe(`2 / ${N}`);
    expect(section(h)!.querySelector('[role="group"] > div[data-layer]')!.className).toContain("motion-reduce:transition-none");
    tick(30000); expect(counter(h)).toBe(`2 / ${N}`);
  });
});

describe("View All and the full-screen gallery", () => {
  const open = (h: HTMLElement) => { click(viewPortfolio(h)); click([...section(h)!.querySelectorAll("button")].find((b) => b.textContent === "View All")!); };
  it("the View All button sits beneath the slideshow, and no thumbnail is on the page until it is pressed", () => {
    const h = page(); click(viewPortfolio(h));
    const viewAll = [...section(h)!.querySelectorAll("button")].find((b) => b.textContent === "View All")!;
    const stage = section(h)!.querySelector('[role="region"]')!;
    expect(stage.compareDocumentPosition(viewAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(galleryDialog(h).querySelectorAll("img").length).toBe(0);
    expect(galleryDialog(h).hasAttribute("open")).toBe(false);
  });
  it("opens a dedicated full-screen dialog holding all 15 photographs, not a list beneath the main buttons", () => {
    const h = page(); open(h);
    const dlg = galleryDialog(h);
    expect(dlg.hasAttribute("open")).toBe(true);
    expect(dlg.className).toContain("h-svh"); expect(dlg.className).toContain("w-screen");
    expect(dlg.querySelectorAll('button[aria-label^="Enlarge photograph"]')).toHaveLength(N);
    expect(h.querySelector("nav")!.querySelectorAll('button[aria-label^="Enlarge photograph"]').length).toBe(0);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
  it("has a clear Close button that returns to the landing page and releases the page", () => {
    const h = page(); open(h);
    const close = byLabel(galleryDialog(h), "Close portfolio gallery");
    expect(close.textContent).toContain("Close");
    click(close);
    expect(galleryDialog(h).hasAttribute("open")).toBe(false);
    expect(galleryDialog(h).querySelectorAll("img").length).toBe(0);
    expect(document.documentElement.style.overflow).toBe("");
    expect(section(h)).not.toBeNull();                                                      // still on the landing page, slideshow intact
  });
  it("uses two columns on a phone and three on a wide screen", () => {
    let h = page(); open(h);
    expect(galleryDialog(h).querySelectorAll(":scope > div > div ul")).toHaveLength(2);
    act(() => root?.unmount()); host?.remove();
    wideScreen = true; h = page(); open(h);
    expect(galleryDialog(h).querySelectorAll(":scope > div > div ul")).toHaveLength(3);
  });
  it("tapping a photograph enlarges it, loads it eagerly in a box sized before the file arrives, and Next / Previous / close work", () => {
    const h = page(); open(h);
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(false);
    click(thumb(h, 3));
    const v = viewerDialog(h)!;
    expect(v.hasAttribute("open")).toBe(true);
    expect(v.textContent).toContain(`3 / ${N}`);
    const img = v.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(images[2].alt);
    expect(img.getAttribute("loading")).toBe("eager");                                     // the fix: never lazy
    expect(img.style.aspectRatio).toBe(`${images[2].width} / ${images[2].height}`);        // the fix: a definite box before it loads
    // (the width, min(100%, calc(85svh * ratio)), is asserted in connect.test.ts; jsdom's CSS parser cannot represent min()/svh, a real browser can)
    click(byLabel(v, "Next photograph")); expect(v.querySelector("img")!.getAttribute("alt")).toBe(images[3].alt);
    click(byLabel(v, "Previous photograph")); click(byLabel(v, "Previous photograph"));
    expect(v.querySelector("img")!.getAttribute("alt")).toBe(images[1].alt);
    act(() => { v.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(v.querySelector("img")!.getAttribute("alt")).toBe(images[0].alt);
    act(() => { v.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(v.querySelector("img")!.getAttribute("alt")).toBe(images[N - 1].alt);           // wraps
  });
  it("closing the enlarged photograph returns to the gallery, which stays open and keeps the page locked", () => {
    const h = page(); open(h); click(thumb(h, 5));
    expect(document.documentElement.style.overflow).toBe("hidden");
    click(byLabel(viewerDialog(h)!, "Close"));
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(false);
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");                         // the gallery still needs the lock
    click(byLabel(galleryDialog(h), "Close portfolio gallery"));
    expect(document.documentElement.style.overflow).toBe("");
  });
  it("a tap on the dark area closes the enlarged photograph", () => {
    const h = page(); open(h); click(thumb(h, 2));
    click(viewerDialog(h)!);
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(false);
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
  });
  it("the Esc key (the dialog's cancel event) closes only the top layer, through state, and releases the page when the last one closes", () => {
    const h = page(); open(h); click(thumb(h, 2));
    const esc = (el: Element) => { const e = new Event("cancel", { cancelable: true }); act(() => { el.dispatchEvent(e); }); return e; };
    expect(esc(viewerDialog(h)!).defaultPrevented).toBe(true);                              // state closes it, not the browser, so the two cannot disagree
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(false);
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    esc(galleryDialog(h));
    expect(galleryDialog(h).hasAttribute("open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(section(h)).not.toBeNull();
  });
  it("a photograph tapped just after another was closed is never lost, even when the browser's close event arrives late (the real-browser failure)", () => {
    deferCloseEvents = true;
    const h = page(); open(h);
    click(thumb(h, 1)); expect(viewerDialog(h)!.hasAttribute("open")).toBe(true);
    click(byLabel(viewerDialog(h)!, "Close"));                                              // closed now; its close event has not been delivered yet
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(false);
    click(thumb(h, 2));                                                                     // the next tap, before that event arrives
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(true);
    expect(viewerDialog(h)!.querySelector("img")!.getAttribute("alt")).toBe(images[1].alt);
    flushCloseEvents();                                                                     // the stale event finally arrives: it must not close the new one
    expect(viewerDialog(h)!.hasAttribute("open")).toBe(true);
    expect(viewerDialog(h)!.querySelector("img")!.getAttribute("alt")).toBe(images[1].alt);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
  it("the same holds for the gallery: pressing View All again right after closing it opens it, and a late close event does not close it", () => {
    deferCloseEvents = true;
    const h = page(); open(h);
    click(byLabel(galleryDialog(h), "Close portfolio gallery"));
    expect(galleryDialog(h).hasAttribute("open")).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    click([...section(h)!.querySelectorAll("button")].find((b) => b.textContent === "View All")!);
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    flushCloseEvents();
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    expect(galleryDialog(h).querySelectorAll('button[aria-label^="Enlarge photograph"]')).toHaveLength(N);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
  it("stays consistent through a rapid open / close / open sequence over many photographs (no stuck state, the page ends unlocked)", () => {
    deferCloseEvents = true;
    const h = page(); open(h);
    for (let n = 1; n <= N; n++) {
      click(thumb(h, n));
      expect(viewerDialog(h)!.hasAttribute("open"), `photograph ${n} opens`).toBe(true);
      expect(viewerDialog(h)!.textContent).toContain(`${n} / ${N}`);
      click(byLabel(viewerDialog(h)!, "Close"));
    }
    flushCloseEvents();
    expect(galleryDialog(h).hasAttribute("open")).toBe(true);
    click(byLabel(galleryDialog(h), "Close portfolio gallery"));
    flushCloseEvents();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.querySelectorAll("dialog[open]").length).toBe(0);
  });
});

describe("the page scroll lock", () => {
  it("is held until every layer that took it has released it", () => {
    acquireScrollLock(); acquireScrollLock();
    expect(document.documentElement.style.overflow).toBe("hidden");
    releaseScrollLock(); expect(document.documentElement.style.overflow).toBe("hidden");
    releaseScrollLock(); expect(document.documentElement.style.overflow).toBe("");
    releaseScrollLock(); expect(document.documentElement.style.overflow).toBe("");          // an extra release is harmless
  });
});
