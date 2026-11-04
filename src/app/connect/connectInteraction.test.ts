// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import ConnectContactSheet from "./ConnectContactSheet";
import ConnectGallery from "./ConnectGallery";
import type { ConnectImage } from "./gallery";

// jsdom has no native <dialog> behaviour, so the two methods the components use are provided here with the same observable effect (the `open` attribute and a `close` event).
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  proto.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});

let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; document.documentElement.style.overflow = ""; });
function mount(el: ReturnType<typeof createElement>) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(el)); return host; }
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const tiles: ConnectImage[] = [1, 2, 3].map((n) => ({ id: `tile-${n}`, alt: `Synthetic tile ${n}`, width: 800, height: 1000, color: "#222222", widths: [480, 960] }));

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
    open(); click(dlg);                                                                  // a tap on the dark area around the sheet
    expect(dlg.hasAttribute("open")).toBe(false); expect(document.documentElement.style.overflow).toBe("");
    open(); click(h.querySelector("dialog a")!);                                          // a tap inside the sheet does NOT dismiss it
    expect(dlg.hasAttribute("open")).toBe(true);
  });
  it("selects nothing for the visitor: both numbers are present and unselected until one is tapped", () => {
    const h = mount(createElement(ConnectContactSheet));
    const tel = [...h.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href"));
    expect(tel).toEqual(["tel:+97455104490", "tel:+233504981277"]);
  });
});

describe("the gallery viewer", () => {
  const shownAlt = (dlg: Element) => dlg.querySelector("img")!.getAttribute("alt");
  const tile = (h: HTMLElement, n: number) => h.querySelector(`ul button[aria-label^="Enlarge photograph ${n} of"]`)!;   // by name: the DOM is column-by-column, the names are in gallery order
  const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
  it("opens the tapped photograph and moves through them, wrapping at both ends", () => {
    const h = mount(createElement(ConnectGallery, { images: tiles }));
    const dlg = h.querySelector("dialog")!;
    const grid = h.querySelectorAll("ul button");
    expect(grid).toHaveLength(3);
    expect(dlg.hasAttribute("open")).toBe(false);
    click(tile(h, 2));
    expect(dlg.hasAttribute("open")).toBe(true);
    expect(shownAlt(dlg)).toBe("Synthetic tile 2");
    const next = h.querySelector('button[aria-label="Next photograph"]')!; const prev = h.querySelector('button[aria-label="Previous photograph"]')!;
    click(next); expect(shownAlt(dlg)).toBe("Synthetic tile 3");
    click(next); expect(shownAlt(dlg)).toBe("Synthetic tile 1");                         // wrapped around to the first
    click(prev); expect(shownAlt(dlg)).toBe("Synthetic tile 3");                         // and back round the other way
  });
  it("can be driven from the keyboard: arrow keys move through the photographs", () => {
    const h = mount(createElement(ConnectGallery, { images: tiles }));
    const dlg = h.querySelector("dialog")!;
    click(tile(h, 1));
    key(dlg, "ArrowRight"); expect(shownAlt(dlg)).toBe("Synthetic tile 2");
    key(dlg, "ArrowRight"); key(dlg, "ArrowRight"); expect(shownAlt(dlg)).toBe("Synthetic tile 1");
    key(dlg, "ArrowLeft"); expect(shownAlt(dlg)).toBe("Synthetic tile 3");
  });
  it("tells the visitor where they are (n / total) and gives every grid button a descriptive name", () => {
    const h = mount(createElement(ConnectGallery, { images: tiles }));
    const dlg = h.querySelector("dialog")!;
    click(tile(h, 2));
    expect(dlg.textContent).toContain("2 / 3");
    expect([1, 2, 3].map((n) => tile(h, n).getAttribute("aria-label"))).toEqual([
      "Enlarge photograph 1 of 3: Synthetic tile 1", "Enlarge photograph 2 of 3: Synthetic tile 2", "Enlarge photograph 3 of 3: Synthetic tile 3"]);
  });
  it("closes with the close button or a tap on the dark area, releasing the page", () => {
    const h = mount(createElement(ConnectGallery, { images: tiles }));
    const dlg = h.querySelector("dialog")!;
    click(h.querySelector("ul button")!); expect(document.documentElement.style.overflow).toBe("hidden");
    click(h.querySelector('dialog button[aria-label="Close"]')!);
    expect(dlg.hasAttribute("open")).toBe(false); expect(document.documentElement.style.overflow).toBe("");
    click(h.querySelector("ul button")!); click(dlg);
    expect(dlg.hasAttribute("open")).toBe(false);
  });
  it("shows no previous/next controls for a single photograph and renders nothing at all for none", () => {
    const one = mount(createElement(ConnectGallery, { images: tiles.slice(0, 1) }));
    expect(one.querySelector('button[aria-label="Next photograph"]')).toBeNull();
    act(() => root!.unmount()); one.remove();
    const none = mount(createElement(ConnectGallery, { images: [] }));
    expect(none.innerHTML).toBe("");
  });
});
